import { NextResponse } from "next/server"
import { createServiceClient as createClient } from "@/lib/supabase/server"
import { getRequestContext, isAuthContextError } from "@/lib/tenant"
import { readWhatsAppBotRuntimeState } from "@/lib/whatsapp-bot"
import {
  getDispatchLogEffectiveDate,
  getDispatchLogOutcome,
} from "@/lib/dispatch-log"

type DispatchLogStatsRecord = {
  status?: string | null
  error_message?: string | null
  created_at?: string | null
  started_at?: string | null
  completed_at?: string | null
}

export async function GET() {
  try {
    const { companyId } = await getRequestContext()
    const supabase = createClient()
    const botState = await readWhatsAppBotRuntimeState()
    const whatsappConnected = botState?.status === "connected"

    const now = new Date()
    const todayStart = new Date(now)
    todayStart.setHours(0, 0, 0, 0)
    const tomorrowStart = new Date(todayStart)
    tomorrowStart.setDate(tomorrowStart.getDate() + 1)

    const chartStart = new Date(todayStart)
    chartStart.setDate(chartStart.getDate() - 6)

    const thirtyDaysAgo = new Date(todayStart)
    thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 29)

    const [reportsRes, contactsRes, dispatchLogsRes, settingsRes] = await Promise.all([
        supabase
          .from("reports")
          .select("id", { count: "exact", head: true })
          .eq("company_id", companyId),
        supabase
          .from("contacts")
          .select("id", { count: "exact", head: true })
          .eq("company_id", companyId)
          .eq("is_active", true),
        supabase
          .from("dispatch_logs")
          .select("*")
          .eq("company_id", companyId),
        supabase
          .from("company_settings")
          .select("key, value")
          .eq("company_id", companyId)
          .in("key", ["powerbi", "n8n"]),
      ])

    const queryError =
      reportsRes.error ?? contactsRes.error ?? dispatchLogsRes.error ?? settingsRes.error

    if (queryError) {
      throw new Error(queryError.message)
    }

    const totalReports = reportsRes.count ?? 0
    const activeContacts = whatsappConnected ? contactsRes.count ?? 0 : 0

    const dispatchLogs = (dispatchLogsRes.data ?? []) as DispatchLogStatsRecord[]
    const logsWithDates = dispatchLogs.flatMap((log) => {
      const effectiveDate = getDispatchLogEffectiveDate(log)
      if (!effectiveDate) {
        return []
      }

      return [
        {
          effectiveDate,
          outcome: getDispatchLogOutcome(log),
        },
      ]
    })

    const dispatchesToday = logsWithDates.filter(
      (log) => log.effectiveDate >= todayStart && log.effectiveDate < tomorrowStart
    ).length
    const todayCompletedLogs = logsWithDates.filter(
      (log) =>
        log.effectiveDate >= todayStart &&
        log.effectiveDate < tomorrowStart &&
        log.outcome !== "ongoing"
    )
    const deliveredToday = todayCompletedLogs.filter(
      (log) => log.outcome === "delivered"
    ).length
    const failedToday = todayCompletedLogs.filter(
      (log) => log.outcome === "failed"
    ).length
    const inProgressToday = dispatchesToday - todayCompletedLogs.length

    const monthLogs = logsWithDates.filter((log) => log.effectiveDate >= thirtyDaysAgo)
    const completedMonthLogs = monthLogs.filter((log) => log.outcome !== "ongoing")
    const deliveredCount = completedMonthLogs.filter(
      (log) => log.outcome === "delivered"
    ).length
    const successRate =
      completedMonthLogs.length > 0
        ? Math.round((deliveredCount / completedMonthLogs.length) * 100)
        : null

    // Configuration status
    const settingsMap = new Map(
      (settingsRes.data ?? []).map((s) => [s.key, s.value])
    )
    const powerbi = settingsMap.get("powerbi") as Record<string, unknown> | undefined
    const n8n = settingsMap.get("n8n") as Record<string, unknown> | undefined
    const pbiConfigured = !!(powerbi?.client_id || process.env.PBI_CLIENT_ID)
    const n8nConfigured = !!(
      typeof n8n?.webhook_url === "string" &&
      n8n.webhook_url.trim() &&
      typeof n8n?.callback_secret === "string" &&
      n8n.callback_secret.trim()
    )

    // Chart data: last 7 days
    const chartData = []
    for (let i = 6; i >= 0; i--) {
      const d = new Date(chartStart)
      d.setDate(chartStart.getDate() + (6 - i))
      const dayStr = d.toLocaleDateString("pt-BR", {
        day: "2-digit",
        month: "2-digit",
      })
      const dayStart = new Date(d.getFullYear(), d.getMonth(), d.getDate())
      const dayEnd = new Date(d.getFullYear(), d.getMonth(), d.getDate() + 1)

      const dayItems = logsWithDates.filter((log) => {
        return log.effectiveDate >= dayStart && log.effectiveDate < dayEnd
      })

      chartData.push({
        date: dayStr,
        delivered: dayItems.filter((log) => log.outcome === "delivered").length,
        failed: dayItems.filter((log) => log.outcome === "failed").length,
      })
    }

    return NextResponse.json({
      totalReports,
      activeContacts,
      whatsappConnected,
      dispatchesToday,
      deliveredToday,
      failedToday,
      inProgressToday,
      completedDispatches30d: completedMonthLogs.length,
      successRate,
      pbiConfigured,
      n8nConfigured,
      chartData,
    })
  } catch (error) {
    if (isAuthContextError(error)) {
      return NextResponse.json(
        { error: error instanceof Error ? error.message : "Nao autenticado" },
        { status: 401 }
      )
    }

    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Erro" },
      { status: 500 }
    )
  }
}
