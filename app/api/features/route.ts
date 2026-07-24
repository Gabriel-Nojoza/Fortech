import { NextResponse } from "next/server"
import { createServiceClient as createClient } from "@/lib/supabase/server"
import {
  computeCompanySubscriptionStatus,
  getCompanyPlanDefinition,
  getCompanySubscriptionStatusLabel,
  normalizeCompanySubscriptionSettings,
} from "@/lib/company-plan"
import { getRequestContext, isAuthContextError } from "@/lib/tenant"
import { normalizeBotModuleSettings } from "@/lib/bot"

export type CompanyFeatures = {
  reportBuilder: boolean
  campaigns: boolean
  excelExport: boolean
  appName: string
  daxCalculatetable: boolean
  hideZeroRows: boolean
  hideZeroRowsIncludeDevolution: boolean
  campaignClientPreview: boolean
  schedules: boolean
  operationalSummary: boolean
  logs: boolean
  daxPreserveGroupBy: boolean
  planCode: string
  planName: string
  monthlyPrice: number
  monthlyPriceLabel: string
  subscriptionStatus: "active" | "suspended" | "past_due"
  subscriptionStatusLabel: string
  nextDueDate: string | null
  botModuleEnabled: boolean
}

export async function GET() {
  try {
    const { companyId } = await getRequestContext()
    const supabase = createClient()

    const { data: rows } = await supabase
      .from("company_settings")
      .select("key, value")
      .eq("company_id", companyId)
      .in("key", ["features", "general", "subscription", "bot_module"])

    const { data: companyRow } = await supabase
      .from("companies")
      .select("is_active")
      .eq("id", companyId)
      .maybeSingle()

    const settingsMap: Record<string, Record<string, unknown>> = {}
    for (const row of rows ?? []) {
      settingsMap[row.key] = (row.value ?? {}) as Record<string, unknown>
    }

    const features = settingsMap.features ?? {}
    const general = settingsMap.general ?? {}
    const subscription = normalizeCompanySubscriptionSettings(settingsMap.subscription)
    const botModule = normalizeBotModuleSettings(settingsMap.bot_module)
    const plan = await getCompanyPlanDefinition(supabase, subscription.plan_code)
    const planFeatures = plan.appFeatures
    const subscriptionStatus = computeCompanySubscriptionStatus({
      isActive: companyRow?.is_active !== false,
      nextDueDate: subscription.next_due_date,
    })

    return NextResponse.json({
      reportBuilder:
        typeof features.report_builder === "boolean"
          ? features.report_builder
          : planFeatures.reportBuilder,
      campaigns:
        typeof features.campaigns === "boolean"
          ? features.campaigns
          : planFeatures.campaigns,
      excelExport:
        typeof features.excel_export === "boolean"
          ? features.excel_export
          : planFeatures.excelExport,
      appName: typeof general.app_name === "string" ? general.app_name : "",
      daxCalculatetable: features.dax_calculatetable === true,
      hideZeroRows: features.hide_zero_rows === true,
      hideZeroRowsIncludeDevolution: features.hide_zero_rows_include_devolution === true,
      campaignClientPreview:
        typeof features.campaign_client_preview === "boolean"
          ? features.campaign_client_preview
          : planFeatures.campaignClientPreview,
      schedules:
        typeof features.schedules === "boolean"
          ? features.schedules
          : planFeatures.schedules,
      operationalSummary:
        typeof features.operational_summary === "boolean"
          ? features.operational_summary
          : planFeatures.operationalSummary,
      logs:
        typeof features.logs === "boolean" ? features.logs : planFeatures.logs,
      daxPreserveGroupBy: features.dax_preserve_groupby === true,
      planCode: plan.code,
      planName: plan.name,
      monthlyPrice: plan.monthlyPrice,
      monthlyPriceLabel: plan.monthlyPriceLabel,
      subscriptionStatus,
      subscriptionStatusLabel: getCompanySubscriptionStatusLabel(subscriptionStatus),
      nextDueDate: subscription.next_due_date,
      botModuleEnabled: botModule.enabled,
    } satisfies CompanyFeatures)
  } catch (error) {
    if (isAuthContextError(error)) {
      return NextResponse.json({ error: "Nao autenticado" }, { status: 401 })
    }
    return NextResponse.json({ error: "Erro interno" }, { status: 500 })
  }
}
