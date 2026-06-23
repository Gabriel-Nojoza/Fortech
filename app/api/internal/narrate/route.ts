import { NextRequest, NextResponse } from "next/server"
import { createServiceClient } from "@/lib/supabase/server"
import { getAccessToken, executeDAXQuery } from "@/lib/powerbi"

const OLLAMA_URL = process.env.OLLAMA_URL || "http://72.60.12.165:11434"
const NARRATE_SECRET = process.env.NARRATE_SECRET || process.env.N8N_CALLBACK_SECRET || ""

const BI_PROMPT = `Você receberá dados extraídos de um relatório Power BI. Produza um resumo executivo com os principais indicadores encontrados.

REGRA ABSOLUTA: Use APENAS os valores que estão nos dados. NUNCA invente nomes, números ou percentuais. Se um dado não existir, ignore aquele ponto.

O resumo deve cobrir, quando disponíveis nos dados:
- Indicadores principais (meta, realizado, % atingimento, gap)
- Maiores e menores valores encontrados (quem está acima e abaixo da meta)
- Total geral ou consolidado
- 2 ou 3 destaques positivos e pontos de atenção com os números reais

Formato: texto corrido em português, objetivo, sem títulos ou seções. Máximo de 20 linhas. Cite sempre os nomes e valores exatamente como aparecem nos dados.`

async function narrateFromDAX(dispatchLogId: string): Promise<string | null> {
  const supabase = createServiceClient()

  const { data: log } = await supabase
    .from("dispatch_logs")
    .select("company_id, schedule_id")
    .eq("id", dispatchLogId)
    .single()

  if (!log?.company_id || !log?.schedule_id) return null

  const { data: schedule } = await supabase
    .from("schedules")
    .select("report_id")
    .eq("id", log.schedule_id)
    .eq("company_id", log.company_id)
    .single()

  if (!schedule?.report_id) return null

  const { data: report } = await supabase
    .from("reports")
    .select("dataset_id, name")
    .eq("id", schedule.report_id)
    .single()

  if (!report?.dataset_id) return null

  const token = await getAccessToken(log.company_id)

  const tablesResult = await executeDAXQuery(token, report.dataset_id, "EVALUATE INFO.VIEW.TABLES()")
  const tables = tablesResult.rows
    .filter((r) => !r["IsHidden"] && r["Name"] && !String(r["Name"]).startsWith("$"))
    .map((r) => String(r["Name"]))
    .slice(0, 5)

  console.log("[narrate] tabelas encontradas:", tables)
  if (tables.length === 0) return null

  const tableTexts: string[] = []
  for (const tableName of tables) {
    try {
      const result = await executeDAXQuery(
        token,
        report.dataset_id,
        `EVALUATE TOPN(300, '${tableName}')`
      )
      if (result.rows.length === 0) continue

      const cols = result.columns.map((c: { name: string }) => c.name)
      console.log(`[narrate] tabela "${tableName}": ${result.rows.length} linhas, cols: ${cols.join(", ")}`)
      const header = cols.join(" | ")
      const rows = result.rows.slice(0, 200).map((row: Record<string, unknown>) =>
        cols.map((c: string) => String(row[c] ?? "")).join(" | ")
      )
      tableTexts.push(`### ${tableName}\n${header}\n${rows.join("\n")}`)
    } catch {
      // tabela sem acesso, ignora
    }
  }

  if (tableTexts.length === 0) return null

  const dataText = tableTexts.join("\n\n")
  const textModel = process.env.OLLAMA_TEXT_MODEL || "llama3.2:latest"

  const res = await fetch(`${OLLAMA_URL}/api/chat`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      model: textModel,
      stream: false,
      options: { temperature: 0 },
      messages: [
        {
          role: "system",
          content: "Você é um analista sênior de Business Intelligence. Analise os dados fornecidos e responda em português. Use apenas os dados disponíveis. Não invente informações.",
        },
        {
          role: "user",
          content: `Relatório: ${report.name}\n\nDados extraídos do Power BI:\n${dataText}\n\n${BI_PROMPT}`,
        },
      ],
    }),
  })

  if (!res.ok) throw new Error(`Ollama text error: ${res.status}`)

  const data = await res.json()
  return data?.message?.content ?? null
}

export async function POST(request: NextRequest) {
  const secret = request.headers.get("x-narrate-secret") ?? request.headers.get("x-callback-secret")
  if (NARRATE_SECRET && secret !== NARRATE_SECRET) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
  }

  const body = await request.json()
  const send_mode = String(body.send_mode ?? "none").replace(/^=+/, "")
  const dispatchLogId = String(body.dispatch_log_id ?? "").trim().replace(/^=+/, "") || null

  // Caminho principal: DAX + llama3.2
  if (dispatchLogId) {
    try {
      const narration = await narrateFromDAX(dispatchLogId)
      if (narration) {
        console.log("[narrate] DAX narration ok, length:", narration.length)
        return NextResponse.json({ narration, send_mode })
      }
    } catch (err) {
      console.error("[narrate] DAX falhou, caindo para visao:", err)
    }
  }

  // Fallback: visão (llava)
  const { document_base64 } = body
  if (!document_base64) {
    return NextResponse.json({ error: "document_base64 ou dispatch_log_id obrigatorio" }, { status: 400 })
  }

  const rawStr = String(document_base64)
  const stripped = rawStr
    .replace(/^data:[^;]+;base64,/, "")
    .replace(/\s/g, "")
    .replace(/^=+/, "")

  const buf = Buffer.from(stripped, "base64")
  console.log("[narrate] vision fallback buf:", buf.length)

  if (buf.length < 100) {
    return NextResponse.json({ error: "base64 muito curto" }, { status: 400 })
  }

  const cleanBase64 = buf.toString("base64")
  const visionModel = process.env.OLLAMA_VISION_MODEL || "llava:latest"

  const ollamaRes = await fetch(`${OLLAMA_URL}/api/chat`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      model: visionModel,
      stream: false,
      options: { temperature: 0 },
      messages: [
        {
          role: "system",
          content: "Você é um analista de Business Intelligence. Receberá uma imagem de um relatório empresarial. Analise apenas o que estiver visível. Não invente informações. Responda em português.",
        },
        {
          role: "user",
          content: BI_PROMPT,
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
