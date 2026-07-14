import type { BotContext, BotKeywordRow } from "./types"

function normalizar(texto: string) {
  return texto
    .trim()
    .toLowerCase()
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
}

/**
 * Procura uma palavra-chave cadastrada que corresponda ao texto recebido.
 * Correspondencia por inclusao (o gatilho aparece em qualquer parte da mensagem),
 * sem acentos/caixa, para tolerar variacoes naturais de digitacao.
 */
export function buscarPalavraChave(
  context: BotContext,
  mensagemTexto: string
): BotKeywordRow | null {
  const mensagemNormalizada = normalizar(mensagemTexto)
  if (!mensagemNormalizada) {
    return null
  }

  const encontrada = context.keywords.find((keyword) => {
    const gatilho = normalizar(keyword.trigger)
    return gatilho && mensagemNormalizada.includes(gatilho)
  })

  return encontrada ?? null
}
