import { NextRequest, NextResponse } from "next/server"
import { createServiceClient as createClient } from "@/lib/supabase/server"
import { getRequestContext } from "@/lib/tenant"
import { requestWhatsAppBotPairingCode } from "@/lib/whatsapp-bot"
import {
  getCompanyWhatsAppBotInstance,
  isMissingWhatsAppBotInstancesTableError,
} from "@/lib/whatsapp-bot-instances"

export async function POST(request: NextRequest) {
  try {
    const { companyId } = await getRequestContext()
    const supabase = createClient()
    const body = await request.json()

    const phone =
      typeof body?.phone === "string" ? body.phone.replace(/\D/g, "") : ""
    const instanceId =
      typeof body?.instance_id === "string" && body.instance_id.trim()
        ? body.instance_id.trim()
        : null

    if (!phone || phone.length < 10) {
      return NextResponse.json(
        { error: "Numero invalido. Use formato internacional sem simbolos. Ex: 5511999999999" },
        { status: 400 }
      )
    }

    const instance = await getCompanyWhatsAppBotInstance(supabase, companyId, instanceId)
    if (!instance) {
      return NextResponse.json(
        { error: "WhatsApp nao encontrado para esta empresa" },
        { status: 404 }
      )
    }

    const code = await requestWhatsAppBotPairingCode(phone, instance.id)
    return NextResponse.json({ code })
  } catch (error) {
    if (isMissingWhatsAppBotInstancesTableError(error)) {
      return NextResponse.json(
        { error: "Execute a migration 20260328_whatsapp_bot_instances.sql no Supabase." },
        { status: 500 }
      )
    }

    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Erro ao gerar codigo de pareamento" },
      { status: 500 }
    )
  }
}
