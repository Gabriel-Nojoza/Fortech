import { NextRequest, NextResponse } from "next/server"
import { createServiceClient } from "@/lib/supabase/server"
import { processarMensagemRecebida } from "@/lib/bot-engine"
import type { IncomingWahaMessage } from "@/lib/bot-engine"

function stripJidSuffix(jid: string) {
  return jid.split("@")[0]?.trim() ?? jid
}

/**
 * Converte o payload de webhook do WAHA (evento "message") no formato interno
 * usado pelo motor. Aceita tanto o payload cru do WAHA quanto um repasse direto
 * do n8n (mesmo formato, apenas encaminhado).
 */
function parseIncomingWahaPayload(body: unknown): IncomingWahaMessage | null {
  if (!body || typeof body !== "object") {
    return null
  }

  const record = body as Record<string, unknown>
  const payload = (record.payload as Record<string, unknown> | undefined) ?? record

  const session = typeof record.session === "string" ? record.session.trim() : ""
  const from = typeof payload.from === "string" ? payload.from : ""
  const text =
    typeof payload.body === "string"
      ? payload.body
      : typeof payload.text === "string"
        ? payload.text
        : ""

  if (!session || !from) {
    return null
  }

  return {
    session,
    fromMe: payload.fromMe === true,
    contactPhone: stripJidSuffix(from),
    text,
    raw: body,
  }
}

export async function POST(request: NextRequest) {
  try {
    const platformSecret = process.env.PLATFORM_SCHEDULER_SECRET?.trim()
    const secretRecebido =
      request.headers.get("x-callback-secret")?.trim() ||
      new URL(request.url).searchParams.get("secret")?.trim() ||
      ""

    if (!platformSecret || secretRecebido !== platformSecret) {
      return NextResponse.json({ error: "Callback secret invalido" }, { status: 401 })
    }

    const body = await request.json().catch(() => null)
    const mensagem = parseIncomingWahaPayload(body)

    if (!mensagem) {
      return NextResponse.json(
        { error: "Payload invalido: esperado { session, payload: { from, body } }" },
        { status: 400 }
      )
    }

    const supabase = createServiceClient()
    const resultado = await processarMensagemRecebida(supabase, mensagem)

    return NextResponse.json(resultado)
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Erro ao processar mensagem do bot" },
      { status: 500 }
    )
  }
}
