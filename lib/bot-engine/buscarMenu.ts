import type { SupabaseClient } from "@supabase/supabase-js"
import type { BotMenuWithOptions } from "./types"

/** Busca um menu (com suas opcoes ativas, ordenadas) pelo id. */
export async function buscarMenu(
  supabase: SupabaseClient,
  companyId: string,
  menuId: string
): Promise<BotMenuWithOptions | null> {
  const [{ data: menu, error: menuError }, { data: options, error: optionsError }] =
    await Promise.all([
      supabase
        .from("bot_menus")
        .select("*")
        .eq("company_id", companyId)
        .eq("id", menuId)
        .eq("is_active", true)
        .maybeSingle(),
      supabase
        .from("bot_menu_options")
        .select("*")
        .eq("company_id", companyId)
        .eq("menu_id", menuId)
        .eq("is_active", true)
        .order("position", { ascending: true }),
    ])

  if (menuError) throw menuError
  if (optionsError) throw optionsError
  if (!menu) return null

  return { ...menu, options: options ?? [] }
}

/** Busca o menu raiz (inicial) configurado para a empresa, se existir. */
export async function buscarMenuRaiz(
  supabase: SupabaseClient,
  companyId: string
): Promise<BotMenuWithOptions | null> {
  const { data: raiz, error } = await supabase
    .from("bot_menus")
    .select("id")
    .eq("company_id", companyId)
    .eq("is_root", true)
    .eq("is_active", true)
    .maybeSingle()

  if (error) throw error
  if (!raiz) return null

  return buscarMenu(supabase, companyId, raiz.id)
}
