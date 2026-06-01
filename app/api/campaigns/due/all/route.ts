import { NextRequest, NextResponse } from "next/server"
import { createServiceClient } from "@/lib/supabase/server"
import { isSameMinuteInTimeZone, matchesCronValue } from "@/lib/schedule-cron"

function getRequestOrigin(request: NextRequest) {
  return (
    process.env.NEXT_PUBLIC_APP_URL?.trim() ||
    request.headers.get("origin") ||
    new URL(request.url).origin
  )
}

export async function GET(request: NextRequest) {
  try {
    const platformSecret = process.env.PLATFORM_SCHEDULER_SECRET?.trim()
    if (!platformSecret) {
      return NextResponse.json({ error: "Endpoint nao configurado" }, { status: 503 })
    }

    const headerSecret = request.headers.get("x-callback-secret")?.trim()
    const querySecret = new URL(request.url).searchParams.get("secret")?.trim()
    const incomingSecret = headerSecret || querySecret || ""

    if (incomingSecret !== platformSecret) {
      return NextResponse.json({ error: "Nao autorizado" }, { status: 401 })
    }

    const supabase = createServiceClient()
    const now = new Date()

    const { data: campaigns, error } = await supabase
      .from("campaigns")
      .select("id, company_id, name, cron_expression, last_run_at, is_active")
      .eq("is_active", true)
      .not("cron_expression", "is", null)

    if (error) {
      return NextResponse.json({ error: error.message }, { status: 500 })
    }

    const { data: settingsRows } = await supabase
      .from("company_settings")
      .select("company_id, value")
      .eq("key", "general")

    const timezoneByCompany = new Map<string, string>()
    for (const row of settingsRows ?? []) {
      const tz = (row.value as Record<string, unknown> | null)?.timezone
      if (typeof tz === "string" && tz.trim()) {
        timezoneByCompany.set(row.company_id, tz.trim())
      }
    }

    type CampaignRow = { id: string; company_id: string; name: string; cron_expression: string; last_run_at: string | null }

    const dueCampaigns = ((campaigns ?? []) as CampaignRow[]).filter((c) => {
      if (!c.cron_expression?.trim()) return false
      const timeZone = timezoneByCompany.get(c.company_id) ?? "America/Sao_Paulo"
      if (!matchesCronValue(c.cron_expression, now, timeZone)) return false
      if (!c.last_run_at) return true
      const lastRunAt = new Date(c.last_run_at)
      if (Number.isNaN(lastRunAt.getTime())) return true
      return !isSameMinuteInTimeZone(lastRunAt, now, timeZone)
    })

    if (dueCampaigns.length > 0) {
      const claimedAt = now.toISOString()
      await Promise.all(
        dueCampaigns.map((c) =>
          supabase
            .from("campaigns")
            .update({ last_run_at: claimedAt })
            .eq("company_id", c.company_id)
            .eq("id", c.id)
        )
      )
    }

    const appUrl = getRequestOrigin(request)
    const runUrl = `${appUrl}/api/campaigns/run`

    return NextResponse.json({
      source: "platform",
      evaluated_at: now.toISOString(),
      run_url: runUrl,
      total_due: dueCampaigns.length,
      campaigns: dueCampaigns.map((c) => ({
        id: c.id,
        company_id: c.company_id,
        name: c.name,
        cron_expression: c.cron_expression,
        run_body: {
          campaign_id: c.id,
          company_id: c.company_id,
        },
      })),
    })
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Erro ao listar campanhas vencidas" },
      { status: 500 }
    )
  }
}
