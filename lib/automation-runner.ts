import { createServiceClient } from "@/lib/supabase/server"
import { getAccessToken, executeDAXQuery, getDatasetLastRefresh } from "@/lib/powerbi"
import { getCatalogMap, getExecutionTarget } from "@/lib/automation-catalog"
import { buildCsvContent, buildExcelContent, buildHtmlReport, buildSummaryCardsFromResult, buildTextReport } from "@/lib/report-export"
import { buildPdfFromHtml } from "@/lib/report-pdf"
import { BRAND_LOGO_PATH } from "@/lib/branding"
import { buildDAXQuery } from "@/lib/dax-builder"
import { normalizeContactForResponse } from "@/lib/contact-compat"
import { executeWithQueryFallback } from "@/lib/query-execution-fallback"
import { normalizeFilters } from "@/lib/query-filters"
import {
  getStoredAutomationById,
  isMissingAutomationRelationError,
  listContactsByIds,
  touchStoredAutomationLastRunAt,
} from "@/lib/automation-storage"
import type { QueryFilter, SelectedColumn, SelectedMeasure } from "@/lib/types"
import { sendWhatsAppBotMessage } from "@/lib/whatsapp-bot"

export interface RunStoredAutomationParams {
  companyId: string
  automationId: string
  exportFormat: string
  messageOverride: string | null
  contactIds: string[]
  scheduleId: string | null
  botInstanceId: string | null
  appBaseUrl: string
}

export interface RunStoredAutomationResult {
  success: true
  rowCount: number
  contacts_notified: number
  report_name: string
}

type ContactRecord = {
  id: string
  name: string
  phone: string | null
  type?: string | null
  whatsapp_group_id?: string | null
  bot_instance_id?: string | null
  is_active?: boolean | null
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

function buildSelectedItems(selectedColumns: SelectedColumn[], selectedMeasures: SelectedMeasure[]) {
  return [
    ...selectedColumns.map((c) => `${c.tableName}.${c.columnName}`),
    ...selectedMeasures.map((m) => m.measureName),
  ]
}

export async function runStoredAutomation(params: RunStoredAutomationParams): Promise<RunStoredAutomationResult> {
  const {
    companyId,
    automationId,
    exportFormat: exportFormatParam,
    messageOverride,
    contactIds,
    scheduleId,
    botInstanceId,
    appBaseUrl,
  } = params

  const supabase = createServiceClient()

  // Fetch automation
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
    const stored = await getStoredAutomationById(supabase, companyId, automationId)
    if (!stored) throw new Error("Automacao nao encontrada")
    automation = stored as unknown as Record<string, unknown>
    usingStoredAutomation = true
  } else if (!dbAutomation) {
    throw new Error("Automacao nao encontrada")
  } else {
    automation = dbAutomation as Record<string, unknown>
  }

  const datasetId = String(automation.dataset_id)
  const exportFormat = exportFormatParam || String(automation.export_format || "csv")
  const messageTemplate = messageOverride ?? (automation.message_template ? String(automation.message_template) : null)
  const automationName = String(automation.name || "Automacao")

  const savedSelectedColumns = normalizeSelectedColumns(automation.selected_columns)
  const savedSelectedMeasures = normalizeSelectedMeasures(automation.selected_measures)
  const savedFilters = normalizeFilters(automation.filters) as QueryFilter[]
  const selectedItems = buildSelectedItems(savedSelectedColumns, savedSelectedMeasures)

  const canRebuildQuery = savedSelectedColumns.length > 0 || savedSelectedMeasures.length > 0
  if (!automation.dax_query && !canRebuildQuery) {
    throw new Error("Automacao sem query DAX definida e sem campos suficientes para reconstruir a consulta")
  }

  const { data: featureRows } = await supabase
    .from("company_settings")
    .select("key, value")
    .eq("company_id", companyId)
    .eq("key", "features")
    .maybeSingle()
  const companyFeatures = (featureRows?.value ?? {}) as Record<string, unknown>
  const useCalculatetable = companyFeatures.dax_calculatetable === true
  const hideZeroRows = companyFeatures.hide_zero_rows === true
  const preserveGroupByContext = companyFeatures.dax_preserve_groupby === true

  let query: string
  if (!automation.dax_query) {
    query = buildDAXQuery({ columns: savedSelectedColumns, measures: savedSelectedMeasures, filters: savedFilters, useCalculatetable, hideZeroRows, preserveGroupByContext })
    if (!query || query.startsWith("--")) {
      throw new Error("Nao foi possivel reconstruir a query da automacao")
    }
  } else {
    query = String(automation.dax_query)
  }

  // Update last_run_at
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

  // Resolve contacts
  let contacts: ContactRecord[] = []
  if (contactIds.length > 0) {
    let contactsQuery = supabase
      .from("contacts")
      .select("*")
      .eq("company_id", companyId)
      .in("id", contactIds)
      .eq("is_active", true)

    if (botInstanceId && contactIds.length === 0) {
      contactsQuery = contactsQuery.eq("bot_instance_id", botInstanceId)
    }

    const { data: selectedContacts } = await contactsQuery
    contacts = (selectedContacts || []).map((c) => normalizeContactForResponse(c as ContactRecord)) as ContactRecord[]
  } else if (usingStoredAutomation) {
    const storedContactIds = Array.isArray((automation as { contact_ids?: unknown[] }).contact_ids)
      ? ((automation as { contact_ids?: unknown[] }).contact_ids as string[])
      : []
    contacts = (await listContactsByIds(supabase, companyId, storedContactIds)) as ContactRecord[]
  } else {
    const { data: contactLinks, error: contactLinksError } = await supabase
      .from("automation_contacts")
      .select("contacts(*)")
      .eq("automation_id", automationId)

    if (contactLinksError && !isMissingAutomationRelationError(contactLinksError)) {
      throw new Error(contactLinksError.message)
    }

    contacts = (
      contactLinks
        ?.map((item: Record<string, unknown>) => item.contacts)
        .filter(Boolean)
        .map((c) => normalizeContactForResponse(c as ContactRecord)) || []
    ) as ContactRecord[]
  }

  // Execute DAX
  const catalogs = await getCatalogMap(companyId)
  const executionTarget = getExecutionTarget(catalogs[datasetId], datasetId)
  const executionDatasetId = executionTarget.datasetId
  const executionWorkspaceId = executionTarget.workspaceId || null

  const token = await getAccessToken(companyId)
  const execution = await executeWithQueryFallback({
    runQuery: (nextQuery) => executeDAXQuery(token, executionDatasetId, nextQuery),
    query,
    filters: savedFilters,
    selectedColumns: savedSelectedColumns,
    selectedMeasures: savedSelectedMeasures,
  })

  const result = execution.result
  const rowCount = result.rows.length
  const generatedAt = new Date()
  const csvContent = buildCsvContent(result)
  const textReport = buildTextReport(result)

  const summaryCards = buildSummaryCardsFromResult(result)
  const datasetRefreshedAt = await (executionWorkspaceId
    ? getDatasetLastRefresh(token, executionWorkspaceId, executionDatasetId)
    : Promise.resolve(null))

  const brandLogoUrl = `${appBaseUrl.replace(/\/+$/, "")}${BRAND_LOGO_PATH}`
  const htmlReport = buildHtmlReport({
    title: automationName,
    subtitle:
      executionDatasetId === datasetId
        ? `Dataset ${datasetId}`
        : `Dataset origem ${datasetId} | Execucao ${executionDatasetId}`,
    generatedAt,
    selectedItems,
    selectedColumns: savedSelectedColumns,
    filters: execution.appliedFilters,
    brandLogoUrl,
    summaryCards,
    result,
    datasetRefreshedAt,
  })

  if (contacts.length === 0) {
    return { success: true, rowCount, contacts_notified: 0, report_name: automationName }
  }

  // Create dispatch logs
  const logEntries = contacts.map((contact) => ({
    company_id: companyId,
    schedule_id: scheduleId,
    report_name: automationName,
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
    throw new Error(`Nao foi possivel criar logs do disparo: ${insertLogsError.message}`)
  }

  const message = applyTemplate(messageTemplate, {
    name: automationName,
    row_count: rowCount,
    format: exportFormat,
  })

  let pdfBuffer: Buffer | null = null
  if (exportFormat === "pdf") {
    pdfBuffer = await buildPdfFromHtml(htmlReport)
  }
  let xlsxBuffer: Buffer | null = null
  if (exportFormat === "xlsx") {
    xlsxBuffer = buildExcelContent(result, automationName)
  }

  // Resolve bot instance: schedule param → automation's own → company default → first
  const automationBotInstanceId = automation.bot_instance_id ? String(automation.bot_instance_id) : null
  let effectiveBotInstanceId: string | null = botInstanceId ?? automationBotInstanceId
  if (!effectiveBotInstanceId) {
    const { data: defaultInst } = await supabase
      .from("whatsapp_bot_instances")
      .select("id")
      .eq("company_id", companyId)
      .eq("is_default", true)
      .limit(1)
      .maybeSingle()
    effectiveBotInstanceId = defaultInst?.id ?? null

    if (!effectiveBotInstanceId) {
      const { data: firstInst } = await supabase
        .from("whatsapp_bot_instances")
        .select("id")
        .eq("company_id", companyId)
        .order("created_at", { ascending: true })
        .limit(1)
        .maybeSingle()
      effectiveBotInstanceId = firstInst?.id ?? null
    }
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
      const instanceId = contact.bot_instance_id ?? effectiveBotInstanceId

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
          file_name: `${automationName}.csv`,
          mimetype: "text/csv",
        }
      } else if (exportFormat === "xlsx") {
        sendPayload = {
          instance_id: instanceId,
          phone: contact.phone,
          whatsapp_group_id: contact.whatsapp_group_id,
          message,
          document_base64: xlsxBuffer!.toString("base64"),
          file_name: `${automationName}.xlsx`,
          mimetype: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
        }
      } else {
        sendPayload = {
          instance_id: instanceId,
          phone: contact.phone,
          whatsapp_group_id: contact.whatsapp_group_id,
          message,
          document_base64: pdfBuffer!.toString("base64"),
          file_name: `${automationName}.pdf`,
          mimetype: "application/pdf",
        }
      }

      await sendWhatsAppBotMessage(sendPayload)

      if (log) {
        await supabase
          .from("dispatch_logs")
          .update({ status: "delivered", error_message: null, completed_at: new Date().toISOString() })
          .eq("company_id", companyId)
          .eq("id", log.id)
      }
    } catch (error) {
      const errorMsg = error instanceof Error ? error.message : "Erro ao enviar para o bot"
      if (log) {
        await supabase
          .from("dispatch_logs")
          .update({ status: "failed", error_message: errorMsg, completed_at: new Date().toISOString() })
          .eq("company_id", companyId)
          .eq("id", log.id)
      }
    }
  }

  return { success: true, rowCount, contacts_notified: contacts.length, report_name: automationName }
}
