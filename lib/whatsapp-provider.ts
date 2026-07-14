import type { SupabaseClient } from "@supabase/supabase-js"

export const WHATSAPP_PROVIDER_VALUES = ["bot", "waha"] as const

export type WhatsAppProvider = (typeof WHATSAPP_PROVIDER_VALUES)[number]

const DEFAULT_WHATSAPP_PROVIDER: WhatsAppProvider = "bot"

export function normalizeWhatsAppProvider(value: unknown): WhatsAppProvider {
  if (typeof value !== "string") {
    return DEFAULT_WHATSAPP_PROVIDER
  }

  const normalized = value.trim().toLowerCase()
  return WHATSAPP_PROVIDER_VALUES.includes(normalized as WhatsAppProvider)
    ? (normalized as WhatsAppProvider)
    : DEFAULT_WHATSAPP_PROVIDER
}

export function parseWhatsAppProviderSetting(value: unknown): WhatsAppProvider {
  if (value && typeof value === "object" && "provider" in value) {
    return normalizeWhatsAppProvider((value as { provider?: unknown }).provider)
  }

  return normalizeWhatsAppProvider(value)
}

export function buildWhatsAppProviderSetting(provider: WhatsAppProvider) {
  return {
    provider: normalizeWhatsAppProvider(provider),
  }
}

export function getWhatsAppProviderLabel(provider: WhatsAppProvider) {
  return provider === "waha" ? "WAHA" : "WhatsApp Relatorios"
}

export function isWahaProvider(provider: WhatsAppProvider) {
  return provider === "waha"
}

export function isLegacyBotProvider(provider: WhatsAppProvider) {
  return provider === "bot"
}

export async function readCompanyWhatsAppProvider(
  supabase: SupabaseClient,
  companyId: string
): Promise<WhatsAppProvider> {
  const { data, error } = await supabase
    .from("company_settings")
    .select("value")
    .eq("company_id", companyId)
    .eq("key", "whatsapp_provider")
    .maybeSingle()

  if (error) {
    throw error
  }

  return parseWhatsAppProviderSetting(data?.value)
}

export async function assertCompanyWhatsAppProvider(
  supabase: SupabaseClient,
  companyId: string,
  expectedProvider: WhatsAppProvider
) {
  const currentProvider = await readCompanyWhatsAppProvider(supabase, companyId)

  if (currentProvider !== expectedProvider) {
    throw new Error(
      `Esta empresa esta configurada para ${getWhatsAppProviderLabel(currentProvider)}. Altere o canal no cadastro da empresa para usar ${getWhatsAppProviderLabel(expectedProvider)}.`
    )
  }

  return currentProvider
}
