import { NextRequest, NextResponse } from "next/server"

const OLLAMA_URL = process.env.OLLAMA_URL || "http://72.60.12.165:11434"
const NARRATE_SECRET = process.env.NARRATE_SECRET || process.env.N8N_CALLBACK_SECRET || ""

export async function POST(request: NextRequest) {
  const secret = request.headers.get("x-narrate-secret") ?? request.headers.get("x-callback-secret")
  if (NARRATE_SECRET && secret !== NARRATE_SECRET) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
  }

  const { document_base64, send_mode } = await request.json()

  if (!document_base64) {
    return NextResponse.json({ error: "document_base64 obrigatorio" }, { status: 400 })
  }

  // Mantém apenas caracteres base64 válidos (A-Z, a-z, 0-9, +, /, =)
  const rawStr = String(document_base64)
  // 1. Remove data URL prefix and all non-base64 chars (including invisible unicode)
  const stripped = rawStr
    .replace(/^data:[^;]+;base64,/, "")
    .replace(/[^A-Za-z0-9+/=]/g, "")

  console.log("[narrate] raw:", rawStr.length, "stripped:", stripped.length, "first30:", stripped.substring(0, 30))

  if (stripped.length < 100) {
    return NextResponse.json({
      error: "base64 muito curto",
      debug: { raw_length: rawStr.length, stripped_length: stripped.length }
    }, { status: 400 })
  }

  // 2. Decode and re-encode through Buffer to guarantee correct padding
  const buf = Buffer.from(stripped, "base64")
  const cleanBase64 = buf.toString("base64")
  console.log("[narrate] buf:", buf.length, "cleanBase64:", cleanBase64.length)

  const ollamaRes = await fetch(`${OLLAMA_URL}/api/generate`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      model: "llava:latest",
      stream: false,
      images: [cleanBase64],
      prompt:
        "Você é um analista de dados especialista em Power BI. Analise este relatório e faça uma narração profissional em português dos principais indicadores, tendências, alertas, oportunidades e conclusões.",
    }),
  })

  if (!ollamaRes.ok) {
    const err = await ollamaRes.text()
    return NextResponse.json({ error: `Ollama error: ${err}` }, { status: 502 })
  }

  const data = await ollamaRes.json()
  const narration: string = data?.response ?? ""

  return NextResponse.json({ narration, send_mode })
}
