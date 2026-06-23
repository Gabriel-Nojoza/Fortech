import { NextRequest, NextResponse } from "next/server"
import { createServiceClient } from "@/lib/supabase/server"
import { getAccessToken, executeDAXQuery } from "@/lib/powerbi"

const OLLAMA_URL = process.env.OLLAMA_URL || "http://72.60.12.165:11434"
const NARRATE_SECRET = process.env.NARRATE_SECRET || process.env.N8N_CALLBACK_SECRET || ""

// ─── helpers numéricos ────────────────────────────────────────────────────────

function parseNum(val: unknown): number | null {
  if (val === null || val === undefined || val === "") return null
  const str = String(val).replace(/\s/g, "").replace(/R\$/g, "").replace(/\./g, "").replace(",", ".")
  const n = parseFloat(str)
  return isNaN(n) ? null : n
}

function fmtBRL(n: number): string {
  return n.toLocaleString("pt-BR", { style: "currency", currency: "BRL" })
}

// Alguns datasets guardam % como 0.80, outros como 80 — normaliza para 0-100
function normPct(v: number): number {
  return Math.abs(v) <= 1.5 ? v * 100 : v
}

// ─── detecção de papel da coluna/medida ──────────────────────────────────────

function metricRole(
  name: string
): "meta" | "realizado" | "pct_meta" | "gap" | "tendencia" | "pct_tend" | "other" {
  const l = name
    .toLowerCase()
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
  const hasPct = l.includes("%") || l.includes("pct")
  const hasMeta = l.includes("meta") || l.includes("target") || l.includes("objetivo")
  const hasTend = l.includes("tend")
  const hasGap = l.includes("gap") || l.includes("difer")
  const hasReal =
    l.includes("realiz") ||
    l.includes("pedido") ||
    /\bvl\b/.test(l) ||
    /\bvi\b/.test(l) ||
    l.includes("fatur") ||
    l.includes("venda")

  if (hasPct && hasMeta && !hasTend) return "pct_meta"
  if (hasPct && hasTend) return "pct_tend"
  if (hasMeta && !hasPct && !hasTend) return "meta"
  if (hasGap && !hasPct) return "gap"
  if (hasTend && !hasPct && !hasMeta) return "tendencia"
  if (hasReal && !hasMeta) return "realizado"
  return "other"
}

function isTextType(dataType: string): boolean {
  return dataType.toLowerCase().includes("string") || dataType.toLowerCase().includes("text")
}

function isDateName(name: string): boolean {
  const l = name.toLowerCase()
  return (
    l.includes("data") ||
    l.includes("date") ||
    l.includes("ano") ||
    l.includes("mes") ||
    l.includes("semana") ||
    l.includes("trimest") ||
    l.includes("periodo") ||
    l.includes("year") ||
    l.includes("month")
  )
}

// Pontua a coluna como candidata a dimensão principal do relatório.
// Tabelas de vendedor/supervisor pontuam alto; tabelas de clientes/fatos pontuam baixo.
function scoreDim(tableName: string, colName: string): number {
  const tl = tableName.toLowerCase().normalize("NFD").replace(/[̀-ͯ]/g, "")
  const cl = colName.toLowerCase().normalize("NFD").replace(/[̀-ͯ]/g, "")
  let s = 0
  if (/fornec|vended|repres|supervis|equip|colabo|funcion|gestor|gerente|rca|hierarq|regiao|filial|setor/.test(tl)) s += 20
  if (/estrutur|time\b|pessoa|cargo/.test(tl)) s += 10
  if (/meta|budget|target|objetivo/.test(tl)) s += 5
  if (/cliente|customer|parceiro|contato/.test(tl)) s += 1
  if (/pedido|venda|fatur|transac|item|nota|lancam|moviment/.test(tl)) s -= 15
  if (/data\b|date\b|calend|tempo|semana|ano\b|year|month/.test(tl)) s -= 20
  if (/\bnome\b|\bname\b|descri/.test(cl)) s += 5
  if (/codigo|code|\bcod\b/.test(cl)) s += 3
  if (/telefon|email|cpf|cnpj|cep|ender/.test(cl)) s -= 10
  return s
}

// Verifica se o resultado do SUMMARIZECOLUMNS faz sentido para um relatório de BI.
function isValidResult(rows: Record<string, unknown>[], metaCol: string | undefined): boolean {
  if (rows.length < 2) return false
  if (!metaCol) return true
  const vals = rows.map((r) => parseNum(r[metaCol])).filter((v): v is number => v !== null)
  if (vals.length === 0) return true
  // Valores absurdos (> 1 trilhão) indicam contexto de medida errado
  if (vals.some((v) => Math.abs(v) > 1_000_000_000_000)) return false
  // Todos iguais com mais de 3 linhas = dimensão não está filtrando a medida
  if (vals.length > 3) {
    const unique = new Set(vals.map((v) => Math.round(Math.abs(v) / 100)))
    if (unique.size === 1) return false
  }
  return true
}

// ─── montagem do texto (sem LLM) ─────────────────────────────────────────────

function buildNarration(
  reportName: string,
  columns: string[],
  rows: Record<string, unknown>[],
  idCol: string
): string {
  const out: string[] = [`*${reportName}*`, ""]

  if (rows.length === 0) return ""

  const metaCol = columns.find((c) => metricRole(c) === "meta")
  const realCol = columns.find((c) => metricRole(c) === "realizado")
  const pctCol = columns.find((c) => metricRole(c) === "pct_meta")
  const gapCol = columns.find((c) => metricRole(c) === "gap")
  const tendCol = columns.find((c) => metricRole(c) === "tendencia")
  const pctTendCol = columns.find((c) => metricRole(c) === "pct_tend")

  const totalRow = rows.find((r) =>
    String(r[idCol] ?? "")
      .toLowerCase()
      .includes("total")
  )

  const dataRows = rows.filter((r) => {
    const v = String(r[idCol] ?? "").trim()
    return v && !v.toLowerCase().includes("total")
  })

  const aggVal = (col: string | undefined, avg = false): number | null => {
    if (!col) return null
    if (totalRow) return parseNum(totalRow[col])
    const vals = dataRows.map((r) => parseNum(r[col])).filter((v): v is number => v !== null)
    if (vals.length === 0) return null
    return avg ? vals.reduce((a, b) => a + b, 0) / vals.length : vals.reduce((a, b) => a + b, 0)
  }

  if (metaCol && realCol) {
    const meta = aggVal(metaCol)
    const real = aggVal(realCol)
    const pctRaw = aggVal(pctCol, true)
    const pct =
      pctRaw !== null
        ? normPct(pctRaw)
        : meta && real && meta !== 0
          ? (real / meta) * 100
          : null
    const gap =
      gapCol != null
        ? aggVal(gapCol)
        : meta != null && real != null
          ? real - meta
          : null
    const tend = aggVal(tendCol)
    const pctTendRaw = aggVal(pctTendCol, true)
    const pctTend = pctTendRaw !== null ? normPct(pctTendRaw) : null

    // ── totais ────────────────────────────────────────────────────────────────
    const totParts: string[] = []
    if (meta !== null) totParts.push(`Meta: ${fmtBRL(meta)}`)
    if (real !== null)
      totParts.push(`Realizado: ${fmtBRL(real)}${pct !== null ? ` (${pct.toFixed(0)}%)` : ""}`)
    if (gap !== null) totParts.push(`Gap: ${gap >= 0 ? "+" : ""}${fmtBRL(gap)}`)
    out.push(totParts.join(" | "))

    if (tend !== null || pctTend !== null) {
      const tp: string[] = []
      if (tend !== null) tp.push(`Tendência: ${fmtBRL(tend)}`)
      if (pctTend !== null) tp.push(`(${pctTend.toFixed(0)}%)`)
      out.push(tp.join(" "))
    }

    // ── ranking por % meta ────────────────────────────────────────────────────
    const sortCol = pctCol ?? realCol
    const sorted = [...dataRows]
      .filter((r) => String(r[idCol] ?? "").trim())
      .filter((r) => parseNum(r[sortCol]) !== null)
      .sort((a, b) => (parseNum(b[sortCol]) ?? 0) - (parseNum(a[sortCol]) ?? 0))

    const rowLine = (r: Record<string, unknown>): string => {
      const name = String(r[idCol] ?? "").trim()
      const m = metaCol ? parseNum(r[metaCol]) : null
      const rv = realCol ? parseNum(r[realCol]) : null
      const pRaw = pctCol ? parseNum(r[pctCol]) : null
      const p =
        pRaw !== null
          ? normPct(pRaw)
          : m && rv && m !== 0
            ? (rv / m) * 100
            : null
      const pts = [name]
      if (p !== null) pts.push(`${p.toFixed(0)}%`)
      if (rv !== null && m !== null) pts.push(`(${fmtBRL(rv)} / ${fmtBRL(m)})`)
      return `• ${pts.join(": ")}`
    }

    if (sorted.length > 0) {
      out.push("")
      out.push("*Melhores:*")
      sorted.slice(0, 5).forEach((r) => out.push(rowLine(r)))
    }

    const below = sorted
      .filter((r) => {
        const pRaw = pctCol ? parseNum(r[pctCol]) : null
        const m = metaCol ? parseNum(r[metaCol]) : null
        const rv = realCol ? parseNum(r[realCol]) : null
        const p =
          pRaw !== null ? normPct(pRaw) : m && rv && m !== 0 ? (rv / m) * 100 : null
        return p !== null && p < 100
      })
      .reverse()

    if (below.length > 0) {
      out.push("")
      out.push("*Abaixo da meta:*")
      below.slice(0, 5).forEach((r) => out.push(rowLine(r)))
    }
  } else {
    // sem meta/realizado identificados — resume os numéricos
    const numCols = columns.filter(
      (c) => c !== idCol && dataRows.some((r) => parseNum(r[c]) !== null)
    )
    out.push(`${dataRows.length} registros`)
    for (const col of numCols.slice(0, 4)) {
      const vals = dataRows.map((r) => parseNum(r[col])).filter((v): v is number => v !== null)
      if (vals.length === 0) continue
      const total = vals.reduce((a, b) => a + b, 0)
      const max = Math.max(...vals)
      out.push(`${col}: total ${fmtBRL(total)} | máx ${fmtBRL(max)}`)
    }
  }

  return out.join("\n").trim()
}

// ─── narração via DAX (sem LLM) ──────────────────────────────────────────────

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

  // ── Fase 1: SUMMARIZECOLUMNS com medidas reais ────────────────────────────
  try {
    const [measRes, colsRes] = await Promise.all([
      executeDAXQuery(token, report.dataset_id, "EVALUATE INFO.VIEW.MEASURES()"),
      executeDAXQuery(token, report.dataset_id, "EVALUATE INFO.VIEW.COLUMNS()"),
    ])

    const measures = measRes.rows
      .filter((r) => !r["IsHidden"] && r["Name"] && !String(r["Name"]).startsWith("_"))
      .map((r) => ({ name: String(r["Name"] ?? ""), table: String(r["TableName"] ?? "") }))

    const textCols = colsRes.rows
      .filter(
        (r) =>
          !r["IsHidden"] &&
          isTextType(String(r["DataType"] ?? "")) &&
          !isDateName(String(r["Name"] ?? ""))
      )
      .map((r) => ({ name: String(r["Name"] ?? ""), table: String(r["TableName"] ?? "") }))

    const pick = (role: ReturnType<typeof metricRole>) =>
      measures.filter((m) => metricRole(m.name) === role)

    const metaMs = pick("meta")
    const realMs = pick("realizado")
    const pctMs = pick("pct_meta")
    const gapMs = pick("gap")
    const tendMs = pick("tendencia")
    const pctTMs = pick("pct_tend")

    console.log("[narrate] medidas:", {
      meta: metaMs.map((m) => m.name),
      realizado: realMs.map((m) => m.name),
      pct: pctMs.map((m) => m.name),
    })

    if (metaMs.length > 0 && realMs.length > 0 && textCols.length > 0) {
      const selected = [
        ...metaMs.slice(0, 1),
        ...realMs.slice(0, 1),
        ...pctMs.slice(0, 1),
        ...gapMs.slice(0, 1),
        ...tendMs.slice(0, 1),
        ...pctTMs.slice(0, 1),
      ]
      const measureDax = selected.map((m) => `"${m.name}", [${m.name}]`).join(",\n    ")

      // Ordena candidatos: tabelas de vendedor/supervisor primeiro
      const candidates = textCols
        .map((col) => ({ ...col, score: scoreDim(col.table, col.name) }))
        .sort((a, b) => b.score - a.score)
        .slice(0, 5)

      for (const dim of candidates) {
        try {
          const dimRef = `'${dim.table}'[${dim.name}]`
          const dax = `EVALUATE TOPN(500, SUMMARIZECOLUMNS(\n    ${dimRef},\n    ${measureDax}\n))`
          const result = await executeDAXQuery(token, report.dataset_id, dax)
          if (result.rows.length === 0) continue

          const cols = result.columns.map((c: { name: string }) => c.name)
          const metaCol = cols.find((c: string) => metricRole(c) === "meta")

          if (!isValidResult(result.rows, metaCol)) {
            console.warn(`[narrate] dim "${dim.table}[${dim.name}]" invalida, proxima...`)
            continue
          }

          console.log(`[narrate] SUMMARIZECOLUMNS ok: ${result.rows.length} linhas, dim: ${dim.table}[${dim.name}]`)
          const narration = buildNarration(report.name, cols, result.rows, dim.name)
          if (narration) return narration
        } catch (err) {
          console.warn(`[narrate] dim "${dim.table}[${dim.name}]" erro:`, err)
        }
      }
    }
  } catch (err) {
    console.warn("[narrate] SUMMARIZECOLUMNS falhou:", err)
  }

  // ── Fase 2: TOPN bruto com formatação programática ────────────────────────
  const tablesResult = await executeDAXQuery(
    token,
    report.dataset_id,
    "EVALUATE INFO.VIEW.TABLES()"
  )
  const tableNames = tablesResult.rows
    .filter((r) => !r["IsHidden"] && r["Name"] && !String(r["Name"]).startsWith("$"))
    .map((r) => String(r["Name"]))
    .slice(0, 5)

  console.log("[narrate] tabelas TOPN:", tableNames)

  for (const tableName of tableNames) {
    try {
      const result = await executeDAXQuery(
        token,
        report.dataset_id,
        `EVALUATE TOPN(300, '${tableName}')`
      )
      if (result.rows.length === 0) continue

      const cols = result.columns.map((c: { name: string }) => c.name)
      const hasMetric = cols.some((c: string) => metricRole(c) !== "other")
      if (!hasMetric) continue

      const idCol =
        cols.find(
          (c: string) =>
            result.rows.some((r) => {
              const v = r[c]
              return typeof v === "string" && v.trim() && isNaN(Number(v))
            }) && !isDateName(c)
        ) ?? cols[0]

      console.log(`[narrate] TOPN "${tableName}": ${result.rows.length} linhas, id: ${idCol}`)
      const narration = buildNarration(report.name, cols, result.rows, idCol)
      if (narration) return narration
    } catch {
      // tabela inacessível
    }
  }

  return null
}

// ─── POST handler ─────────────────────────────────────────────────────────────

export async function POST(request: NextRequest) {
  const secret =
    request.headers.get("x-narrate-secret") ?? request.headers.get("x-callback-secret")
  if (NARRATE_SECRET && secret !== NARRATE_SECRET) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
  }

  const body = await request.json()
  const send_mode = String(body.send_mode ?? "none").replace(/^=+/, "")
  const dispatchLogId = String(body.dispatch_log_id ?? "").trim().replace(/^=+/, "") || null

  // Caminho principal: programático via DAX (sem LLM)
  if (dispatchLogId) {
    try {
      const narration = await narrateFromDAX(dispatchLogId)
      if (narration) {
        console.log("[narrate] programmatic ok, length:", narration.length)
        return NextResponse.json({ narration, send_mode })
      }
    } catch (err) {
      console.error("[narrate] DAX falhou, caindo para visao:", err)
    }
  }

  // Fallback: visão (llava) — usado apenas quando dispatch_log_id não resolveu
  const { document_base64 } = body
  if (!document_base64) {
    return NextResponse.json(
      { error: "document_base64 ou dispatch_log_id obrigatorio" },
      { status: 400 }
    )
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
          content:
            "Você é um analista de Business Intelligence. Receberá uma imagem de um relatório empresarial. Analise apenas o que estiver visível. Não invente informações. Responda em português.",
        },
        {
          role: "user",
          content:
            "Resuma os principais indicadores visíveis neste relatório em texto corrido, máximo 15 linhas. Use apenas os números que aparecem na imagem.",
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
