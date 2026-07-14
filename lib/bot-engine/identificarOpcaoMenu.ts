import type { BotMenuOptionRow, BotMenuWithOptions } from "./types"

function normalizar(texto: string) {
  return texto
    .trim()
    .toLowerCase()
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
}

/**
 * Identifica qual opcao do menu atual o cliente escolheu: por numero
 * ("1", "2️⃣") ou pelo texto do rotulo (ex: cliente digitou "pizza" em vez de "2").
 * Retorna null se a mensagem nao corresponde a nenhuma opcao do menu.
 */
export function identificarOpcaoMenu(
  menu: BotMenuWithOptions,
  mensagemTexto: string
): BotMenuOptionRow | null {
  const texto = mensagemTexto.trim()

  const matchNumero = texto.match(/^([1-9][0-9]?)(?:️?⃣)?$/)
  if (matchNumero) {
    const posicao = Number(matchNumero[1])
    const porPosicao = menu.options.find((option) => option.position === posicao)
    if (porPosicao) return porPosicao
  }

  const textoNormalizado = normalizar(texto)
  if (!textoNormalizado) return null

  const porRotulo = menu.options.find((option) => {
    const rotulo = normalizar(option.label)
    return rotulo && (textoNormalizado === rotulo || textoNormalizado.includes(rotulo))
  })

  return porRotulo ?? null
}
