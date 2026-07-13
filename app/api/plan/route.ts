import { NextRequest, NextResponse } from "next/server"
import { createServiceClient } from "@/lib/supabase/server"
import {
  buildCompanySubscriptionValue,
  computeCompanySubscriptionStatus,
  getCompanyPlanDefinition,
  getCompanySubscriptionStatusLabel,
  getNextPlanCode,
  normalizeCompanySubscriptionSettings,
} from "@/lib/company-plan"
import { getRequestContext, isAuthContextError } from "@/lib/tenant"
import type { CompanyPlanInfo } from "@/lib/types"

function getAdminClient() {
  return createServiceClient()
}

async function loadCompanyPlanInfo(companyId: string): Promise<CompanyPlanInfo> {
  const supabase = getAdminClient()
  const [{ data: company, error: companyError }, { data: subscriptionRow, error: settingsError }] =
    await Promise.all([
      supabase
        .from("companies")
        .select("id, name, is_active")
        .eq("id", companyId)
        .single(),
      supabase
        .from("company_settings")
        .select("value")
        .eq("company_id", companyId)
        .eq("key", "subscription")
        .maybeSingle(),
    ])

  if (companyError) {
    throw companyError
  }

  if (settingsError) {
    throw settingsError
  }

  const subscription = normalizeCompanySubscriptionSettings(subscriptionRow?.value)
  const plan = getCompanyPlanDefinition(subscription.plan_code)
  const status = computeCompanySubscriptionStatus({
    isActive: company.is_active,
    nextDueDate: subscription.next_due_date,
  })

  return {
    companyId: company.id,
    companyName: company.name,
    planCode: plan.code,
    planName: plan.name,
    monthlyPrice: plan.monthlyPrice,
    monthlyPriceLabel: plan.monthlyPriceLabel,
    status,
    statusLabel: getCompanySubscriptionStatusLabel(status),
    isActive: company.is_active,
    nextDueDate: subscription.next_due_date,
    resources: plan.resources,
    requestedUpgradePlan: subscription.requested_upgrade_plan,
    requestedUpgradeAt: subscription.requested_upgrade_at,
    nextPlanCode: getNextPlanCode(plan.code),
  }
}

export async function GET() {
  try {
    const { companyId } = await getRequestContext()
    const planInfo = await loadCompanyPlanInfo(companyId)
    return NextResponse.json(planInfo)
  } catch (error) {
    if (isAuthContextError(error)) {
      return NextResponse.json({ error: "Nao autenticado" }, { status: 401 })
    }

    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Erro ao carregar plano" },
      { status: 500 }
    )
  }
}

export async function POST(request: NextRequest) {
  try {
    const { companyId } = await getRequestContext()
    const supabase = getAdminClient()
    const body = await request.json().catch(() => ({})) as { action?: string }

    if (body.action !== "request_upgrade") {
      return NextResponse.json({ error: "Acao invalida" }, { status: 400 })
    }

    const currentPlanInfo = await loadCompanyPlanInfo(companyId)
    const nextPlanCode = currentPlanInfo.nextPlanCode

    if (!nextPlanCode) {
      return NextResponse.json(
        { error: "Seu plano atual ja esta no nivel maximo." },
        { status: 400 }
      )
    }

    const { data: subscriptionRow, error: subscriptionError } = await supabase
      .from("company_settings")
      .select("value")
      .eq("company_id", companyId)
      .eq("key", "subscription")
      .maybeSingle()

    if (subscriptionError) {
      throw subscriptionError
    }

    const nextSubscription = buildCompanySubscriptionValue(
      {
        requested_upgrade_plan: nextPlanCode,
        requested_upgrade_at: new Date().toISOString(),
      },
      subscriptionRow?.value
    )

    const { error: upsertError } = await supabase
      .from("company_settings")
      .upsert(
        {
          company_id: companyId,
          key: "subscription",
          value: nextSubscription,
          updated_at: new Date().toISOString(),
        },
        { onConflict: "company_id,key" }
      )

    if (upsertError) {
      throw upsertError
    }

    const updatedPlanInfo = await loadCompanyPlanInfo(companyId)
    return NextResponse.json(updatedPlanInfo)
  } catch (error) {
    if (isAuthContextError(error)) {
      return NextResponse.json({ error: "Nao autenticado" }, { status: 401 })
    }

    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Erro ao solicitar upgrade" },
      { status: 500 }
    )
  }
}
