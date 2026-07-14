import type { SupabaseClient } from "@supabase/supabase-js"
import type { BotConversationStateRow } from "./types"

/** Busca em qual etapa (menu) o contato esta atualmente, se houver. */
export async function buscarEstadoConversa(
  supabase: SupabaseClient,
  companyId: string,
  contactPhone: string
): Promise<BotConversationStateRow | null> {
  const { data, error } = await supabase
    .from("bot_conversation_states")
    .select("*")
    .eq("company_id", companyId)
    .eq("contact_phone", contactPhone)
    .maybeSingle()

  if (error) throw error
  return data
}

/**
 * Atualiza a etapa atual do contato. Passar currentMenuId como null volta o
 * contato para o estado inicial (fora de qualquer menu).
 */
export async function atualizarEstadoConversa(
  supabase: SupabaseClient,
  companyId: string,
  contactPhone: string,
  currentMenuId: string | null
): Promise<void> {
  const { error } = await supabase.from("bot_conversation_states").upsert(
    {
      company_id: companyId,
      contact_phone: contactPhone,
      current_menu_id: currentMenuId,
      updated_at: new Date().toISOString(),
    },
    { onConflict: "company_id,contact_phone" }
  )

  if (error) throw error
}
