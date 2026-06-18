import { NextRequest, NextResponse } from "next/server"
import { createServiceClient as createClient } from "@/lib/supabase/server"
import { generateAndSendReportAudio } from "@/lib/audio-generation"

function getSecret(request: NextRequest, body: Record<string, unknown>) {
  const header = request.headers.get("x-callback-secret")?.trim()
  const auth = request.headers.get("authorization")?.trim()
  const bearer = auth?.toLowerCase().startsWith("bearer ") ? auth.slice(7).trim() : null
  const bodySecret = typeof body?.callback_secret === "string" ? body.callback_secret.trim() : ""
  return header || bearer || bodySecret || ""
}

async function resolveCompanyId(
  supabase: ReturnType<typeof createClient>,
  secret: string,
  bodyCompanyId: string | null
): Promise<string | null> {
  const platformSecret = process.env.PLATFORM_SCHEDULER_SECRET?.trim()
  if (platformSecret && secret === platformSecret) {
    return bodyCompanyId
  }

  const { data } = await supabase
    .from("company_settings")
    .select("company_id, value")
    .eq("key", "n8n")

  const match = (data ?? []).find((row) => {
    const value = row.value as Record<string, unknown> | null
    return typeof value?.callback_secret === "string" && value.callback_secret.trim() === secret
  })

  return match?.company_id ?? null
}

export async function POST(request: NextRequest) {
  try {
    const body = await request.json() as Record<string, unknown>
    const supabase = createClient()
    const secret = getSecret(request, body)

    if (!secret) {
      return NextResponse.json({ error: "callback_secret obrigatorio" }, { status: 401 })
    }

    const bodyCompanyId = typeof body?.company_id === "string" ? body.company_id.trim() : null
    const companyId = await resolveCompanyId(supabase, secret, bodyCompanyId)

    if (!companyId) {
      return NextResponse.json({ error: "Nao autorizado" }, { status: 401 })
    }

    const reportId = typeof body?.report_id === "string" ? body.report_id.trim() : null
    const reportName = typeof body?.report_name === "string" ? body.report_name.trim() : "Relatório"
    const datasetId = typeof body?.dataset_id === "string" ? body.dataset_id.trim() : null
    const botInstanceId = typeof body?.bot_instance_id === "string" ? body.bot_instance_id.trim() : null
    const voice = typeof body?.voice === "string" ? body.voice.trim() : undefined

    const rawContacts = Array.isArray(body?.contacts) ? (body.contacts as unknown[]) : []
    const contacts = (rawContacts as Array<Record<string, unknown>>)
      .map((c) => ({
        phone: typeof c?.phone === "string" ? c.phone.trim() || null : null,
        whatsapp_group_id:
          typeof c?.whatsapp_group_id === "string" ? c.whatsapp_group_id.trim() || null : null,
      }))
      .filter((c) => c.phone || c.whatsapp_group_id)

    if (!reportId || !datasetId) {
      return NextResponse.json({ error: "report_id e dataset_id obrigatorios" }, { status: 400 })
    }

    if (contacts.length === 0) {
      return NextResponse.json({ error: "Nenhum contato valido informado" }, { status: 400 })
    }

    const result = await generateAndSendReportAudio({
      companyId,
      reportId,
      reportName,
      datasetId,
      contacts,
      botInstanceId,
      voice,
    })

    return NextResponse.json({ ok: true, sent: result.sent, error: result.error ?? null })
  } catch (err) {
    console.error("[api/audio/dispatch] erro", err)
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "Erro ao gerar audio" },
      { status: 500 }
    )
  }
}
