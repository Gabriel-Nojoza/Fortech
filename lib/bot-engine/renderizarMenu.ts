import type { BotMenuWithOptions } from "./types"

/** Monta o texto do menu a partir das opcoes cadastradas (lista numerada). */
export function renderizarMenu(menu: BotMenuWithOptions): string {
  const linhas = menu.options.map((option) => `${option.position} - ${option.label}`)
  const corpo = [menu.prompt_text.trim(), ...linhas].filter(Boolean).join("\n")
  return corpo
}
