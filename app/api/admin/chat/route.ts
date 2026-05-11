import { NextResponse } from "next/server"
import { createClient } from "@supabase/supabase-js"
import { requireAdminContext } from "@/lib/tenant"
import {
  extractWebhookAnswer,
  extractWebhookChartPayload,
  type ChatRequest,
  type ChatApiResponse,
} from "@/lib/chat"

function getAdminClient() {
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
    { auth: { autoRefreshToken: false, persistSession: false } }
  )
}

function buildSessionId(userId: string, companyId: string, datasetId: string): string {
  return `admin:${userId}:${companyId}:${datasetId}`
}

export async function POST(request: Request) {
  try {
    const adminContext = await requireAdminContext()
    const supabase = getAdminClient()

    const body = (await request.json()) as ChatRequest & { companyId: string }
    const { question, datasetId, workspaceId, companyId } = body

    if (!companyId) {
      return NextResponse.json<ChatApiResponse>(
        { answer: "Selecione uma empresa.", data: null, daxQuery: null, confidence: "low" },
        { status: 400 }
      )
    }

    if (!question?.trim()) {
      return NextResponse.json<ChatApiResponse>(
        { answer: "Por favor, faça uma pergunta.", data: null, daxQuery: null, confidence: "low" },
        { status: 400 }
      )
    }

    // ── Validar workspace ──
    const { data: workspace } = await supabase
      .from("workspaces")
      .select("id")
      .eq("company_id", companyId)
      .eq("pbi_workspace_id", workspaceId)
      .single()

    if (!workspace) {
      return NextResponse.json<ChatApiResponse>(
        { answer: "Workspace não pertence a esta empresa.", data: null, daxQuery: null, confidence: "low" },
        { status: 403 }
      )
    }

    // ── Resolver URL do webhook ──
    const { data: settingsRows } = await supabase
      .from("company_settings")
      .select("key, value")
      .eq("company_id", companyId)
      .in("key", ["chat_ia", "n8n"])

    const settingsMap = new Map(
      (settingsRows ?? []).map((row) => [row.key, row.value as Record<string, unknown> | null])
    )

    const chatIaSettings = settingsMap.get("chat_ia")
    const n8nSettings = settingsMap.get("n8n")

    const webhookUrl =
      (typeof chatIaSettings?.webhook_url === "string" && chatIaSettings.webhook_url.trim()
        ? chatIaSettings.webhook_url.trim()
        : null) ||
      (typeof n8nSettings?.chat_webhook_url === "string" && n8nSettings.chat_webhook_url.trim()
        ? n8nSettings.chat_webhook_url.trim()
        : null)

    if (!webhookUrl) {
      return NextResponse.json<ChatApiResponse>(
        {
          answer: "Nenhum webhook de chat configurado para esta empresa.",
          data: null,
          daxQuery: null,
          confidence: "low",
          error: "Webhook não configurado",
        },
        { status: 503 }
      )
    }

    // ── Chamar webhook n8n ──
    const sessionId = buildSessionId(adminContext.userId, companyId, datasetId ?? "")

    const webhookRes = await fetch(webhookUrl, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        chatInput: question,
        sessionId,
        datasetId: datasetId ?? null,
        workspaceId: workspaceId ?? null,
      }),
    })

    if (!webhookRes.ok) {
      const errText = await webhookRes.text().catch(() => "")
      throw new Error(`Webhook retornou ${webhookRes.status}: ${errText}`)
    }

    const payload = await webhookRes.json() as Record<string, unknown>
    const chartPayload = extractWebhookChartPayload(payload)
    const rawAnswer = extractWebhookAnswer(payload)
    const answer =
      chartPayload.data &&
      (!rawAnswer.trim() || rawAnswer.trim().startsWith("{") || rawAnswer.trim().startsWith("["))
        ? "Aqui está o gráfico solicitado."
        : rawAnswer

    return NextResponse.json<ChatApiResponse>({
      answer,
      data: chartPayload.data,
      daxQuery: null,
      confidence: "high",
      chartType: chartPayload.chartType,
    })
  } catch (error) {
    const message = error instanceof Error ? error.message : "Erro desconhecido"
    return NextResponse.json<ChatApiResponse>(
      { answer: `Erro: ${message}`, data: null, daxQuery: null, confidence: "low", error: message },
      { status: 500 }
    )
  }
}
