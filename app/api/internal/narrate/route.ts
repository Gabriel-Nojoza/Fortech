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

  const ollamaRes = await fetch(`${OLLAMA_URL}/api/chat`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      model: "llava:latest",
      stream: false,
      messages: [
        {
          role: "user",
          images: [document_base64],
          content:
            "Você é um analista de dados especialista em Power BI. Analise este relatório e faça uma narração profissional em português dos principais indicadores, tendências, alertas, oportunidades e conclusões.",
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
