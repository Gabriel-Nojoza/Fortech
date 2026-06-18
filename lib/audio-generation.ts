import { execFile } from "child_process"
import { promisify } from "util"
import * as fs from "fs"
import * as path from "path"
import * as os from "os"
import {
  executeDAXQuery,
  getDatasetMetadata,
  getAccessToken,
  listReportPages,
  listPageVisuals,
  exportVisualData,
} from "@/lib/powerbi"
import { sendWhatsAppBotMessage } from "@/lib/whatsapp-bot"

const execFileAsync = promisify(execFile)

const TABLE_VISUAL_TYPES = ["tableEx", "table", "matrix", "pivotTable", "tableVisual"]

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

async function getVisualRows(
  token: string,
  workspaceId: string,
  pbiReportId: string,
  pageName?: string | null
): Promise<{ rows: Array<Record<string, unknown>>; dimensionKey: string | null }> {
  // Usa a página informada ou pega a primeira
  let page = pageName ?? null
  if (!page) {
    const pages = await listReportPages(token, workspaceId, pbiReportId)
    page = pages[0]?.name ?? null
  }
  if (!page) return { rows: [], dimensionKey: null }

  const visuals = await listPageVisuals(token, workspaceId, pbiReportId, page)
  const tableVisual = visuals.find((v) => TABLE_VISUAL_TYPES.includes(v.type))
  if (!tableVisual) return { rows: [], dimensionKey: null }

  const rows = await exportVisualData(token, workspaceId, pbiReportId, page, tableVisual.id)
  if (rows.length === 0) return { rows: [], dimensionKey: null }

  // Primeira coluna de texto como dimensão
  const firstKey = Object.keys(rows[0])[0]
  return { rows: rows.slice(0, 10), dimensionKey: firstKey }
}

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
      "-y",
      "-i", mp3Path,
      "-c:a", "libopus",
      "-b:a", "32k",
      "-vbr", "on",
      "-compression_level", "10",
      oggPath,
    ])

    return await fs.promises.readFile(oggPath)
  } finally {
    fs.unlink(mp3Path, () => {})
    fs.unlink(oggPath, () => {})
  }
}

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
}): Promise<{ sent: number; error?: string }> {
  try {
    const token = await getAccessToken(input.companyId)

    let rows: Array<Record<string, unknown>> = []
    let dimensionKey: string | null = null

    // Tenta exportar dados do visual do relatório
    if (input.workspaceId && input.pbiReportId) {
      const result = await getVisualRows(token, input.workspaceId, input.pbiReportId, input.pageName)
      rows = result.rows
      dimensionKey = result.dimensionKey
      console.log("[audio] visual export", { rows: rows.length, dimensionKey })
    }

    // Fallback: SUMMARIZECOLUMNS por dimensão detectada
    if (rows.length === 0) {
      const metadata = await getDatasetMetadata(token, input.datasetId, {
        includeCustomChatMeasures: false,
      })

      const visibleMeasures = metadata.measures
        .filter((m) => !m.isHidden && m.tableName && m.measureName)
        .slice(0, 5)

      const dimensionColumn = metadata.columns.find(
        (c) =>
          !c.isHidden &&
          (c.dataType === "string" || c.dataType === "text") &&
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
          const result = await executeDAXQuery(token, input.datasetId, dax)
          if (result.rows.length > 0) {
            const firstRowKeys = Object.keys(result.rows[0])
            dimensionKey = firstRowKeys.find((k) =>
              k.toLowerCase().includes(colName.toLowerCase()) || k.includes("[")
            ) ?? firstRowKeys[0]
            rows = result.rows
          }
        } catch { /* ignora */ }
      }

      // Fallback final: totais
      if (rows.length === 0) {
        const totals: Record<string, unknown> = {}
        for (const measure of visibleMeasures) {
          try {
            const daxQuery = `EVALUATE ROW("${measure.measureName.replace(/"/g, '\\"')}", [${measure.measureName}])`
            const result = await executeDAXQuery(token, input.datasetId, daxQuery)
            if (result.rows.length > 0) {
              const value = Object.values(result.rows[0])[0]
              if (value !== null && value !== undefined) totals[measure.measureName] = value
            }
          } catch { /* ignora */ }
        }
        if (Object.keys(totals).length > 0) rows = [totals]
      }
    }

    const script = buildAudioScript(input.reportName, rows, dimensionKey)
    if (!script) throw new Error("Nao foi possivel gerar o roteiro de audio")

    console.log("[audio] script gerado", { reportName: input.reportName, words: script.split(/\s+/).length, rows: rows.length })

    const audioBuffer = await textToOgg(script, input.voice ?? "pt-BR-FranciscaNeural")
    const audioBase64 = audioBuffer.toString("base64")

    let sent = 0
    for (const contact of input.contacts) {
      if (!contact.phone && !contact.whatsapp_group_id) continue
      try {
        await sendWhatsAppBotMessage({
          instance_id: input.botInstanceId,
          phone: contact.phone,
          whatsapp_group_id: contact.whatsapp_group_id,
          audio_base64: audioBase64,
        })
        sent++
      } catch (sendErr) {
        console.error(
          "[audio] falha ao enviar para contato",
          contact.phone ?? contact.whatsapp_group_id,
          sendErr instanceof Error ? sendErr.message : sendErr
        )
      }
    }

    console.log("[audio] audio enviado", { reportName: input.reportName, sent, total: input.contacts.length })
    return { sent }
  } catch (err) {
    const error = err instanceof Error ? err.message : "Erro ao gerar audio"
    console.error("[audio] generateAndSendReportAudio falhou", error)
    return { sent: 0, error }
  }
}
