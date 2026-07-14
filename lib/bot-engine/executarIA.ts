import type { BotContext } from "./types"

export type ExecutarIAResultado = {
  resposta: string
  solicitaAtendenteHumano: boolean
}

const MARCADOR_TRANSFERENCIA = "[[TRANSFERIR_ATENDENTE]]"

function buildSystemPrompt(promptEmpresa: string) {
  const base = promptEmpresa.trim() || "Voce e um assistente de atendimento via WhatsApp."
  return `${base}\n\nSe o cliente precisar falar com um atendente humano (ou pedir isso explicitamente), inclua exatamente o texto ${MARCADOR_TRANSFERENCIA} em algum ponto da sua resposta.`
}

async function chamarOpenAI(
  ai: BotContext["ai"],
  systemPrompt: string,
  mensagem: string
): Promise<string> {
  const response = await fetch("https://api.openai.com/v1/chat/completions", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${ai.api_key}`,
    },
    body: JSON.stringify({
      model: ai.model || "gpt-4o-mini",
      messages: [
        { role: "system", content: systemPrompt },
        { role: "user", content: mensagem },
      ],
      temperature: ai.temperature,
      max_tokens: ai.max_tokens,
    }),
  })

  const raw = await response.text()
  if (!response.ok) {
    throw new Error(`OpenAI retornou ${response.status}: ${raw}`)
  }

  const data = JSON.parse(raw)
  return String(data?.choices?.[0]?.message?.content ?? "").trim()
}

async function chamarClaude(
  ai: BotContext["ai"],
  systemPrompt: string,
  mensagem: string
): Promise<string> {
  const response = await fetch("https://api.anthropic.com/v1/messages", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "x-api-key": ai.api_key,
      "anthropic-version": "2023-06-01",
    },
    body: JSON.stringify({
      model: ai.model || "claude-3-5-sonnet-latest",
      system: systemPrompt,
      max_tokens: ai.max_tokens,
      temperature: ai.temperature,
      messages: [{ role: "user", content: mensagem }],
    }),
  })

  const raw = await response.text()
  if (!response.ok) {
    throw new Error(`Claude retornou ${response.status}: ${raw}`)
  }

  const data = JSON.parse(raw)
  return String(data?.content?.[0]?.text ?? "").trim()
}

async function chamarGemini(
  ai: BotContext["ai"],
  systemPrompt: string,
  mensagem: string
): Promise<string> {
  const model = ai.model || "gemini-1.5-flash"
  const url = `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${ai.api_key}`

  const response = await fetch(url, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      systemInstruction: { parts: [{ text: systemPrompt }] },
      contents: [{ role: "user", parts: [{ text: mensagem }] }],
      generationConfig: {
        temperature: ai.temperature,
        maxOutputTokens: ai.max_tokens,
      },
    }),
  })

  const raw = await response.text()
  if (!response.ok) {
    throw new Error(`Gemini retornou ${response.status}: ${raw}`)
  }

  const data = JSON.parse(raw)
  return String(data?.candidates?.[0]?.content?.parts?.[0]?.text ?? "").trim()
}

async function chamarOllama(
  ai: BotContext["ai"],
  systemPrompt: string,
  mensagem: string
): Promise<string> {
  // O schema de configuracao de IA nao tem um campo dedicado de URL do servidor Ollama
  // (nenhuma tabela foi alterada para este motor). Convencao adotada: se "API Key"
  // estiver preenchido com uma URL, ela e usada como endereco do servidor Ollama;
  // caso contrario, usa o padrao local http://127.0.0.1:11434.
  const baseUrl = ai.api_key.trim().startsWith("http")
    ? ai.api_key.trim().replace(/\/+$/, "")
    : "http://127.0.0.1:11434"

  const response = await fetch(`${baseUrl}/api/chat`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      model: ai.model || "llama3",
      stream: false,
      messages: [
        { role: "system", content: systemPrompt },
        { role: "user", content: mensagem },
      ],
      options: { temperature: ai.temperature },
    }),
  })

  const raw = await response.text()
  if (!response.ok) {
    throw new Error(`Ollama retornou ${response.status}: ${raw}`)
  }

  const data = JSON.parse(raw)
  return String(data?.message?.content ?? "").trim()
}

/**
 * Executa a IA configurada pela empresa (context.ai) para responder a mensagem recebida.
 * Usa o prompt de sistema especifico da empresa (context.ai.system_prompt).
 * Se a IA decidir que precisa de atendimento humano, sinaliza via solicitaAtendenteHumano.
 */
export async function executarIA(
  context: BotContext,
  mensagemTexto: string
): Promise<ExecutarIAResultado> {
  const { ai } = context

  if (ai.provider === "none") {
    return { resposta: "", solicitaAtendenteHumano: false }
  }

  if (!ai.api_key.trim() && ai.provider !== "ollama") {
    throw new Error(`Provedor de IA "${ai.provider}" configurado sem API Key.`)
  }

  const systemPrompt = buildSystemPrompt(ai.system_prompt)

  let respostaBruta: string
  switch (ai.provider) {
    case "openai":
      respostaBruta = await chamarOpenAI(ai, systemPrompt, mensagemTexto)
      break
    case "claude":
      respostaBruta = await chamarClaude(ai, systemPrompt, mensagemTexto)
      break
    case "gemini":
      respostaBruta = await chamarGemini(ai, systemPrompt, mensagemTexto)
      break
    case "ollama":
      respostaBruta = await chamarOllama(ai, systemPrompt, mensagemTexto)
      break
    default:
      respostaBruta = ""
  }

  const solicitaAtendenteHumano = respostaBruta.includes(MARCADOR_TRANSFERENCIA)
  const resposta = respostaBruta.split(MARCADOR_TRANSFERENCIA).join("").trim()

  return { resposta, solicitaAtendenteHumano }
}
