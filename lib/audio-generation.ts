import { execFile } from "child_process"
import { promisify } from "util"
import * as fs from "fs"
import * as path from "path"
import * as os from "os"
import {
  executeDAXQuery,
  getDatasetMetadata,
  getAccessToken,
  exportReport,
  getExportStatus,
  getExportFile,
  listReportPages,
  listPageVisuals,
  exportVisualData,
} from "@/lib/powerbi"
import { sendWhatsAppBotMessage } from "@/lib/whatsapp-bot"

const execFileAsync = promisify(execFile)

const TABLE_VISUAL_TYPES = ["tableEx", "table", "matrix", "pivotTable", "tableVisual"]

// ─── PNG export via Power BI API ─────────────────────────────────────────────

async function exportReportPng(
  token: string,
  workspaceId: string,
  reportId: string,
  pageName?: string | null
): Promise<Buffer> {
  const job = await exportReport(token, workspaceId, reportId, "PNG", { pageName })

  for (let i = 0; i < 30; i++) {
    await new Promise((r) => setTimeout(r, 2000))
    const status = await getExportStatus(token, workspaceId, reportId, job.id)
    if (status.status === "Succeeded") {
      const buffer = await getExportFile(token, workspaceId, reportId, job.id)
      return Buffer.from(buffer)
    }
    if (status.status === "Failed") throw new Error("Power BI: falha ao exportar PNG")
  }
  throw new Error("Power BI: timeout ao exportar PNG")
}

// ─── Ollama vision ────────────────────────────────────────────────────────────

async function analyzeImageWithOllama(
  imageBase64: string,
  reportName: string
): Promise<string | null> {
  const ollamaUrl = (process.env.OLLAMA_URL ?? "http://localhost:11434").replace(/\/+$/, "")
  const model = process.env.OLLAMA_VISION_MODEL ?? "llava"

  const prompt = `Esta é uma imagem de um relatório do Power BI chamado "${reportName}".

Analise a tabela principal e descreva TODOS os dados em português brasileiro, de forma detalhada e clara.

REGRAS:
1. Leia os dados da tabela principal (fornecedores, supervisores, vendedores, etc).
2. Para CADA linha da tabela, descreva o nome e TODAS as métricas visíveis (meta, pedidos, percentual, gap, tendência, etc).
3. Use linguagem natural e fluida — substitua símbolos: "R$" por "reais", "%" por "por cento", números grandes por "mil" ou "milhão".
4. Inclua o total/geral se houver.
5. Comece com: "Relatório ${reportName}."
6. NÃO invente valores. Use exatamente o que está na imagem.
7. Seja completo — mencione todos os itens visíveis na tabela.`

  const res = await fetch(`${ollamaUrl}/api/chat`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    signal: AbortSignal.timeout(120_000),
    body: JSON.stringify({
      model,
      stream: false,
      messages: [{ role: "user", content: prompt, images: [imageBase64] }],
    }),
  })

  if (!res.ok) {
    throw new Error(`Ollama retornou ${res.status}: ${await res.text().catch(() => "")}`)
  }

  const data = await res.json() as { message?: { content?: string } }
  return data.message?.content?.trim() ?? null
}

// ─── Visual data export (respeita filtros do relatório) ──────────────────────

async function getVisualRows(
  token: string,
  workspaceId: string,
  pbiReportId: string,
  pageName?: string | null
): Promise<{ rows: Array<Record<string, unknown>>; dimensionKey: string | null } | null> {
  try {
    let page = pageName ?? null
    if (!page) {
      const pages = await listReportPages(token, workspaceId, pbiReportId)
      page = pages[0]?.name ?? null
    }
    if (!page) return null

    const visuals = await listPageVisuals(token, workspaceId, pbiReportId, page)
    console.log("[audio] visuals encontrados", visuals.map((v) => `${v.type}:${v.id}`))

    const tableVisual = visuals.find((v) => TABLE_VISUAL_TYPES.includes(v.type))
    if (!tableVisual) return null

    const rows = await exportVisualData(token, workspaceId, pbiReportId, page, tableVisual.id)
    console.log("[audio] visual export rows:", rows.length)
    if (rows.length === 0) return null

    const firstKey = Object.keys(rows[0])[0]
    return { rows: rows.slice(0, 10), dimensionKey: firstKey }
  } catch (err) {
    console.log("[audio] getVisualRows falhou", err instanceof Error ? err.message : err)
    return null
  }
}

// ─── Script builder ───────────────────────────────────────────────────────────

function buildAudioScript(
  reportName: string,
  rows: Array<Record<string, unknown>>,
  dimensionKey: string | null
): string {
  if (rows.length === 0) {
    return `Relatório ${reportName} atualizado e disponível para consulta.`
  }

  if (dimensionKey && rows.length > 1) {
    const parts = rows
      .filter((row) => row[dimensionKey] !== null && row[dimensionKey] !== undefined)
      .map((row) => {
        const label = String(row[dimensionKey])
        const metrics = Object.entries(row)
          .filter(([k, v]) => k !== dimensionKey && v !== null && v !== undefined && String(v).trim() !== "")
          .map(([k, v]) => `${k}: ${v}`)
          .join(", ")
        return metrics ? `${label} — ${metrics}` : label
      })
      .filter(Boolean)

    if (parts.length === 0) return `Relatório ${reportName} atualizado e disponível para consulta.`
    return `Relatório ${reportName} atualizado. ${parts.join(". ")}.`
  }

  const entries = Object.entries(rows[0])
    .filter(([, v]) => v !== null && v !== undefined && String(v).trim() !== "")
    .map(([k, v]) => `${k}: ${v}`)
    .join(". ")

  return entries
    ? `Relatório ${reportName} atualizado. ${entries}.`
    : `Relatório ${reportName} atualizado e disponível para consulta.`
}

// ─── DAX fallback ─────────────────────────────────────────────────────────────

async function getDAXRows(
  token: string,
  datasetId: string
): Promise<{ rows: Array<Record<string, unknown>>; dimensionKey: string | null }> {
  const metadata = await getDatasetMetadata(token, datasetId, { includeCustomChatMeasures: false })

  const visibleMeasures = metadata.measures
    .filter((m) => !m.isHidden && m.tableName && m.measureName)
    .slice(0, 5)

  const dimensionColumn = metadata.columns.find(
    (c) =>
      !c.isHidden &&
      (c.dataType.toLowerCase() === "string" || c.dataType.toLowerCase() === "text") &&
      !metadata.tables.find((t) => t.name === c.tableName)?.isHidden
  )

  if (dimensionColumn && visibleMeasures.length > 0) {
    const tableName = dimensionColumn.tableName.replace(/'/g, "''")
    const colName = dimensionColumn.columnName.replace(/'/g, "''")
    const measureDefs = visibleMeasures
      .map((m) => `"${m.measureName.replace(/"/g, '\\"')}", [${m.measureName}]`)
      .join(", ")
    const dax = `EVALUATE TOPN(10, SUMMARIZECOLUMNS('${tableName}'[${colName}], ${measureDefs}), [${visibleMeasures[0].measureName}], 0)`
    try {
      const result = await executeDAXQuery(token, datasetId, dax)
      if (result.rows.length > 0) {
        const firstRowKeys = Object.keys(result.rows[0])
        const dimensionKey = firstRowKeys.find((k) =>
          k.toLowerCase().includes(colName.toLowerCase()) || k.includes("[")
        ) ?? firstRowKeys[0]
        return { rows: result.rows, dimensionKey }
      }
    } catch { /* ignora */ }
  }

  const totals: Record<string, unknown> = {}
  for (const measure of visibleMeasures) {
    try {
      const daxQuery = `EVALUATE ROW("${measure.measureName.replace(/"/g, '\\"')}", [${measure.measureName}])`
      const result = await executeDAXQuery(token, datasetId, daxQuery)
      if (result.rows.length > 0) {
        const value = Object.values(result.rows[0])[0]
        if (value !== null && value !== undefined) totals[measure.measureName] = value
      }
    } catch { /* ignora */ }
  }

  return { rows: Object.keys(totals).length > 0 ? [totals] : [], dimensionKey: null }
}

// ─── TTS ─────────────────────────────────────────────────────────────────────

async function textToOgg(text: string, voice = "pt-BR-FranciscaNeural"): Promise<Buffer> {
  const id = `audio_${Date.now()}_${Math.random().toString(36).slice(2)}`
  const tmpDir = os.tmpdir()
  const mp3Path = path.join(tmpDir, `${id}.mp3`)
  const oggPath = path.join(tmpDir, `${id}.ogg`)

  try {
    await execFileAsync("edge-tts", [
      "--voice", voice,
      "--text", text,
      "--write-media", mp3Path,
    ])
    await execFileAsync("ffmpeg", [
      "-y", "-i", mp3Path,
      "-c:a", "libopus", "-b:a", "32k", "-vbr", "on", "-compression_level", "10",
      oggPath,
    ])
    return await fs.promises.readFile(oggPath)
  } finally {
    fs.unlink(mp3Path, () => {})
    fs.unlink(oggPath, () => {})
  }
}

// ─── Main export ─────────────────────────────────────────────────────────────

export async function generateAndSendReportAudio(input: {
  companyId: string
  reportId: string
  reportName: string
  datasetId: string
  workspaceId?: string | null
  pbiReportId?: string | null
  pageName?: string | null
  contacts: Array<{ phone?: string | null; whatsapp_group_id?: string | null }>
  botInstanceId: string | null
  voice?: string
  sendMode?: "audio" | "text"
}): Promise<{ sent: number; error?: string }> {
  try {
    const token = await getAccessToken(input.companyId)
    const ollamaEnabled = !!process.env.OLLAMA_URL
    const sendMode = input.sendMode ?? "audio"

    let script: string | null = null
    let pngBase64: string | null = null

    // ── Abordagem 1: Ollama vision ────────────────────────────────────────────
    if (ollamaEnabled && input.workspaceId && input.pbiReportId) {
      try {
        console.log("[audio] exportando PNG para Ollama")
        const pngBuffer = await exportReportPng(token, input.workspaceId, input.pbiReportId, input.pageName)
        pngBase64 = pngBuffer.toString("base64")
        console.log("[audio] PNG exportado", pngBuffer.byteLength, "bytes")
        script = await analyzeImageWithOllama(pngBase64, input.reportName)
        console.log("[audio] Ollama respondeu, chars:", script?.length ?? 0)
      } catch (err) {
        console.error("[audio] Ollama falhou:", err instanceof Error ? err.message : err)
      }
    }

    // ── Abordagem 2: exportVisualData ─────────────────────────────────────────
    if (!script && input.workspaceId && input.pbiReportId) {
      console.log("[audio] tentando exportVisualData")
      const result = await getVisualRows(token, input.workspaceId, input.pbiReportId, input.pageName)
      if (result) {
        script = buildAudioScript(input.reportName, result.rows, result.dimensionKey)
      }
    }

    // ── Abordagem 3: DAX fallback ─────────────────────────────────────────────
    if (!script) {
      console.log("[audio] usando DAX como ultimo fallback")
      const result = await getDAXRows(token, input.datasetId)
      script = buildAudioScript(input.reportName, result.rows, result.dimensionKey)
    }

    console.log("[audio] script gerado", { mode: sendMode, reportName: input.reportName, words: script.split(/\s+/).length })

    // ── Envio ─────────────────────────────────────────────────────────────────
    let sent = 0
    for (const contact of input.contacts) {
      if (!contact.phone && !contact.whatsapp_group_id) continue
      try {
        if (sendMode === "text") {
          // Envia o PNG do relatório (se disponível) + texto explicativo
          if (pngBase64) {
            await sendWhatsAppBotMessage({
              instance_id: input.botInstanceId,
              phone: contact.phone,
              whatsapp_group_id: contact.whatsapp_group_id,
              document_base64: pngBase64,
              mimetype: "image/png",
              file_name: `${input.reportName}.png`,
              caption: script,
            })
          } else {
            await sendWhatsAppBotMessage({
              instance_id: input.botInstanceId,
              phone: contact.phone,
              whatsapp_group_id: contact.whatsapp_group_id,
              message: script,
            })
          }
        } else {
          // Envia áudio
          const audioBuffer = await textToOgg(script, input.voice ?? "pt-BR-FranciscaNeural")
          await sendWhatsAppBotMessage({
            instance_id: input.botInstanceId,
            phone: contact.phone,
            whatsapp_group_id: contact.whatsapp_group_id,
            audio_base64: audioBuffer.toString("base64"),
          })
        }
        sent++
      } catch (sendErr) {
        console.error(
          "[audio] falha ao enviar para contato",
          contact.phone ?? contact.whatsapp_group_id,
          sendErr instanceof Error ? sendErr.message : sendErr
        )
      }
    }

    console.log("[audio] enviado", { mode: sendMode, reportName: input.reportName, sent, total: input.contacts.length })
    return { sent }
  } catch (err) {
    const error = err instanceof Error ? err.message : "Erro ao gerar audio"
    console.error("[audio] generateAndSendReportAudio falhou", error)
    return { sent: 0, error }
  }
}
