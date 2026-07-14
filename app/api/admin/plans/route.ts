import { NextRequest, NextResponse } from "next/server"
import { z } from "zod"
import { createServiceClient } from "@/lib/supabase/server"
import { listCompanyPlans, mapPlanRow } from "@/lib/company-plan"
import { requireAdminContext, requirePlatformAdminContext } from "@/lib/tenant"

function normalizePlanCode(value: string) {
  return value
    .trim()
    .toUpperCase()
    .replace(/[^A-Z0-9_]+/g, "_")
    .replace(/^_+|_+$/g, "")
}

const createPlanSchema = z.object({
  code: z.string().trim().min(1, "Codigo do plano obrigatorio"),
  name: z.string().trim().min(1, "Nome do plano obrigatorio"),
  monthly_price: z.number().min(0, "Valor mensal invalido"),
  resources: z.array(z.string().trim().min(1)).default([]),
  report_builder: z.boolean().default(false),
  campaigns: z.boolean().default(false),
  excel_export: z.boolean().default(false),
  campaign_client_preview: z.boolean().default(false),
  is_active: z.boolean().default(true),
})

const updatePlanSchema = z.object({
  id: z.string().uuid(),
  name: z.string().trim().min(1, "Nome do plano obrigatorio").optional(),
  monthly_price: z.number().min(0, "Valor mensal invalido").optional(),
  resources: z.array(z.string().trim().min(1)).optional(),
  report_builder: z.boolean().optional(),
  campaigns: z.boolean().optional(),
  excel_export: z.boolean().optional(),
  campaign_client_preview: z.boolean().optional(),
  is_active: z.boolean().optional(),
})

function getAdminClient() {
  return createServiceClient()
}

export async function GET() {
  try {
    await requireAdminContext()
    const supabase = getAdminClient()
    const plans = await listCompanyPlans(supabase, { includeInactive: true })
    return NextResponse.json(plans)
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Erro ao listar planos" },
      { status: 500 }
    )
  }
}

export async function POST(request: NextRequest) {
  try {
    await requirePlatformAdminContext()
    const supabase = getAdminClient()
    const body = await request.json()
    const parsed = createPlanSchema.safeParse(body)

    if (!parsed.success) {
      return NextResponse.json(
        { error: parsed.error.flatten().fieldErrors },
        { status: 400 }
      )
    }

    const data = parsed.data
    const code = normalizePlanCode(data.code)

    if (!code) {
      return NextResponse.json({ error: "Codigo do plano invalido" }, { status: 400 })
    }

    const { data: maxSortRow } = await supabase
      .from("plans")
      .select("sort_order")
      .order("sort_order", { ascending: false })
      .limit(1)
      .maybeSingle()

    const nextSortOrder = (maxSortRow?.sort_order ?? 0) + 1

    const { data: created, error } = await supabase
      .from("plans")
      .insert({
        code,
        name: data.name,
        monthly_price: data.monthly_price,
        resources: data.resources,
        report_builder: data.report_builder,
        campaigns: data.campaigns,
        excel_export: data.excel_export,
        campaign_client_preview: data.campaign_client_preview,
        is_active: data.is_active,
        sort_order: nextSortOrder,
        updated_at: new Date().toISOString(),
      })
      .select("*")
      .single()

    if (error) {
      const message = error.code === "23505" ? `Ja existe um plano com o codigo "${code}".` : error.message
      return NextResponse.json({ error: message }, { status: 400 })
    }

    return NextResponse.json(mapPlanRow(created), { status: 201 })
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Erro ao criar plano" },
      { status: 500 }
    )
  }
}

export async function PUT(request: NextRequest) {
  try {
    await requirePlatformAdminContext()
    const supabase = getAdminClient()
    const body = await request.json()
    const parsed = updatePlanSchema.safeParse(body)

    if (!parsed.success) {
      return NextResponse.json(
        { error: parsed.error.flatten().fieldErrors },
        { status: 400 }
      )
    }

    const { id, ...rest } = parsed.data
    const updatePayload: Record<string, unknown> = { updated_at: new Date().toISOString() }

    if (rest.name !== undefined) updatePayload.name = rest.name
    if (rest.monthly_price !== undefined) updatePayload.monthly_price = rest.monthly_price
    if (rest.resources !== undefined) updatePayload.resources = rest.resources
    if (rest.report_builder !== undefined) updatePayload.report_builder = rest.report_builder
    if (rest.campaigns !== undefined) updatePayload.campaigns = rest.campaigns
    if (rest.excel_export !== undefined) updatePayload.excel_export = rest.excel_export
    if (rest.campaign_client_preview !== undefined)
      updatePayload.campaign_client_preview = rest.campaign_client_preview
    if (rest.is_active !== undefined) updatePayload.is_active = rest.is_active

    const { data: updated, error } = await supabase
      .from("plans")
      .update(updatePayload)
      .eq("id", id)
      .select("*")
      .single()

    if (error) {
      return NextResponse.json({ error: error.message }, { status: 400 })
    }

    return NextResponse.json(mapPlanRow(updated))
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Erro ao atualizar plano" },
      { status: 500 }
    )
  }
}
