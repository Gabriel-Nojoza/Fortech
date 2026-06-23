import { NextRequest, NextResponse } from "next/server"

const OLLAMA_URL = process.env.OLLAMA_URL || "http://72.60.12.165:11434"
const NARRATE_SECRET = process.env.NARRATE_SECRET || process.env.N8N_CALLBACK_SECRET || ""

export async function POST(request: NextRequest) {
  const secret = request.headers.get("x-narrate-secret") ?? request.headers.get("x-callback-secret")
  if (NARRATE_SECRET && secret !== NARRATE_SECRET) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
  }

  const body = await request.json()
  const { document_base64 } = body
  const send_mode = String(body.send_mode ?? "none").replace(/^=+/, "")

  if (!document_base64) {
    return NextResponse.json({ error: "document_base64 obrigatorio" }, { status: 400 })
  }

  // Mantém apenas caracteres base64 válidos (A-Z, a-z, 0-9, +, /, =)
  const rawStr = String(document_base64)
  // n8n sends the = expression-mode prefix as part of the value — strip it along with any data URL prefix and whitespace
  const stripped = rawStr
    .replace(/^data:[^;]+;base64,/, "")
    .replace(/\s/g, "")
    .replace(/^=+/, "")

  const buf = Buffer.from(stripped, "base64")
  console.log("[narrate] raw:", rawStr.length, "stripped:", stripped.length, "buf:", buf.length, "first8:", stripped.substring(0, 8))

  if (buf.length < 100) {
    return NextResponse.json({
      error: "base64 muito curto",
      debug: { raw_length: rawStr.length, stripped_length: stripped.length, buf_length: buf.length }
    }, { status: 400 })
  }

  const cleanBase64 = buf.toString("base64")

  const model = process.env.OLLAMA_VISION_MODEL || "llava:latest"

  const ollamaRes = await fetch(`${OLLAMA_URL}/api/chat`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      model,
      stream: false,
      messages: [
        {
          role: "user",
          content: "Você é um analista de dados. Analise esta imagem de relatório e descreva em português: os principais indicadores e métricas visíveis, os valores numéricos mais relevantes, tendências ou comparações que aparecem nos dados. Seja objetivo e direto, listando os pontos principais em até 5 tópicos.",
          images: [cleanBase64],
        },
      ],
    }),
  })

  if (!ollamaRes.ok) {
    const err = await ollamaRes.text()
    return NextResponse.json({ error: `Ollama error: ${err}` }, { status: 502 })
  }

  const data = await ollamaRes.json()
  const narration: string = data?.message?.content ?? ""

  return NextResponse.json({ narration, send_mode })
}
