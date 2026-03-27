import { NextRequest, NextResponse } from "next/server"
import { createServiceClient as createClient } from "@/lib/supabase/server"
import { resolveRequestCompanyContext } from "@/lib/n8n-auth"
import { normalizeContactForResponse } from "@/lib/contact-compat"
import {
  getStoredAutomationById,
  isMissingAutomationRelationError,
} from "@/lib/automation-storage"
import {
  buildDispatchTargets,
  buildN8nCallbackHeaders,
  buildN8nEndpointUrls,
  normalizeN8nSettings,
} from "@/lib/n8n-webhook"
import {
  getPrimarySchedulePageName,
  resolveSchedulePageNames,
} from "@/lib/schedule-pages"
import { sanitizeFileName } from "@/lib/powerbi-report-pdf"
import { sendWhatsAppBotMessage } from "@/lib/whatsapp-bot"

function getDispatchLogTarget(contact: {
  phone?: string | null
  whatsapp_group_id?: string | null
  name?: string | null
}) {
  return contact.phone || contact.whatsapp_group_id || contact.name || "destino-desconhecido"
}

function normalizeAutomationExportFormat(value: unknown) {
  const normalized = typeof value === "string" ? value.trim().toLowerCase() : ""
  if (normalized === "table" || normalized === "csv" || normalized === "pdf") {
    return normalized
  }
  if (normalized === "png" || normalized === "pptx") {
    return "pdf"
  }
  return "pdf"
}

function getRequestOrigin(request: NextRequest) {
  return (
    process.env.NEXT_PUBLIC_APP_URL?.trim() ||
    request.headers.get("origin") ||
    new URL(request.url).origin
  )
}

function getPageAttachmentLabel(pageName: string, index: number) {
  const withoutPrefix = pageName.replace(/^ReportSection/i, "").trim()
  const normalizedLabel =
    withoutPrefix && !/^[0-9a-f-]+$/i.test(withoutPrefix)
      ? withoutPrefix
      : `pagina-${index + 1}`

  return sanitizeFileName(normalizedLabel) || `pagina-${index + 1}`
}

function buildPageAttachmentFileName(
  reportName: string,
  pageName: string,
  index: number
) {
  const safeReportName = sanitizeFileName(reportName || "relatorio") || "relatorio"
  const pageLabel = getPageAttachmentLabel(pageName, index)
  return `${safeReportName}-${pageLabel}.pdf`
}

async function readResponseErrorMessage(response: Response) {
  const raw = await response.text().catch(() => "")
  const trimmed = raw.trim()

  if (!trimmed) {
    return `Erro ${response.status}`
  }

  try {
    const parsed = JSON.parse(trimmed) as { error?: unknown } | null
    return typeof parsed?.error === "string" && parsed.error.trim()
      ? parsed.error.trim()
      : trimmed
  } catch {
    return trimmed
  }
}

export async function POST(request: NextRequest) {
  const { companyId } = await resolveRequestCompanyContext(request, {
    allowCallbackSecret: true,
  })
  const supabase = createClient()
  const body = await request.json()
  const { schedule_id } = body

  if (!schedule_id) {
    return NextResponse.json({ error: "schedule_id obrigatorio" }, { status: 400 })
  }

  const { data: schedule } = await supabase
    .from("schedules")
    .select("*")
    .eq("company_id", companyId)
    .eq("id", schedule_id)
    .single()

  if (!schedule) {
    return NextResponse.json({ error: "Rotina nao encontrada" }, { status: 404 })
  }

  const { data: report } = await supabase
    .from("reports")
    .select("*, workspaces!inner(pbi_workspace_id)")
    .eq("company_id", companyId)
    .eq("id", schedule.report_id)
    .maybeSingle()

  const { data: scContacts } = await supabase
    .from("schedule_contacts")
    .select("contact_id")
    .eq("schedule_id", schedule_id)

  const contactIds = (scContacts ?? []).map((sc) => sc.contact_id)
  const { data: contacts } = await supabase
    .from("contacts")
    .select("*")
    .eq("company_id", companyId)
    .in("id", contactIds)
    .eq("is_active", true)

  const normalizedContacts = (contacts ?? []).map((contact) =>
    normalizeContactForResponse(contact as Record<string, unknown>)
  )

  if (normalizedContacts.length === 0) {
    return NextResponse.json({ error: "Nenhum contato ativo vinculado" }, { status: 400 })
  }

  if (!report) {
    let automation:
      | { id: string; name: string; export_format?: string | null }
      | null = null

    const { data: dbAutomation, error: automationError } = await supabase
      .from("automations")
      .select("id, name, export_format")
      .eq("company_id", companyId)
      .eq("id", schedule.report_id)
      .maybeSingle()

    if (automationError) {
      if (!isMissingAutomationRelationError(automationError)) {
        return NextResponse.json({ error: automationError.message }, { status: 500 })
      }

      const storedAutomation = await getStoredAutomationById(
        supabase,
        companyId,
        schedule.report_id
      )

      automation = storedAutomation
        ? {
            id: storedAutomation.id,
            name: storedAutomation.name,
            export_format: storedAutomation.export_format,
          }
        : null
    } else {
      automation = dbAutomation
    }

    if (!automation) {
      return NextResponse.json({ error: "Relatorio nao encontrado" }, { status: 404 })
    }

    const runResponse = await fetch(new URL("/api/automations/run", request.url), {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        cookie: request.headers.get("cookie") ?? "",
        ...(request.headers.get("x-callback-secret")
          ? { "x-callback-secret": request.headers.get("x-callback-secret") as string }
          : {}),
        ...(request.headers.get("authorization")
          ? { authorization: request.headers.get("authorization") as string }
          : {}),
      },
      body: JSON.stringify({
        automation_id: automation.id,
        export_format: normalizeAutomationExportFormat(
          schedule.export_format || automation.export_format
        ),
        message: schedule.message_template ?? `Segue o relatorio ${automation.name}.`,
        contact_ids: contactIds,
        schedule_id: schedule.id,
      }),
    })

    const runPayload = await runResponse.json().catch(() => null)
    if (!runResponse.ok) {
      return NextResponse.json(
        { error: runPayload?.error || "Erro ao disparar relatorio salvo" },
        { status: runResponse.status }
      )
    }

    await supabase
      .from("schedules")
      .update({ last_run_at: new Date().toISOString() })
      .eq("company_id", companyId)
      .eq("id", schedule_id)

    return NextResponse.json({
      success: true,
      logs_created: normalizedContacts.length,
      report_name: automation.name,
      source: "created",
    })
  }

  const selectedPageNames = resolveSchedulePageNames(schedule)
  const primaryPageName = getPrimarySchedulePageName(selectedPageNames)

  if (selectedPageNames.length > 1 && schedule.export_format !== "PDF") {
    return NextResponse.json(
      {
        error:
          "Selecione varias paginas apenas quando o formato de exportacao for PDF.",
      },
      { status: 400 }
    )
  }

  const logs = normalizedContacts.map((contact) => ({
    company_id: companyId,
    schedule_id: schedule.id,
    report_name: report.name,
    contact_name: contact.name,
    contact_phone: getDispatchLogTarget(contact),
    status: "pending" as const,
    export_format: schedule.export_format,
  }))

  const { data: insertedLogs, error: insertLogsError } = await supabase
    .from("dispatch_logs")
    .insert(logs)
    .select()

  if (insertLogsError) {
    return NextResponse.json(
      { error: `Nao foi possivel criar logs do disparo: ${insertLogsError.message}` },
      { status: 500 }
    )
  }

  const message =
    schedule.message_template ?? `Segue o relatorio ${report.name} em anexo.`

  const { data: n8nSettings } = await supabase
    .from("company_settings")
    .select("value")
    .eq("company_id", companyId)
    .eq("key", "n8n")
    .single()

  const normalizedN8nSettings = normalizeN8nSettings(n8nSettings?.value)
  const webhookUrl =
    normalizedN8nSettings.webhookUrl || process.env.N8N_WEBHOOK_URL?.trim() || ""
  const callbackSecret = normalizedN8nSettings.callbackSecret

  let dispatchErrorMessage: string | null = null

  try {
    const appUrl = getRequestOrigin(request)
    const { callbackUrl, botSendUrl } = buildN8nEndpointUrls(appUrl)
    const reportExportUrl = `${appUrl.trim().replace(/\/+$/, "")}/api/reports/export`
    const callbackHeaders = buildN8nCallbackHeaders(callbackSecret)
    const dispatchTargets = buildDispatchTargets(
      normalizedContacts,
      (insertedLogs ?? []).map((log) => log.id)
    )

    if (schedule.export_format === "PDF" && selectedPageNames.length > 1) {
      if (!callbackSecret) {
        return NextResponse.json(
          { error: "Callback secret do N8N nao configurado" },
          { status: 400 }
        )
      }

      for (const [contactIndex, contact] of normalizedContacts.entries()) {
        const currentLog = insertedLogs?.[contactIndex]

        if (currentLog) {
          await supabase
            .from("dispatch_logs")
            .update({ status: "sending" })
            .eq("company_id", companyId)
            .eq("id", currentLog.id)
        }

        for (const [pageIndex, pageName] of selectedPageNames.entries()) {
          const exportResponse = await fetch(reportExportUrl, {
            method: "POST",
            headers: {
              "Content-Type": "application/json",
              "x-callback-secret": callbackSecret,
            },
            body: JSON.stringify({
              report_id: report.id,
              format: "PDF",
              pbi_page_name: pageName,
              callback_secret: callbackSecret,
            }),
          })

          if (!exportResponse.ok) {
            throw new Error(await readResponseErrorMessage(exportResponse))
          }

          const documentBase64 = Buffer.from(await exportResponse.arrayBuffer()).toString(
            "base64"
          )

          await sendWhatsAppBotMessage({
            phone: contact.phone,
            whatsapp_group_id: contact.whatsapp_group_id,
            message: pageIndex === 0 ? message : null,
            document_base64: documentBase64,
            file_name: buildPageAttachmentFileName(report.name, pageName, pageIndex),
            mimetype: "application/pdf",
          })
        }

        if (currentLog) {
          await supabase
            .from("dispatch_logs")
            .update({
              status: "delivered",
              error_message: null,
              completed_at: new Date().toISOString(),
            })
            .eq("company_id", companyId)
            .eq("id", currentLog.id)
        }
      }

      await supabase
        .from("schedules")
        .update({ last_run_at: new Date().toISOString() })
        .eq("company_id", companyId)
        .eq("id", schedule_id)

      return NextResponse.json({
        success: true,
        logs_created: (insertedLogs ?? []).length,
        attachment_mode: "one_pdf_per_page",
      })
    }

    if (!webhookUrl) {
      return NextResponse.json(
        { error: "URL do webhook N8N nao configurada" },
        { status: 400 }
      )
    }

    if (!callbackSecret) {
      return NextResponse.json(
        { error: "Callback secret do N8N nao configurado" },
        { status: 400 }
      )
    }

    const webhookResponse = await fetch(webhookUrl, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        schedule_id: schedule.id,
        schedule_name: schedule.name,
        cron_expression: schedule.cron_expression,
        is_active: schedule.is_active,
        report_name: report.name,
        app_report_id: report.id,
        report_id: report.pbi_report_id,
        workspace_id: (report as Record<string, unknown>).workspaces
          ? ((report as Record<string, unknown>).workspaces as Record<string, string>)
              .pbi_workspace_id
          : "",
        pbi_page_name: primaryPageName,
        pbi_page_names: selectedPageNames.length > 0 ? selectedPageNames : null,
        page_name: primaryPageName,
        export_format: schedule.export_format,
        report_export_url: reportExportUrl,
        report_export_headers: callbackHeaders,
        report_export_payload: {
          report_id: report.id,
          format: schedule.export_format,
          pbi_page_name: primaryPageName,
          pbi_page_names: selectedPageNames.length > 0 ? selectedPageNames : null,
          callback_secret: callbackSecret,
        },
        contacts: normalizedContacts.map((contact) => ({
          name: contact.name,
          phone: contact.phone,
          type: contact.type,
          whatsapp_group_id: contact.whatsapp_group_id,
        })),
        message,
        dispatch_log_ids: (insertedLogs ?? []).map((log) => log.id),
        dispatch_targets: dispatchTargets,
        callback_url: callbackUrl,
        callback_secret: callbackSecret,
        callback_headers: callbackHeaders,
        bot_send_url: botSendUrl,
        bot_send_headers: callbackHeaders,
      }),
    })

    if (!webhookResponse.ok) {
      const responseText = await webhookResponse.text().catch(() => "")
      throw new Error(responseText || `Webhook N8N retornou ${webhookResponse.status}`)
    }

    for (const log of insertedLogs ?? []) {
      await supabase
        .from("dispatch_logs")
        .update({ status: "sending" })
        .eq("company_id", companyId)
        .eq("id", log.id)
    }

    await supabase
      .from("schedules")
      .update({ last_run_at: new Date().toISOString() })
      .eq("company_id", companyId)
      .eq("id", schedule_id)
  } catch (error) {
    dispatchErrorMessage =
      error instanceof Error ? error.message : "Erro ao enviar para o webhook N8N"

    for (const log of insertedLogs ?? []) {
      await supabase
        .from("dispatch_logs")
        .update({
          status: "failed",
          error_message: dispatchErrorMessage,
          completed_at: new Date().toISOString(),
        })
        .eq("company_id", companyId)
        .eq("id", log.id)
    }
  }

  if (dispatchErrorMessage) {
    return NextResponse.json({ error: dispatchErrorMessage }, { status: 502 })
  }

  return NextResponse.json({ success: true, logs_created: (insertedLogs ?? []).length })
}
