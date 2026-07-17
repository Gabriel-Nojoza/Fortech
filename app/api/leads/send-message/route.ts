import { NextRequest, NextResponse } from "next/server"
import { createServiceClient } from "@/lib/supabase/server"
import { requirePlatformAdminContext } from "@/lib/tenant"
import { assertCompanyWhatsAppProvider } from "@/lib/whatsapp-provider"
import { getStoredWahaSession, sendWahaMessage } from "@/lib/waha"

// Protege o numero de prospeccao de ser marcado como spam/restrito pelo
// WhatsApp: numeros novos mandando muitas mensagens de primeiro contato em
// sequencia sao exatamente o padrao que o antispam deles detecta e bloqueia
// silenciosamente (mensagem "enviada" pela API mas nunca entregue de verdade).
const MAX_MESSAGES_PER_DAY = 15
const MIN_INTERVAL_BETWEEN_MESSAGES_MS = 60_000

export async function POST(request: NextRequest) {
  try {
    const { companyId } = await requirePlatformAdminContext()

    const body = await request.json().catch(() => null)
    const id = typeof body?.id === "string" ? body.id.trim() : ""
    const message = typeof body?.message === "string" ? body.message.trim() : ""

    if (!id || !message) {
      return NextResponse.json(
        { error: "Os campos 'id' e 'message' sao obrigatorios." },
        { status: 400 }
      )
    }

    const supabase = createServiceClient()

    const { data: lead, error: leadError } = await supabase
      .from("leads")
      .select("id, nome, telefone, status")
      .eq("id", id)
      .maybeSingle()

    if (leadError) {
      throw leadError
    }

    if (!lead) {
      return NextResponse.json({ error: "Lead nao encontrado" }, { status: 404 })
    }

    if (!lead.telefone) {
      return NextResponse.json(
        { error: "Este lead nao tem telefone cadastrado." },
        { status: 400 }
      )
    }

    // Envia pelo WhatsApp (WAHA) da propria empresa do admin da plataforma —
    // leads nao pertencem a nenhuma empresa cliente, entao usamos a sessao de
    // quem esta prospectando.
    await assertCompanyWhatsAppProvider(supabase, companyId, "waha")

    const session = await getStoredWahaSession(supabase, companyId)
    if (!session || session.status !== "WORKING") {
      return NextResponse.json(
        {
          error:
            "WhatsApp (WAHA) nao conectado. Conecte o WhatsApp em Configuracoes antes de enviar mensagens para leads.",
        },
        { status: 400 }
      )
    }

    const now = new Date()
    const startOfDay = new Date(now)
    startOfDay.setHours(0, 0, 0, 0)

    const { count: sentToday, error: countError } = await supabase
      .from("lead_message_log")
      .select("id", { count: "exact", head: true })
      .gte("sent_at", startOfDay.toISOString())

    if (countError) {
      throw countError
    }

    if ((sentToday ?? 0) >= MAX_MESSAGES_PER_DAY) {
      return NextResponse.json(
        {
          error: `Limite diario de ${MAX_MESSAGES_PER_DAY} mensagens atingido. Isso protege o numero de ser restrito pelo WhatsApp — tente novamente amanha.`,
        },
        { status: 429 }
      )
    }

    const { data: lastSend, error: lastSendError } = await supabase
      .from("lead_message_log")
      .select("sent_at")
      .order("sent_at", { ascending: false })
      .limit(1)
      .maybeSingle()

    if (lastSendError) {
      throw lastSendError
    }

    if (lastSend?.sent_at) {
      const elapsedMs = now.getTime() - new Date(lastSend.sent_at).getTime()
      if (elapsedMs < MIN_INTERVAL_BETWEEN_MESSAGES_MS) {
        const waitSeconds = Math.ceil((MIN_INTERVAL_BETWEEN_MESSAGES_MS - elapsedMs) / 1000)
        return NextResponse.json(
          {
            error: `Aguarde mais ${waitSeconds}s antes de enviar a proxima mensagem (espacamento minimo entre envios).`,
          },
          { status: 429 }
        )
      }
    }

    await sendWahaMessage(session.session_name, {
      phone: lead.telefone,
      text: message,
    })

    const { error: logError } = await supabase
      .from("lead_message_log")
      .insert({ lead_id: id, sent_at: new Date().toISOString() })

    if (logError) {
      throw logError
    }

    const { data: updatedLead, error: updateError } = await supabase
      .from("leads")
      .update({ status: "Contatado", updated_at: new Date().toISOString() })
      .eq("id", id)
      .select()
      .maybeSingle()

    if (updateError) {
      throw updateError
    }

    return NextResponse.json({ success: true, lead: updatedLead })
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Erro ao enviar mensagem" },
      { status: 500 }
    )
  }
}
