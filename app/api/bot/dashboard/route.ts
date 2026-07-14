import { NextResponse } from "next/server"
import { createServiceClient } from "@/lib/supabase/server"
import { normalizeBotGeneralSettings } from "@/lib/bot"
import { getRequestContext, isAuthContextError } from "@/lib/tenant"

export async function GET() {
  try {
    const { companyId } = await getRequestContext()
    const supabase = createServiceClient()

    const startOfToday = new Date()
    startOfToday.setHours(0, 0, 0, 0)

    const [{ data: generalRow }, { data: todayLogs, error: logsError }, { data: lastLog }] =
      await Promise.all([
        supabase
          .from("company_settings")
          .select("value")
          .eq("company_id", companyId)
          .eq("key", "bot_general")
          .maybeSingle(),
        supabase
          .from("bot_message_logs")
          .select("contact_phone, direction, response_time_ms, created_at")
          .eq("company_id", companyId)
          .gte("created_at", startOfToday.toISOString()),
        supabase
          .from("bot_message_logs")
          .select("created_at")
          .eq("company_id", companyId)
          .order("created_at", { ascending: false })
          .limit(1)
          .maybeSingle(),
      ])

    if (logsError) {
      throw logsError
    }

    const logs = todayLogs ?? []
    const messagesToday = logs.length
    const attendancesToday = new Set(
      logs.map((log) => log.contact_phone).filter((phone): phone is string => Boolean(phone))
    ).size

    const responseTimes = logs
      .map((log) => log.response_time_ms)
      .filter((value): value is number => typeof value === "number")
    const avgResponseTimeMs =
      responseTimes.length > 0
        ? Math.round(responseTimes.reduce((sum, value) => sum + value, 0) / responseTimes.length)
        : null

    const { is_enabled: isEnabled } = normalizeBotGeneralSettings(generalRow?.value)

    return NextResponse.json({
      is_enabled: isEnabled,
      messages_today: messagesToday,
      attendances_today: attendancesToday,
      avg_response_time_ms: avgResponseTimeMs,
      last_activity_at: lastLog?.created_at ?? null,
    })
  } catch (error) {
    if (isAuthContextError(error)) {
      return NextResponse.json({ error: "Nao autenticado" }, { status: 401 })
    }
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Erro ao carregar dashboard do bot" },
      { status: 500 }
    )
  }
}
