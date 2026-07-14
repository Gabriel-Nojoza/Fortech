import type { BotContext } from "./types"

export type VerificarHorariosResultado = {
  dentroDoHorario: boolean
  mensagemForaDoExpediente: string
}

/**
 * Verifica se o horario atual esta dentro do expediente configurado pela empresa.
 * O calculo de data/hora ja vem pronto do /api/bot/context (is_open_now), entao esta
 * funcao apenas interpreta o resultado — reutilizavel em qualquer ponto do motor.
 */
export function verificarHorarios(context: BotContext): VerificarHorariosResultado {
  return {
    dentroDoHorario: context.business_hours.is_open_now,
    mensagemForaDoExpediente: context.business_hours.closed_message,
  }
}
