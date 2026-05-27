import { NextResponse } from "next/server"
import { createServiceClient as createClient } from "@/lib/supabase/server"
import { getAccessToken, executeDAXQuery, getDatasetLastRefresh } from "@/lib/powerbi"
import { getCatalogMap, getExecutionTarget } from "@/lib/automation-catalog"
import { buildCsvContent, buildExcelContent, buildHtmlReport, buildSummaryCardsFromResult, buildTextReport } from "@/lib/report-export"
import { buildPdfFromHtml } from "@/lib/report-pdf"
import { BRAND_LOGO_PATH } from "@/lib/branding"
import { buildDAXQuery } from "@/lib/dax-builder"
import { resolveRequestCompanyContext, type RequestCompanyContext } from "@/lib/n8n-auth"
import { normalizeContactForResponse } from "@/lib/contact-compat"
import { executeWithQueryFallback } from "@/lib/query-execution-fallback"
import { normalizeFilters } from "@/lib/query-filters"
import { getRequestContext } from "@/lib/tenant"
import {
  getStoredAutomationById,
  isMissingAutomationRelationError,
  listContactsByIds,
  touchStoredAutomationLastRunAt,
} from "@/lib/automation-storage"
import type { QueryFilter, SelectedColumn, SelectedMeasure } from "@/lib/types"
import { sendWhatsAppBotMessage } from "@/lib/whatsapp-bot"
import {
  getWorkspaceAccessScope,
  isDatasetAllowed,
  isWorkspaceAllowed,
} from "@/lib/workspace-access"

type ContactRecord = {
  id: string
  name: string
  phone: string | null
  type?: string | null
  whatsapp_group_id?: string | null
  bot_instance_id?: string | null
  is_active?: boolean | null
}

type ScheduleContext = {
  id: string
  name: string
  cron_expression: string | null
  is_active: boolean | null
}

function getDispatchLogTarget(contact: ContactRecord) {
  return contact.phone || contact.whatsapp_group_id || contact.name || "destino-desconhecido"
}

function applyTemplate(template: string | null | undefined, values: Record<string, string | number>): string {
  const source = template?.trim() || "Segue o relatorio {name}."
  return source.replace(/\{(\w+)\}/g, (_, key: string) => String(values[key] ?? ""))
}

function normalizeSelectedColumns(input: unknown): SelectedColumn[] {
  if (!Array.isArray(input)) return []

  return input.flatMap((item) => {
    if (!item || typeof item !== "object") return []
    const record = item as Record<string, unknown>
    const tableName = typeof record.tableName === "string" ? record.tableName.trim() : ""
    const columnName = typeof record.columnName === "string" ? record.columnName.trim() : ""
    return tableName && columnName ? [{ tableName, columnName }] : []
  })
}

function normalizeSelectedMeasures(input: unknown): SelectedMeasure[] {
  if (!Array.isArray(input)) return []

  return input.flatMap((item) => {
    if (!item || typeof item !== "object") return []
    const record = item as Record<string, unknown>
    const tableName = typeof record.tableName === "string" ? record.tableName.trim() : ""
    const measureName = typeof record.measureName === "string" ? record.measureName.trim() : ""
    return tableName && measureName ? [{ tableName, measureName }] : []
  })
}

function buildSelectedItems(
  selectedColumns: SelectedColumn[],
  selectedMeasures: SelectedMeasure[]
) {
  return [
    ...selectedColumns.map((column) => `${column.tableName}.${column.columnName}`),
    ...selectedMeasures.map((measure) => measure.measureName),
  ]
}

export async function POST(request: Request) {
  try {
    // Fast path: internal call from dispatch route using platform secret + company_id in URL
    const platformSecret = process.env.PLATFORM_SCHEDULER_SECRET?.trim()
    const reqSecret = request.headers.get("x-callback-secret")?.trim() || ""
    const urlCompanyId = (() => {
      try { return new URL(request.url).searchParams.get("company_id")?.trim() || "" } catch { return "" }
    })()

    let requestCompanyContext: RequestCompanyContext
    if (platformSecret && reqSecret === platformSecret && urlCompanyId) {
      requestCompanyContext = { companyId: urlCompanyId, source: "platform" }
    } else {
      requestCompanyContext = await resolveRequestCompanyContext(request, {
        allowCallbackSecret: true,
      })
    }
    const { companyId, source } = requestCompanyContext
    const supabase = createClient()
    const accessScope =
      source === "auth"
        ? await getWorkspaceAccessScope(supabase, await getRequestContext())
        : null
    const body = await request.json()
    console.log("[automations/run] request received", {
      requestUrl: request.url,
      requestHost: request.headers.get("host")?.trim() || null,
      requestOrigin: request.headers.get("origin")?.trim() || null,
      automationId: typeof body?.automation_id === "string" ? body.automation_id : null,
      scheduleId: typeof body?.schedule_id === "string" ? body.schedule_id : null,
      exportFormat:
        typeof body?.export_format === "string" ? body.export_format : null,
      contactCount: Array.isArray(body?.contact_ids) ? body.contact_ids.length : 0,
    })

    const automationId = typeof body.automation_id === "string" ? body.automation_id : ""
    const adHocDatasetId = typeof body.dataset_id === "string" ? body.dataset_id : ""
    const adHocExecutionDatasetId =
      typeof body.execution_dataset_id === "string" ? body.execution_dataset_id : ""
    const adHocQuery = typeof body.dax_query === "string" ? body.dax_query : ""
    const hasExportFormatOverride =
      typeof body.export_format === "string" && body.export_format.trim().length > 0
    const adHocExportFormat =
      typeof body.export_format === "string" ? body.export_format : "csv"
    const hasMessageOverride = Object.prototype.hasOwnProperty.call(body, "message")
    const adHocMessage = typeof body.message === "string" ? body.message : null
    const hasContactOverrides = Array.isArray(body.contact_ids)
    const adHocContactIds = Array.isArray(body.contact_ids)
      ? body.contact_ids.filter((value: unknown): value is string => typeof value === "string")
      : []
    const scheduleIdOverride =
      typeof body.schedule_id === "string" && body.schedule_id.trim()
        ? body.schedule_id
        : null
    const hasFilterOverrides = Object.prototype.hasOwnProperty.call(body, "filters")
    const overrideFilters = normalizeFilters(body.filters)

    let datasetId = ""
    let query = ""
    let exportFormat = adHocExportFormat
    let messageTemplate: string | null = adHocMessage
    let automationName = "Consulta Personalizada"
    let contacts: ContactRecord[] = []
    let selectedItems: string[] = []
    let reportFilters: QueryFilter[] = []
    let selectedColumnsForExecution: SelectedColumn[] = []
    let selectedMeasuresForExecution: SelectedMeasure[] = []
    let scheduleContext: ScheduleContext | null = null
    const catalogs = await getCatalogMap(companyId)

    if (scheduleIdOverride) {
      const { data: schedule, error: scheduleError } = await supabase
        .from("schedules")
        .select("id, name, cron_expression, is_active")
        .eq("company_id", companyId)
        .eq("id", scheduleIdOverride)
        .maybeSingle()

      if (scheduleError) {
        throw new Error(scheduleError.message)
      }

      scheduleContext = (schedule as ScheduleContext | null) ?? null
    }

    if (automationId) {
      let automation: Record<string, unknown> | null = null
      let usingStoredAutomation = false

      const { data: dbAutomation, error: autoErr } = await supabase
        .from("automations")
        .select("*")
        .eq("company_id", companyId)
        .eq("id", automationId)
        .single()

      if (autoErr) {
        if (!isMissingAutomationRelationError(autoErr)) {
          throw new Error(autoErr.message)
        }

        const storedAutomation = await getStoredAutomationById(supabase, companyId, automationId)
        if (!storedAutomation) {
          return NextResponse.json({ error: "Automacao nao encontrada" }, { status: 404 })
        }

        automation = storedAutomation as unknown as Record<string, unknown>
        usingStoredAutomation = true
      } else if (!dbAutomation) {
        return NextResponse.json({ error: "Automacao nao encontrada" }, { status: 404 })
      } else {
        automation = dbAutomation as Record<string, unknown>
      }

      datasetId = String(automation.dataset_id)

      if (accessScope && !isDatasetAllowed(accessScope, datasetId)) {
        return NextResponse.json(
          { error: "Automacao nao permitida para este usuario." },
          { status: 403 }
        )
      }

      exportFormat = hasExportFormatOverride
        ? adHocExportFormat
        : String(automation.export_format || "csv")
      messageTemplate = hasMessageOverride
        ? adHocMessage
        : automation.message_template
          ? String(automation.message_template)
          : null
      automationName = String(automation.name || "Automacao")
      const savedSelectedColumns = normalizeSelectedColumns(automation.selected_columns)
      const savedSelectedMeasures = normalizeSelectedMeasures(automation.selected_measures)
      const savedFilters = normalizeFilters(automation.filters)
      const effectiveFilters = hasFilterOverrides ? overrideFilters : savedFilters
      selectedColumnsForExecution = savedSelectedColumns
      selectedMeasuresForExecution = savedSelectedMeasures
      reportFilters = effectiveFilters
      selectedItems = buildSelectedItems(savedSelectedColumns, savedSelectedMeasures)
      const canRebuildQuery = savedSelectedColumns.length > 0 || savedSelectedMeasures.length > 0

      if (!automation.dax_query && !canRebuildQuery) {
        return NextResponse.json(
          { error: "Automacao sem query DAX definida e sem campos suficientes para reconstruir a consulta" },
          { status: 400 }
        )
      }

      if (hasFilterOverrides || !automation.dax_query) {
        query = buildDAXQuery({
          columns: savedSelectedColumns,
          measures: savedSelectedMeasures,
          filters: effectiveFilters,
        })
        if (!query || query.startsWith("--")) {
          return NextResponse.json(
            { error: "Nao foi possivel reconstruir a query da automacao com os filtros informados" },
            { status: 400 }
          )
        }
      } else {
        query = String(automation.dax_query)
      }

      const lastRunAt = new Date().toISOString()
      if (usingStoredAutomation) {
        await touchStoredAutomationLastRunAt(supabase, companyId, automationId, lastRunAt)
      } else {
        await supabase
          .from("automations")
          .update({ last_run_at: lastRunAt })
          .eq("company_id", companyId)
          .eq("id", automationId)
      }

      if (hasContactOverrides) {
        if (adHocContactIds.length === 0) {
          contacts = []
        } else {
          const { data: selectedContacts } = await supabase
            .from("contacts")
            .select("*")
            .eq("company_id", companyId)
            .in("id", adHocContactIds)
            .eq("is_active", true)

          contacts = (selectedContacts || []).map((contact) =>
            normalizeContactForResponse(contact as ContactRecord)
          ) as ContactRecord[]
        }
      } else {
        if (usingStoredAutomation) {
          contacts = (await listContactsByIds(
            supabase,
            companyId,
            Array.isArray((automation as { contact_ids?: unknown[] }).contact_ids)
              ? ((automation as { contact_ids?: unknown[] }).contact_ids as string[])
              : []
          )) as ContactRecord[]
        } else {
          const { data: contactLinks, error: contactLinksError } = await supabase
            .from("automation_contacts")
            .select("contacts(*)")
            .eq("automation_id", automationId)

          if (contactLinksError) {
            if (!isMissingAutomationRelationError(contactLinksError)) {
              throw new Error(contactLinksError.message)
            }
          } else {
            contacts = (
              contactLinks
                ?.map((item: Record<string, unknown>) => item.contacts)
                .filter(Boolean)
                .map((contact) => normalizeContactForResponse(contact as ContactRecord)) || []
            ) as ContactRecord[]
          }
        }
      }
    } else {
      if (!adHocDatasetId || !adHocQuery) {
        return NextResponse.json(
          { error: "automation_id ou dataset_id + dax_query sao obrigatorios" },
          { status: 400 }
        )
      }

      if (accessScope && !isDatasetAllowed(accessScope, adHocDatasetId)) {
        return NextResponse.json(
          { error: "Dataset nao permitido para este usuario." },
          { status: 403 }
        )
      }

      const { data: report } = await supabase
        .from("reports")
        .select("id")
        .eq("company_id", companyId)
        .eq("dataset_id", adHocDatasetId)
        .limit(1)
        .maybeSingle()

      if (!report && !catalogs[adHocDatasetId]) {
        return NextResponse.json(
          { error: "Dataset nao pertence a empresa do usuario" },
          { status: 403 }
        )
      }

      datasetId = adHocDatasetId
      query = adHocQuery
      reportFilters = overrideFilters
      selectedColumnsForExecution = normalizeSelectedColumns(body.selected_columns)
      selectedMeasuresForExecution = normalizeSelectedMeasures(body.selected_measures)
      selectedItems = Array.isArray(body?.selectedItems)
        ? body.selectedItems.filter((item: unknown): item is string => typeof item === "string")
        : []

      if (adHocContactIds.length > 0) {
        const { data: selectedContacts } = await supabase
          .from("contacts")
          .select("*")
          .eq("company_id", companyId)
          .in("id", adHocContactIds)
          .eq("is_active", true)

        contacts = (selectedContacts || []).map((contact) =>
          normalizeContactForResponse(contact as ContactRecord)
        ) as ContactRecord[]
      }
    }

    const executionTarget = getExecutionTarget(catalogs[datasetId], datasetId)
    const executionDatasetId = adHocExecutionDatasetId || executionTarget.datasetId

    if (accessScope && !isDatasetAllowed(accessScope, executionDatasetId)) {
      return NextResponse.json(
        { error: "Dataset auxiliar de execucao nao permitido para este usuario." },
        { status: 403 }
      )
    }

    const executionWorkspaceId = executionTarget.workspaceId || null
    if (
      accessScope &&
      executionWorkspaceId &&
      !isWorkspaceAllowed(accessScope, { pbiWorkspaceId: executionWorkspaceId })
    ) {
      return NextResponse.json(
        { error: "Workspace auxiliar de execucao nao permitido para este usuario." },
        { status: 403 }
      )
    }

    const token = await getAccessToken(companyId)
    const execution = await executeWithQueryFallback({
      runQuery: (nextQuery) => executeDAXQuery(token, executionDatasetId, nextQuery),
      query,
      filters: reportFilters,
      selectedColumns: selectedColumnsForExecution,
      selectedMeasures: selectedMeasuresForExecution,
    })
    const result = execution.result
    const rowCount = result.rows.length
    const generatedAt = new Date()
    const reportTitle = automationName
    const csvContent = buildCsvContent(result)
    const textReport = buildTextReport(result)
    const summaryCards = buildSummaryCardsFromResult(result)
    const datasetRefreshedAt = await (executionWorkspaceId
      ? getDatasetLastRefresh(token, executionWorkspaceId, executionDatasetId)
      : Promise.resolve(null))
    const htmlReport = buildHtmlReport({
      title: reportTitle,
      subtitle:
        executionDatasetId === datasetId
          ? `Dataset ${datasetId}`
          : `Dataset origem ${datasetId} | Execucao ${executionDatasetId}`,
      generatedAt,
      selectedItems,
      selectedColumns: selectedColumnsForExecution,
      filters: execution.appliedFilters,
      brandLogoUrl: new URL(BRAND_LOGO_PATH, request.url).toString(),
      summaryCards,
      result,
      datasetRefreshedAt,
    })

    if (contacts.length > 0) {
      // Resolve fallback instance ID for contacts without bot_instance_id
      let defaultBotInstanceId: string | null = null
      if (contacts.some((c) => !c.bot_instance_id)) {
        const { data: defaultInstance } = await supabase
          .from("whatsapp_bot_instances")
          .select("id")
          .eq("company_id", companyId)
          .eq("is_default", true)
          .limit(1)
          .maybeSingle()

        if (defaultInstance?.id) {
          defaultBotInstanceId = defaultInstance.id
        } else {
          const { data: firstInstance } = await supabase
            .from("whatsapp_bot_instances")
            .select("id")
            .eq("company_id", companyId)
            .order("created_at", { ascending: true })
            .limit(1)
            .maybeSingle()
          defaultBotInstanceId = firstInstance?.id ?? null
        }
      }

      const logEntries = contacts.map((contact) => ({
        company_id: companyId,
        schedule_id: scheduleIdOverride,
        report_name: reportTitle,
        contact_name: String(contact.name || ""),
        contact_phone: getDispatchLogTarget(contact),
        status: "pending",
        export_format: exportFormat,
      }))

      const { data: logs, error: insertLogsError } = await supabase
        .from("dispatch_logs")
        .insert(logEntries)
        .select("id")

      if (insertLogsError) {
        return NextResponse.json(
          { error: `Nao foi possivel criar logs do disparo: ${insertLogsError.message}` },
          { status: 500 }
        )
      }

      const message = applyTemplate(messageTemplate, {
        name: reportTitle,
        row_count: rowCount,
        format: exportFormat,
      })

      console.log("[automations/run] sending directly via bot", {
        companyId,
        scheduleId: scheduleContext?.id ?? scheduleIdOverride,
        automationName: reportTitle,
        exportFormat,
        contactCount: contacts.length,
        rowCount,
      })

      let pdfBuffer: Buffer | null = null
      if (exportFormat === "pdf") {
        pdfBuffer = await buildPdfFromHtml(htmlReport)
      }
      let xlsxBuffer: Buffer | null = null
      if (exportFormat === "xlsx") {
        xlsxBuffer = buildExcelContent(result, reportTitle)
      }

      for (const [index, contact] of contacts.entries()) {
        const log = logs?.[index]

        if (log) {
          await supabase
            .from("dispatch_logs")
            .update({ status: "sending" })
            .eq("company_id", companyId)
            .eq("id", log.id)
        }

        try {
          let sendPayload: Parameters<typeof sendWhatsAppBotMessage>[0]

          const instanceId = contact.bot_instance_id ?? defaultBotInstanceId

          if (exportFormat === "table") {
            sendPayload = {
              instance_id: instanceId,
              phone: contact.phone,
              whatsapp_group_id: contact.whatsapp_group_id,
              message: `${message}\n\n${textReport}`,
            }
          } else if (exportFormat === "csv") {
            sendPayload = {
              instance_id: instanceId,
              phone: contact.phone,
              whatsapp_group_id: contact.whatsapp_group_id,
              message,
              document_base64: Buffer.from(csvContent, "utf-8").toString("base64"),
              file_name: `${reportTitle}.csv`,
              mimetype: "text/csv",
            }
          } else if (exportFormat === "xlsx") {
            sendPayload = {
              instance_id: instanceId,
              phone: contact.phone,
              whatsapp_group_id: contact.whatsapp_group_id,
              message,
              document_base64: xlsxBuffer!.toString("base64"),
              file_name: `${reportTitle}.xlsx`,
              mimetype: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
            }
          } else {
            sendPayload = {
              instance_id: instanceId,
              phone: contact.phone,
              whatsapp_group_id: contact.whatsapp_group_id,
              message,
              document_base64: pdfBuffer!.toString("base64"),
              file_name: `${reportTitle}.pdf`,
              mimetype: "application/pdf",
            }
          }

          try {
            await sendWhatsAppBotMessage(sendPayload)
          } catch (sendErr) {
            // If instance not connected, retry with default instance
            const notConnected =
              sendErr instanceof Error &&
              (sendErr.message.includes("nao conectado") || sendErr.message.includes("not connected"))
            if (notConnected && sendPayload.instance_id !== defaultBotInstanceId && defaultBotInstanceId) {
              await sendWhatsAppBotMessage({ ...sendPayload, instance_id: defaultBotInstanceId })
            } else {
              throw sendErr
            }
          }

          if (log) {
            await supabase
              .from("dispatch_logs")
              .update({
                status: "delivered",
                error_message: null,
                completed_at: new Date().toISOString(),
              })
              .eq("company_id", companyId)
              .eq("id", log.id)
          }
        } catch (error) {
          const errorMsg = error instanceof Error ? error.message : "Erro ao enviar para o bot"
          if (log) {
            await supabase
              .from("dispatch_logs")
              .update({
                status: "failed",
                error_message: errorMsg,
                completed_at: new Date().toISOString(),
              })
              .eq("company_id", companyId)
              .eq("id", log.id)
          }
        }
      }
    }

    return NextResponse.json({
      success: true,
      rowCount,
      result,
      report: {
        title: reportTitle,
        generated_at: generatedAt.toISOString(),
        export_format: exportFormat,
        executed_dataset_id: executionDatasetId,
        csv: csvContent,
        text: textReport,
        html: htmlReport,
      },
      contacts_notified: contacts.length,
    })
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Erro desconhecido" },
      { status: 500 }
    )
  }
}
