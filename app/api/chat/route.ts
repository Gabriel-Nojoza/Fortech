import { NextResponse } from "next/server"
import { createServiceClient as createClient } from "@/lib/supabase/server"
import {
  buildDisabledExpiredChatIASettingsValue,
  normalizeChatIASettings,
} from "@/lib/chat-ia-config"
import { getRequestContext } from "@/lib/tenant"
import {
  extractWebhookAnswer,
  extractWebhookChartPayload,
  type ChatRequest,
  type ChatApiResponse,
} from "@/lib/chat"

// ─── helpers ─────────────────────────────────────────────────────────────────

function getCurrentMes(): string {
  const now = new Date()
  return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}`
}

function buildSessionId(userId: string, companyId: string, datasetId: string): string {
  return `${userId}:${companyId}:${datasetId}`
}

// ─── POST /api/chat ───────────────────────────────────────────────────────────

export async function POST(request: Request) {
  try {
    const context = await getRequestContext()
    const { companyId, userId } = context
    const supabase = createClient()

    const body = (await request.json()) as ChatRequest
    const { question, datasetId, workspaceId } = body

    if (!question?.trim()) {
      return NextResponse.json<ChatApiResponse>(
        { answer: "Por favor, faça uma pergunta.", data: null, daxQuery: null, confidence: "low" },
        { status: 400 }
      )
    }

    // ── Carregar settings ──
    const { data: settingsRows } = await supabase
      .from("company_settings")
      .select("key, value")
      .eq("company_id", companyId)
      .in("key", ["chat_ia", "usage_limits", "n8n"])

    const settingsMap = new Map(
      (settingsRows ?? []).map((row) => [row.key, row.value as Record<string, unknown> | null])
    )

    const chatSettingsRaw = settingsMap.get("chat_ia")
    const chatSettings = normalizeChatIASettings(chatSettingsRaw)
    const chatIAIsManaged =
      chatSettings.enabled ||
      !!chatSettings.workspaceId ||
      !!chatSettings.datasetId ||
      !!chatSettings.webhookUrl ||
      chatSettings.trialDays !== null ||
      !!chatSettings.trialEndsAt

    // ── Expiração ──
    if (chatSettings.isExpired && chatSettings.enabled) {
      await supabase
        .from("company_settings")
        .update({
          value: buildDisabledExpiredChatIASettingsValue(chatSettingsRaw),
          updated_at: new Date().toISOString(),
        })
        .eq("company_id", companyId)
        .eq("key", "chat_ia")
    }

    if (chatIAIsManaged && !chatSettings.effectiveEnabled) {
      const answer = chatSettings.isExpired
        ? "O periodo de teste do Chat IA expirou. Fale com o administrador para renovar o acesso."
        : "O Chat IA esta desativado para esta empresa."
      return NextResponse.json<ChatApiResponse>(
        { answer, data: null, daxQuery: null, confidence: "low", error: answer },
        { status: 403 }
      )
    }

    // ── Limite mensal ──
    const limitsValue = settingsMap.get("usage_limits") as Record<string, unknown> | null
    const chatLimit = typeof limitsValue?.chat_limit === "number" ? limitsValue.chat_limit : null
    const chatExcessPrice = typeof limitsValue?.chat_excess_price === "number" ? limitsValue.chat_excess_price : null

    if (chatLimit !== null && chatLimit > 0) {
      const startOfMonth = new Date()
      startOfMonth.setDate(1)
      startOfMonth.setHours(0, 0, 0, 0)

      const { count } = await supabase
        .from("chat_logs")
        .select("id", { count: "exact", head: true })
        .eq("company_id", companyId)
        .gte("created_at", startOfMonth.toISOString())

      const used = count ?? 0
      if (used >= chatLimit) {
        return NextResponse.json<ChatApiResponse>(
          {
            answer: `⚠️ Limite mensal de ${chatLimit} perguntas atingido (${used} utilizadas). Fale com o administrador para aumentar o limite.`,
            data: null,
            daxQuery: null,
            confidence: "low",
            error: "Limite de perguntas atingido",
          },
          { status: 429 }
        )
      }
    }

    // ── Resolver URL do webhook ──
    const n8nSettings = settingsMap.get("n8n") as Record<string, unknown> | null
    const webhookUrl =
      chatSettings.webhookUrl ||
      (typeof n8nSettings?.chat_webhook_url === "string" && n8nSettings.chat_webhook_url.trim()
        ? n8nSettings.chat_webhook_url.trim()
        : null)

    if (!webhookUrl) {
      return NextResponse.json<ChatApiResponse>(
        {
          answer: "Nenhum webhook de chat configurado. Configure a URL do webhook nas configurações.",
          data: null,
          daxQuery: null,
          confidence: "low",
          error: "Webhook não configurado",
        },
        { status: 503 }
      )
    }

    // ── Chamar webhook n8n ──
    const sessionId = buildSessionId(userId, companyId, datasetId ?? "")

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

    const webhookPayload = await webhookRes.json() as Record<string, unknown>
    const chartPayload = extractWebhookChartPayload(webhookPayload)
    const rawAnswer = extractWebhookAnswer(webhookPayload)
    const answer =
      chartPayload.data &&
      (!rawAnswer.trim() || rawAnswer.trim().startsWith("{") || rawAnswer.trim().startsWith("["))
        ? "Aqui está o gráfico solicitado."
        : rawAnswer

    // ── Registrar uso ──
    let warning: string | undefined
    if (question.trim().split(/\s+/).length >= 2) {
      await supabase
        .from("chat_logs")
        .insert({ company_id: companyId, intencao: question.slice(0, 500), mes: getCurrentMes() })

      if (chatLimit !== null && chatLimit > 0) {
        const startOfMonth = new Date()
        startOfMonth.setDate(1)
        startOfMonth.setHours(0, 0, 0, 0)

        const { count } = await supabase
          .from("chat_logs")
          .select("id", { count: "exact", head: true })
          .eq("company_id", companyId)
          .gte("created_at", startOfMonth.toISOString())

        const used = count ?? 0
        const percent = Math.round((used / chatLimit) * 100)

        if (percent >= 100) {
          const overage = used - chatLimit
          warning = chatExcessPrice !== null
            ? `⚠️ Você ultrapassou seu limite de ${chatLimit} perguntas. Cada pergunta adicional custa R$ ${chatExcessPrice.toFixed(2).replace(".", ",")} (${overage} pergunta${overage !== 1 ? "s" : ""} excedente${overage !== 1 ? "s" : ""} até agora). Caso precise de mais, fale com o administrador.`
            : `⚠️ Você ultrapassou seu limite de ${chatLimit} perguntas este mês. Caso precise de mais, fale com o administrador.`
        } else if (percent >= 80) {
          warning = `Você atingiu ${percent}% do seu limite de perguntas (${used}/${chatLimit}). Ao atingir 100%${chatExcessPrice !== null ? `, perguntas adicionais serão cobradas a R$ ${chatExcessPrice.toFixed(2).replace(".", ",")} cada` : ""}. Caso precise de mais, fale com o administrador.`
        }
      }
    }

    return NextResponse.json<ChatApiResponse>({
      answer,
      data: chartPayload.data,
      daxQuery: null,
      confidence: "high",
      chartType: chartPayload.chartType,
      warning,
    })
  } catch (error) {
    const message = error instanceof Error ? error.message : "Erro desconhecido"
    return NextResponse.json<ChatApiResponse>(
      {
        answer: `Ocorreu um erro ao processar sua pergunta: ${message}`,
        data: null,
        daxQuery: null,
        confidence: "low",
        error: message,
      },
      { status: 500 }
    )
  }
}
