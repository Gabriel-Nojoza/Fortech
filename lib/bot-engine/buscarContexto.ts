import type { BotContext } from "./types"

/**
 * Busca o contexto da empresa chamando o endpoint GET /api/bot/context ja existente.
 * Nao reimplementa a logica de leitura — apenas consome o endpoint, como pedido.
 */
export async function buscarContexto(session: string): Promise<BotContext> {
  const appUrl = process.env.NEXT_PUBLIC_APP_URL?.trim() || "http://127.0.0.1:3000"
  const platformSecret = process.env.PLATFORM_SCHEDULER_SECRET?.trim()

  if (!platformSecret) {
    throw new Error(
      "PLATFORM_SCHEDULER_SECRET nao configurado — necessario para o motor chamar /api/bot/context."
    )
  }

  const url = new URL("/api/bot/context", appUrl)
  url.searchParams.set("session", session)

  const response = await fetch(url.toString(), {
    method: "GET",
    headers: { "x-callback-secret": platformSecret },
    cache: "no-store",
  })

  const raw = await response.text()
  let parsed: unknown = null
  try {
    parsed = raw ? JSON.parse(raw) : null
  } catch {
    throw new Error(
      `Resposta invalida de /api/bot/context (status ${response.status}, esperava JSON): ${raw.slice(0, 200)}`
    )
  }

  if (!response.ok) {
    const errorMessage =
      parsed && typeof parsed === "object" && "error" in parsed
        ? String((parsed as { error?: unknown }).error)
        : `Erro ao buscar contexto do bot (status ${response.status})`
    throw new Error(errorMessage)
  }

  return parsed as BotContext
}
