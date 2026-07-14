import type { SupabaseClient } from "@supabase/supabase-js"

/**
 * Identifica se esta e a primeira mensagem recebida desse contato para a empresa,
 * consultando a tabela bot_message_logs ja existente (nenhuma tabela nova criada).
 */
export async function identificarPrimeiraMensagem(
  supabase: SupabaseClient,
  companyId: string,
  contactPhone: string
): Promise<boolean> {
  const { data, error } = await supabase
    .from("bot_message_logs")
    .select("id")
    .eq("company_id", companyId)
    .eq("contact_phone", contactPhone)
    .eq("direction", "inbound")
    .limit(1)
    .maybeSingle()

  if (error) {
    throw error
  }

  return !data
}
