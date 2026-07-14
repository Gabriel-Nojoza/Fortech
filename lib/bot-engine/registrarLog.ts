import type { SupabaseClient } from "@supabase/supabase-js"
import type { EngineAction } from "./types"

export type RegistrarLogParams = {
  companyId: string
  contactPhone: string
  direction: "inbound" | "outbound"
  responseTimeMs?: number | null
  action?: EngineAction
}

/**
 * Registra a mensagem/decisao em log, usando a tabela bot_message_logs ja existente
 * (nenhuma tabela nova criada). A tabela nao possui coluna para o motivo da decisao,
 * entao a acao tomada (EngineAction) e registrada nos logs do servidor (console.log)
 * para nao exigir alteracao de schema, enquanto os dados mensuraveis (contato,
 * direcao, tempo de resposta) vao para o banco e alimentam o Dashboard do Bot.
 */
export async function registrarLog(
  supabase: SupabaseClient,
  params: RegistrarLogParams
): Promise<void> {
  const { error } = await supabase.from("bot_message_logs").insert({
    company_id: params.companyId,
    contact_phone: params.contactPhone,
    direction: params.direction,
    response_time_ms: params.responseTimeMs ?? null,
  })

  if (error) {
    throw error
  }

  if (params.action) {
    console.log("[bot-engine] decisao registrada", {
      companyId: params.companyId,
      contactPhone: params.contactPhone,
      direction: params.direction,
      action: params.action,
    })
  }
}
