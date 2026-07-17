import { NextRequest, NextResponse } from "next/server"
import { createServiceClient } from "@/lib/supabase/server"
import { requirePlatformAdminContext } from "@/lib/tenant"
import { assertCompanyWhatsAppProvider } from "@/lib/whatsapp-provider"
import { getStoredWahaSession, sendWahaMessage } from "@/lib/waha"

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

    await sendWahaMessage(session.session_name, {
      phone: lead.telefone,
      text: message,
    })

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
