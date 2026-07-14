import { sendWahaMessage } from "@/lib/waha"

export type EnviarRespostaParams = {
  session: string
  phone: string
  texto: string
}

/**
 * Envia a resposta ao contato via WAHA — sistema proprio do Bot WhatsApp
 * conversacional, separado do bot antigo (Baileys) usado para disparo de
 * relatorios. Chama o WAHA diretamente (mesma sessao que recebeu a mensagem),
 * sem passar por /api/bot/send.
 */
export async function enviarResposta(params: EnviarRespostaParams): Promise<void> {
  await sendWahaMessage(params.session, {
    phone: params.phone,
    text: params.texto,
  })
}
