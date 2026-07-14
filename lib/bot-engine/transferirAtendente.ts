import type { BotAgentRow, BotContext, BotTransferTargetRow } from "./types"

export type TransferenciaResultado = {
  tipo: "agent" | "transfer_target"
  destino: BotAgentRow | BotTransferTargetRow
} | null

function escolherPorHash(lista: BotAgentRow[], chave: string) {
  let hash = 0
  for (let i = 0; i < chave.length; i++) {
    hash = (hash * 31 + chave.charCodeAt(i)) >>> 0
  }
  return lista[hash % lista.length]
}

/**
 * Escolhe para quem transferir a conversa: um atendente cadastrado (seguindo a
 * estrategia de distribuicao da empresa) ou, na falta de atendentes, um destino
 * de transferencia do tipo "human" cadastrado. Reutilizavel em qualquer ponto
 * do motor que precise encaminhar para atendimento humano.
 */
export function transferirAtendente(
  context: BotContext,
  contactPhone: string
): TransferenciaResultado {
  const atendentesAtivos = context.agents.list.filter((agent) => agent.is_active)

  if (atendentesAtivos.length > 0) {
    let escolhido: BotAgentRow

    switch (context.agents.distribution) {
      case "random":
        escolhido = atendentesAtivos[Math.floor(Math.random() * atendentesAtivos.length)]
        break
      case "least_queue":
        // Sem uma tabela de filas/atendimentos em andamento (nenhuma tabela nova foi
        // criada para este motor), nao ha como medir "menor fila" com precisao ainda.
        // Usa o atendente de maior prioridade como aproximacao razoavel.
        escolhido = [...atendentesAtivos].sort((a, b) => b.priority - a.priority)[0]
        break
      case "round_robin":
      default:
        escolhido = escolherPorHash(atendentesAtivos, contactPhone)
        break
    }

    return { tipo: "agent", destino: escolhido }
  }

  const destinoHumano = context.transfer_targets.find(
    (target) => target.is_active && target.type === "human"
  )

  if (destinoHumano) {
    return { tipo: "transfer_target", destino: destinoHumano }
  }

  return null
}
