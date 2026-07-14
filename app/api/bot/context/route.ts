import { NextRequest, NextResponse } from "next/server"
import { createServiceClient } from "@/lib/supabase/server"
import { resolveRequestCompanyContext } from "@/lib/n8n-auth"
import { getTimePartsInTimeZone } from "@/lib/schedule-cron"
import {
  BOT_WEEKDAYS,
  normalizeBotAgentsConfig,
  normalizeBotAiConfig,
  normalizeBotBusinessHours,
  normalizeBotGeneralSettings,
  normalizeBotModuleSettings,
  normalizeBotWelcomeMessageSettings,
  type BotWeekday,
} from "@/lib/bot"

const NUMERIC_WEEKDAY_TO_BOT_WEEKDAY: Record<number, BotWeekday> = {
  0: "sunday",
  1: "monday",
  2: "tuesday",
  3: "wednesday",
  4: "thursday",
  5: "friday",
  6: "saturday",
}

function isWithinBusinessHours(
  today: BotWeekday,
  hours: ReturnType<typeof normalizeBotBusinessHours>["hours"],
  currentHour: number,
  currentMinute: number
) {
  const todayHours = hours[today]
  if (!todayHours.enabled) {
    return false
  }

  const currentMinutes = currentHour * 60 + currentMinute
  const [openHour, openMinute] = todayHours.open.split(":").map(Number)
  const [closeHour, closeMinute] = todayHours.close.split(":").map(Number)
  const openMinutes = openHour * 60 + (openMinute || 0)
  const closeMinutes = closeHour * 60 + (closeMinute || 0)

  return currentMinutes >= openMinutes && currentMinutes < closeMinutes
}

export async function GET(request: NextRequest) {
  try {
    const { companyId } = await resolveRequestCompanyContext(request, {
      allowCallbackSecret: true,
    })
    const supabase = createServiceClient()

    const [
      { data: rows, error: rowsError },
      { data: agentRows, error: agentsError },
      { data: keywordRows, error: keywordsError },
      { data: quickReplyRows, error: quickRepliesError },
      { data: transferRows, error: transfersError },
      { data: productRows, error: productsError },
    ] = await Promise.all([
      supabase
        .from("company_settings")
        .select("key, value")
        .eq("company_id", companyId)
        .in("key", [
          "bot_general",
          "bot_module",
          "bot_welcome_message",
          "bot_business_hours",
          "bot_ai_config",
          "bot_agents_config",
          "general",
        ]),
      supabase
        .from("bot_agents")
        .select("*")
        .eq("company_id", companyId)
        .eq("is_active", true)
        .order("priority", { ascending: false }),
      supabase
        .from("bot_keywords")
        .select("*")
        .eq("company_id", companyId)
        .eq("is_active", true),
      supabase
        .from("bot_quick_replies")
        .select("*")
        .eq("company_id", companyId)
        .eq("is_active", true),
      supabase
        .from("bot_transfer_targets")
        .select("*")
        .eq("company_id", companyId)
        .eq("is_active", true),
      supabase
        .from("bot_products")
        .select("*")
        .eq("company_id", companyId)
        .eq("is_active", true),
    ])

    for (const error of [
      rowsError,
      agentsError,
      keywordsError,
      quickRepliesError,
      transfersError,
      productsError,
    ]) {
      if (error) throw error
    }

    const settingsMap = new Map((rows ?? []).map((row) => [row.key, row.value]))
    const general = normalizeBotGeneralSettings(settingsMap.get("bot_general"))
    const botModule = normalizeBotModuleSettings(settingsMap.get("bot_module"))
    const welcome = normalizeBotWelcomeMessageSettings(settingsMap.get("bot_welcome_message"))
    const businessHours = normalizeBotBusinessHours(settingsMap.get("bot_business_hours"))
    const ai = normalizeBotAiConfig(settingsMap.get("bot_ai_config"))
    const agentsConfig = normalizeBotAgentsConfig(settingsMap.get("bot_agents_config"))
    const generalSettings = (settingsMap.get("general") as Record<string, unknown>) ?? {}
    const timeZone =
      typeof generalSettings.timezone === "string" && generalSettings.timezone.trim()
        ? generalSettings.timezone.trim()
        : "America/Sao_Paulo"

    const now = new Date()
    const timeParts = getTimePartsInTimeZone(now, timeZone)
    const today = NUMERIC_WEEKDAY_TO_BOT_WEEKDAY[timeParts.weekday]
    const isOpenNow = isWithinBusinessHours(
      today,
      businessHours.hours,
      timeParts.hour,
      timeParts.minute
    )

    return NextResponse.json({
      version: 1,
      generated_at: now.toISOString(),
      company_id: companyId,
      module_enabled: botModule.enabled,
      is_enabled: general.is_enabled,
      welcome_message: welcome.message,
      business_hours: {
        is_open_now: isOpenNow,
        today,
        closed_message: businessHours.closed_message,
        hours: BOT_WEEKDAYS.reduce(
          (acc, day) => ({ ...acc, [day]: businessHours.hours[day] }),
          {} as typeof businessHours.hours
        ),
      },
      ai,
      agents: {
        distribution: agentsConfig.distribution,
        list: agentRows ?? [],
      },
      keywords: keywordRows ?? [],
      quick_replies: quickReplyRows ?? [],
      transfer_targets: transferRows ?? [],
      products: productRows ?? [],
    })
  } catch (error) {
    const message = error instanceof Error ? error.message : "Erro ao carregar contexto do bot"
    const status = message === "Callback secret invalido" ? 401 : 500
    return NextResponse.json({ error: message }, { status })
  }
}
