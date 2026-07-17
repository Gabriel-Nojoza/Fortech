import { NextRequest, NextResponse } from "next/server"
import { createServiceClient } from "@/lib/supabase/server"
import { resolveRequestCompanyContext } from "@/lib/n8n-auth"
import {
  normalizeBotBusinessHours,
  normalizeBotCatalogFile,
  normalizeBotGeneralSettings,
  normalizeBotModuleSettings,
  normalizeBotAiConfig,
  normalizeBotWelcomeMessageSettings,
} from "@/lib/bot"

/**
 * Endpoint enxuto para fluxos externos (n8n) buscarem o prompt de IA configurado
 * pelo cliente na plataforma, sem expor api_key/provider/model — esses campos so
 * importam para o motor nativo (/api/bot/context), que roda dentro do proprio
 * servidor. Aqui so trafega o que um fluxo externo precisa para montar o
 * "System Message" do agente de IA dinamicamente por empresa.
 */
export async function GET(request: NextRequest) {
  try {
    const { companyId } = await resolveRequestCompanyContext(request, {
      allowCallbackSecret: true,
    })
    const supabase = createServiceClient()

    const { data: rows, error } = await supabase
      .from("company_settings")
      .select("key, value")
      .eq("company_id", companyId)
      .in("key", [
        "bot_ai_config",
        "bot_general",
        "bot_module",
        "bot_welcome_message",
        "bot_business_hours",
        "bot_catalog_file",
      ])

    if (error) {
      throw error
    }

    const settingsMap = new Map((rows ?? []).map((row) => [row.key, row.value]))
    const ai = normalizeBotAiConfig(settingsMap.get("bot_ai_config"))
    const general = normalizeBotGeneralSettings(settingsMap.get("bot_general"))
    const botModule = normalizeBotModuleSettings(settingsMap.get("bot_module"))
    const welcome = normalizeBotWelcomeMessageSettings(settingsMap.get("bot_welcome_message"))
    const businessHours = normalizeBotBusinessHours(settingsMap.get("bot_business_hours"))
    const catalogFile = normalizeBotCatalogFile(settingsMap.get("bot_catalog_file"))

    return NextResponse.json({
      company_id: companyId,
      module_enabled: botModule.enabled,
      is_enabled: general.is_enabled,
      system_prompt: ai.system_prompt,
      welcome_message: welcome.message,
      business_hours_closed_message: businessHours.closed_message,
      catalog_file_url: catalogFile?.url ?? null,
      catalog_file_mimetype: catalogFile?.mimetype ?? null,
      catalog_file_name: catalogFile?.file_name ?? null,
    })
  } catch (error) {
    const message = error instanceof Error ? error.message : "Erro ao carregar prompt do bot"
    const status = message === "Callback secret invalido" ? 401 : 500
    return NextResponse.json({ error: message }, { status })
  }
}
