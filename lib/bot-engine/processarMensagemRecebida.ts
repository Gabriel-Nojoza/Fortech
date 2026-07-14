import type { SupabaseClient } from "@supabase/supabase-js"
import { buscarContexto } from "./buscarContexto"
import { verificarHorarios } from "./verificarHorarios"
import { identificarPrimeiraMensagem } from "./identificarPrimeiraMensagem"
import { buscarPalavraChave } from "./buscarPalavraChave"
import { buscarMenu, buscarMenuRaiz } from "./buscarMenu"
import { renderizarMenu } from "./renderizarMenu"
import { identificarOpcaoMenu } from "./identificarOpcaoMenu"
import { buscarEstadoConversa, atualizarEstadoConversa } from "./estadoConversa"
import { executarIA } from "./executarIA"
import { transferirAtendente } from "./transferirAtendente"
import { enviarResposta } from "./enviarResposta"
import { registrarLog } from "./registrarLog"
import type {
  BotMenuOptionRow,
  BotMenuWithOptions,
  EngineAction,
  EngineResult,
  IncomingWahaMessage,
} from "./types"

/**
 * Motor do Bot WhatsApp: interpreta a mensagem recebida do WAHA e decide qual acao
 * executar. Fluxo: contexto -> bot ativo? -> horario -> primeira mensagem? -> estado
 * atual da conversa (dentro de um menu?) -> palavra-chave -> menu/submenu -> IA ->
 * transferencia humana.
 *
 * Cada etapa e uma funcao separada e reutilizavel (verificarHorarios,
 * identificarPrimeiraMensagem, buscarPalavraChave, identificarOpcaoMenu, executarIA,
 * transferirAtendente, enviarResposta, buscarMenu/buscarMenuRaiz, estadoConversa).
 * Este arquivo apenas orquestra a ordem.
 */
export async function processarMensagemRecebida(
  supabase: SupabaseClient,
  mensagem: IncomingWahaMessage
): Promise<EngineResult> {
  const inicio = Date.now()

  if (mensagem.fromMe || !mensagem.text.trim()) {
    return { action: "ignored", replyText: null, transferredTo: null }
  }

  // 2. Buscar o contexto da empresa (via /api/bot/context existente)
  const context = await buscarContexto(mensagem.session)

  await registrarLog(supabase, {
    companyId: context.company_id,
    contactPhone: mensagem.contactPhone,
    direction: "inbound",
  })

  async function responderEFinalizar(
    action: EngineAction,
    replyText: string | null,
    transferredTo: EngineResult["transferredTo"] = null
  ): Promise<EngineResult> {
    if (replyText) {
      await enviarResposta({
        session: mensagem.session,
        phone: mensagem.contactPhone,
        texto: replyText,
      })
    }

    await registrarLog(supabase, {
      companyId: context.company_id,
      contactPhone: mensagem.contactPhone,
      direction: "outbound",
      responseTimeMs: Date.now() - inicio,
      action,
    })

    return { action, replyText, transferredTo }
  }

  /** Aplica a acao de uma opcao de menu escolhida (abrir submenu, texto, transferir, encerrar). */
  async function aplicarOpcaoMenu(
    option: BotMenuOptionRow,
    actionLabel: EngineAction
  ): Promise<EngineResult> {
    switch (option.action_type) {
      case "open_menu": {
        const submenu = option.child_menu_id
          ? await buscarMenu(supabase, context.company_id, option.child_menu_id)
          : null

        if (!submenu) {
          await atualizarEstadoConversa(supabase, context.company_id, mensagem.contactPhone, null)
          return responderEFinalizar(
            "menu_navigation",
            "Essa opcao esta indisponivel no momento. Vamos recomecar?"
          )
        }

        await atualizarEstadoConversa(supabase, context.company_id, mensagem.contactPhone, submenu.id)
        return responderEFinalizar("menu_navigation", renderizarMenu(submenu))
      }

      case "transfer_human": {
        await atualizarEstadoConversa(supabase, context.company_id, mensagem.contactPhone, null)
        const transferencia = transferirAtendente(context, mensagem.contactPhone)
        return responderEFinalizar(
          "human_transfer",
          option.response_text || "Vou te encaminhar para um atendente, um momento por favor.",
          transferencia
            ? { type: transferencia.tipo, id: transferencia.destino.id, name: transferencia.destino.name }
            : null
        )
      }

      case "end_conversation": {
        await atualizarEstadoConversa(supabase, context.company_id, mensagem.contactPhone, null)
        return responderEFinalizar(actionLabel, option.response_text || null)
      }

      case "send_text":
      default: {
        await atualizarEstadoConversa(supabase, context.company_id, mensagem.contactPhone, null)
        return responderEFinalizar(actionLabel, option.response_text || null)
      }
    }
  }

  // 3. Verificar se o bot esta ativo (modulo habilitado + bot ligado)
  if (!context.module_enabled) {
    return responderEFinalizar("module_disabled", null)
  }
  if (!context.is_enabled) {
    return responderEFinalizar("bot_disabled", null)
  }

  // 4. Verificar horario de funcionamento
  const horarios = verificarHorarios(context)
  if (!horarios.dentroDoHorario) {
    return responderEFinalizar("outside_business_hours", horarios.mensagemForaDoExpediente)
  }

  // 5 e 6. Identificar primeira mensagem e enviar mensagem inicial + menu raiz quando necessario
  const primeiraMensagem = await identificarPrimeiraMensagem(
    supabase,
    context.company_id,
    mensagem.contactPhone
  )
  if (primeiraMensagem) {
    await enviarResposta({
      session: mensagem.session,
      phone: mensagem.contactPhone,
      texto: context.welcome_message,
    })

    const menuRaiz = await buscarMenuRaiz(supabase, context.company_id)
    if (menuRaiz) {
      await atualizarEstadoConversa(supabase, context.company_id, mensagem.contactPhone, menuRaiz.id)
      return responderEFinalizar("welcome_message", renderizarMenu(menuRaiz))
    }

    await registrarLog(supabase, {
      companyId: context.company_id,
      contactPhone: mensagem.contactPhone,
      direction: "outbound",
      responseTimeMs: Date.now() - inicio,
      action: "welcome_message",
    })
    return { action: "welcome_message", replyText: context.welcome_message, transferredTo: null }
  }

  // Estado da conversa: o contato esta no meio de um menu?
  const estado = await buscarEstadoConversa(supabase, context.company_id, mensagem.contactPhone)
  let menuAtual: BotMenuWithOptions | null = null
  if (estado?.current_menu_id) {
    menuAtual = await buscarMenu(supabase, context.company_id, estado.current_menu_id)
  }

  if (menuAtual) {
    const opcaoEscolhida = identificarOpcaoMenu(menuAtual, mensagem.text)
    if (opcaoEscolhida) {
      return aplicarOpcaoMenu(opcaoEscolhida, "menu_option")
    }
    // Mensagem nao corresponde a nenhuma opcao do menu atual — permite escape
    // por palavra-chave global (ex: "humano") antes de cair na IA.
  }

  // 7. Procurar correspondencia em palavras-chave (funciona dentro ou fora de um menu)
  const palavraChave = buscarPalavraChave(context, mensagem.text)
  if (palavraChave) {
    if (menuAtual) {
      await atualizarEstadoConversa(supabase, context.company_id, mensagem.contactPhone, null)
    }
    return responderEFinalizar("keyword_match", palavraChave.response)
  }

  // 8. Sem menu ativo: verificar se a mensagem corresponde a uma opcao do menu raiz
  if (!menuAtual) {
    const menuRaiz = await buscarMenuRaiz(supabase, context.company_id)
    if (menuRaiz) {
      const opcaoRaiz = identificarOpcaoMenu(menuRaiz, mensagem.text)
      if (opcaoRaiz) {
        return aplicarOpcaoMenu(opcaoRaiz, "menu_option")
      }
    }
  }

  // 9 e 10. Nenhuma regra encontrada -> encaminhar para a IA com o prompt da empresa
  const resultadoIA =
    context.ai.provider === "none"
      ? { resposta: "", solicitaAtendenteHumano: true }
      : await executarIA(context, mensagem.text)

  // 11. Se a IA solicitar atendimento humano (ou nao houver IA configurada), transferir
  if (resultadoIA.solicitaAtendenteHumano) {
    const transferencia = transferirAtendente(context, mensagem.contactPhone)
    const textoFinal =
      resultadoIA.resposta ||
      "Vou te encaminhar para um atendente, um momento por favor."

    return responderEFinalizar(
      "human_transfer",
      textoFinal,
      transferencia
        ? { type: transferencia.tipo, id: transferencia.destino.id, name: transferencia.destino.name }
        : null
    )
  }

  return responderEFinalizar("ai_response", resultadoIA.resposta)
}
