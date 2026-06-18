import { execFile } from "child_process"
import { promisify } from "util"
import * as fs from "fs"
import * as path from "path"
import * as os from "os"
import { executeDAXQuery, getDatasetMetadata, getAccessToken } from "@/lib/powerbi"
import { sendWhatsAppBotMessage } from "@/lib/whatsapp-bot"

const execFileAsync = promisify(execFile)

async function generateAudioScript(
  reportName: string,
  data: Record<string, unknown>
): Promise<string> {
  const dataLines = Object.entries(data)
    .filter(([, v]) => v !== null && v !== undefined && v !== "")
    .map(([k, v]) => `- ${k}: ${v}`)
    .join("\n")

  const prompt = dataLines
    ? `Você é um assistente de análise de negócios. Crie um texto de narração em áudio (máximo 80 palavras) em português brasileiro sobre o relatório "${reportName}".\n\nDados do relatório:\n${dataLines}\n\nO texto deve:\n- Iniciar com uma saudação profissional curta\n- Mencionar os principais números de forma natural\n- Ser conversacional, como se estivesse sendo narrado\n- Terminar com uma mensagem motivacional de uma frase\n\nResponda APENAS com o texto de narração, sem markdown, listas ou explicações.`
    : `Você é um assistente de análise de negócios. Crie um texto de narração em áudio (máximo 60 palavras) em português brasileiro informando que o relatório "${reportName}" foi enviado e está disponível para consulta. Seja profissional e motivacional. Responda APENAS com o texto de narração.`

  const controller = new AbortController()
  const timeoutId = setTimeout(() => controller.abort(), 90_000)

  try {
    const resp = await fetch("http://localhost:11434/api/generate", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ model: "llama3.2", prompt, stream: false }),
      signal: controller.signal,
    })

    if (!resp.ok) throw new Error(`Ollama retornou ${resp.status}`)
    const json = await resp.json() as { response?: unknown }
    return typeof json.response === "string" ? json.response.trim() : ""
  } finally {
    clearTimeout(timeoutId)
  }
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
  contacts: Array<{ phone?: string | null; whatsapp_group_id?: string | null }>
  botInstanceId: string | null
  voice?: string
}): Promise<{ sent: number; error?: string }> {
  try {
    const token = await getAccessToken(input.companyId)
    const metadata = await getDatasetMetadata(token, input.datasetId, {
      includeCustomChatMeasures: false,
    })

    const visibleMeasures = metadata.measures
      .filter((m) => !m.isHidden && m.tableName && m.measureName)
      .slice(0, 8)

    let reportData: Record<string, unknown> = {}

    if (visibleMeasures.length > 0) {
      const rowItems = visibleMeasures
        .map((m) => `"${m.measureName}", '${m.tableName}'[${m.measureName}]`)
        .join(", ")
      const daxQuery = `EVALUATE ROW(${rowItems})`

      try {
        const result = await executeDAXQuery(token, input.datasetId, daxQuery)
        if (result.rows.length > 0) reportData = result.rows[0]
      } catch (daxErr) {
        console.warn("[audio] DAX query failed, continuing without data", daxErr instanceof Error ? daxErr.message : daxErr)
      }
    }

    const script = await generateAudioScript(input.reportName, reportData)
    if (!script) throw new Error("Ollama nao gerou o roteiro de audio")

    console.log("[audio] script gerado", { reportName: input.reportName, words: script.split(/\s+/).length })

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
