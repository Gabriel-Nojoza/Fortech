import { NextRequest, NextResponse } from "next/server"
import { z } from "zod"
import { createServiceClient } from "@/lib/supabase/server"
import {
  buildCompanySubscriptionValue,
  computeCompanySubscriptionStatus,
  findCompanyPlanByCode,
  getCompanySubscriptionStatusLabel,
  listCompanyPlans,
  normalizeCompanySubscriptionSettings,
  normalizeDateOnly,
  normalizeCompanyPlanCode,
  type CompanyPlanCode,
  type CompanyPlanDefinition,
} from "@/lib/company-plan"
import {
  requireAdminContext,
  requirePlatformAdminContext,
} from "@/lib/tenant"
import { normalizeBotModuleSettings } from "@/lib/bot"

function slugify(value: string) {
  return value
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
}

const createCompanySchema = z.object({
  name: z.string().trim().min(1, "Nome da empresa obrigatorio"),
  plan_code: z.string().trim().min(1).default("START"),
  next_due_date: z.string().trim().optional().nullable(),
  is_active: z.boolean().optional().default(true),
  bot_module_enabled: z.boolean().optional().default(true),
  user_email: z.string().trim().email("Email invalido").optional().nullable(),
  user_password: z.string().trim().min(6, "Senha deve ter ao menos 6 caracteres").optional().nullable(),
  user_name: z.string().trim().optional().nullable(),
})

const updateCompanySchema = z.object({
  id: z.string().uuid(),
  name: z.string().trim().min(1, "Nome da empresa obrigatorio"),
  plan_code: z.string().trim().min(1).optional(),
  next_due_date: z.string().trim().optional().nullable(),
  is_active: z.boolean().optional(),
  bot_module_enabled: z.boolean().optional(),
  clear_upgrade_request: z.boolean().optional(),
})

export type CompanyListItem = {
  id: string
  name: string
  slug: string | null
  is_active: boolean
  created_at: string | null
  updated_at: string | null
  plan_code: CompanyPlanCode
  plan_name: string
  monthly_price: number
  monthly_price_label: string
  subscription_status: "active" | "suspended" | "past_due"
  subscription_status_label: string
  next_due_date: string | null
  requested_upgrade_plan: CompanyPlanCode | null
  requested_upgrade_at: string | null
  bot_module_enabled: boolean
}

function getAdminClient() {
  return createServiceClient()
}

async function syncGeneralSettingName(
  supabase: ReturnType<typeof getAdminClient>,
  companyId: string,
  companyName: string
) {
  const { data: generalRow } = await supabase
    .from("company_settings")
    .select("value")
    .eq("company_id", companyId)
    .eq("key", "general")
    .maybeSingle()

  const current = (generalRow?.value ?? {}) as Record<string, unknown>

  const { error } = await supabase.from("company_settings").upsert(
    {
      company_id: companyId,
      key: "general",
      value: {
        ...current,
        app_name: companyName,
        timezone:
          typeof current.timezone === "string" && current.timezone.trim()
            ? current.timezone.trim()
            : "America/Sao_Paulo",
      },
      updated_at: new Date().toISOString(),
    },
    { onConflict: "company_id,key" }
  )

  if (error) {
    throw error
  }
}

async function readCompanyList(
  context: Awaited<ReturnType<typeof requireAdminContext>>
) {
  const supabase = getAdminClient()
  const query = supabase
    .from("companies")
    .select("id, name, slug, is_active, created_at, updated_at")
    .order("name")

  if (!context.isPlatformAdmin) {
    query.eq("id", context.companyId)
  }

  const { data: companies, error: companiesError } = await query
  if (companiesError) {
    throw companiesError
  }

  const companyRows =
    ((companies ?? []) as Array<{
      id: string
      name: string
      slug: string | null
      is_active: boolean
      created_at: string | null
      updated_at: string | null
    }>) ?? []

  if (companyRows.length === 0) {
    return []
  }

  const companyIds = companyRows.map((company) => company.id)
  const [
    { data: settingRows, error: settingsError },
    allPlans,
  ] = await Promise.all([
    supabase
      .from("company_settings")
      .select("company_id, key, value")
      .in("company_id", companyIds)
      .in("key", ["subscription", "bot_module"]),
    listCompanyPlans(supabase, { includeInactive: true }),
  ])

  if (settingsError) {
    throw settingsError
  }

  const plansByCode = new Map<string, CompanyPlanDefinition>(
    allPlans.map((plan) => [plan.code, plan])
  )
  const fallbackPlan: CompanyPlanDefinition = {
    id: null,
    code: "START",
    name: "START",
    monthlyPrice: 0,
    monthlyPriceLabel: "-",
    resources: [],
    isActive: false,
    sortOrder: 0,
    appFeatures: {
      reportBuilder: false,
      campaigns: false,
      excelExport: false,
      campaignClientPreview: false,
      schedules: true,
      operationalSummary: true,
      logs: true,
    },
  }

  const settingsByCompany = new Map<string, Map<string, unknown>>()
  for (const row of settingRows ?? []) {
    const currentSettings = settingsByCompany.get(row.company_id) ?? new Map<string, unknown>()
    currentSettings.set(row.key, row.value)
    settingsByCompany.set(row.company_id, currentSettings)
  }

  return companyRows.map((company) => {
    const companySettings = settingsByCompany.get(company.id)
    const subscription = normalizeCompanySubscriptionSettings(
      companySettings?.get("subscription")
    )
    const botModule = normalizeBotModuleSettings(companySettings?.get("bot_module"))
    const plan = plansByCode.get(subscription.plan_code) ?? { ...fallbackPlan, code: subscription.plan_code, name: subscription.plan_code }
    const status = computeCompanySubscriptionStatus({
      isActive: company.is_active,
      nextDueDate: subscription.next_due_date,
    })

    return {
      id: company.id,
      name: company.name,
      slug: company.slug,
      is_active: company.is_active,
      created_at: company.created_at,
      updated_at: company.updated_at,
      plan_code: plan.code,
      plan_name: plan.name,
      monthly_price: plan.monthlyPrice,
      monthly_price_label: plan.monthlyPriceLabel,
      subscription_status: status,
      subscription_status_label: getCompanySubscriptionStatusLabel(status),
      next_due_date: subscription.next_due_date,
      requested_upgrade_plan: subscription.requested_upgrade_plan,
      requested_upgrade_at: subscription.requested_upgrade_at,
      bot_module_enabled: botModule.enabled,
    } satisfies CompanyListItem
  })
}

export async function GET() {
  try {
    const context = await requireAdminContext()
    const data = await readCompanyList(context)
    return NextResponse.json(data)
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Erro ao listar empresas" },
      { status: 500 }
    )
  }
}

export async function POST(request: NextRequest) {
  try {
    await requirePlatformAdminContext()
    const supabase = getAdminClient()
    const body = await request.json()
    const parsed = createCompanySchema.safeParse(body)

    if (!parsed.success) {
      return NextResponse.json(
        { error: parsed.error.flatten().fieldErrors },
        { status: 400 }
      )
    }

    const data = parsed.data
    const normalizedEmail = data.user_email?.trim().toLowerCase() || ""
    const normalizedPassword = data.user_password?.trim() || ""
    const nextDueDate = normalizeDateOnly(data.next_due_date)

    const plan = await findCompanyPlanByCode(supabase, data.plan_code)
    if (!plan) {
      return NextResponse.json(
        { error: `Plano "${data.plan_code}" nao encontrado.` },
        { status: 400 }
      )
    }

    if ((normalizedEmail && !normalizedPassword) || (!normalizedEmail && normalizedPassword)) {
      return NextResponse.json(
        { error: "Informe email e senha para criar o login inicial do cliente." },
        { status: 400 }
      )
    }

    const { data: company, error: companyError } = await supabase
      .from("companies")
      .insert({
        name: data.name,
        slug: slugify(data.name),
        is_active: data.is_active,
        updated_at: new Date().toISOString(),
      })
      .select("id")
      .single()

    if (companyError || !company) {
      return NextResponse.json(
        { error: companyError?.message || "Erro ao criar empresa" },
        { status: 400 }
      )
    }

    try {
      const { error: settingsError } = await supabase.from("company_settings").upsert(
        [
          {
            company_id: company.id,
            key: "general",
            value: {
              app_name: data.name,
              timezone: "America/Sao_Paulo",
            },
            updated_at: new Date().toISOString(),
          },
          {
            company_id: company.id,
            key: "subscription",
            value: buildCompanySubscriptionValue({
              plan_code: data.plan_code,
              next_due_date: nextDueDate,
              requested_upgrade_plan: null,
              requested_upgrade_at: null,
            }),
            updated_at: new Date().toISOString(),
          },
          {
            company_id: company.id,
            key: "bot_module",
            value: { enabled: data.bot_module_enabled },
            updated_at: new Date().toISOString(),
          },
        ],
        { onConflict: "company_id,key" }
      )

      if (settingsError) {
        throw settingsError
      }

      if (normalizedEmail) {
        const { error: createUserError } = await supabase.auth.admin.createUser({
          email: normalizedEmail,
          password: normalizedPassword,
          email_confirm: true,
          app_metadata: {
            role: "client",
            company_id: company.id,
            workspace_access_configured: false,
            dataset_access_configured: false,
            selected_pbi_workspace_ids: [],
            selected_pbi_dataset_ids: [],
          },
          user_metadata: {
            name: data.user_name?.trim() || data.name,
            role: "client",
            company_id: company.id,
            workspace_access_configured: false,
            dataset_access_configured: false,
            selected_pbi_workspace_ids: [],
            selected_pbi_dataset_ids: [],
          },
        })

        if (createUserError) {
          throw createUserError
        }
      }
    } catch (error) {
      await supabase.from("company_settings").delete().eq("company_id", company.id)
      await supabase.from("companies").delete().eq("id", company.id)

      const message =
        error instanceof Error && error.message.includes("already been registered")
          ? "Este email ja esta cadastrado"
          : error instanceof Error
            ? error.message
            : "Erro ao criar empresa"

      return NextResponse.json({ error: message }, { status: 400 })
    }

    const refreshed = await readCompanyList({
      ...(await requireAdminContext()),
    })
    const created = refreshed.find((item) => item.id === company.id)

    return NextResponse.json(created ?? { id: company.id }, { status: 201 })
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Erro ao criar empresa" },
      { status: 500 }
    )
  }
}

export async function PUT(request: NextRequest) {
  try {
    await requirePlatformAdminContext()
    const supabase = getAdminClient()
    const body = await request.json()
    const parsed = updateCompanySchema.safeParse(body)

    if (!parsed.success) {
      return NextResponse.json(
        { error: parsed.error.flatten().fieldErrors },
        { status: 400 }
      )
    }

    const data = parsed.data
    const nextDueDate =
      data.next_due_date !== undefined ? normalizeDateOnly(data.next_due_date) : undefined

    if (data.plan_code !== undefined) {
      const plan = await findCompanyPlanByCode(supabase, data.plan_code)
      if (!plan) {
        return NextResponse.json(
          { error: `Plano "${data.plan_code}" nao encontrado.` },
          { status: 400 }
        )
      }
    }

    const { error: companyError } = await supabase
      .from("companies")
      .update({
        name: data.name,
        slug: slugify(data.name),
        ...(data.is_active !== undefined ? { is_active: data.is_active } : {}),
        updated_at: new Date().toISOString(),
      })
      .eq("id", data.id)

    if (companyError) {
      return NextResponse.json({ error: companyError.message }, { status: 400 })
    }

    await syncGeneralSettingName(supabase, data.id, data.name)

    const { data: subscriptionRow, error: subscriptionError } = await supabase
      .from("company_settings")
      .select("value")
      .eq("company_id", data.id)
      .eq("key", "subscription")
      .maybeSingle()

    if (subscriptionError) {
      return NextResponse.json({ error: subscriptionError.message }, { status: 400 })
    }

    const currentSubscription = normalizeCompanySubscriptionSettings(subscriptionRow?.value)
    const clearUpgradeRequest =
      data.clear_upgrade_request === true ||
      (data.plan_code !== undefined &&
        normalizeCompanyPlanCode(data.plan_code) !== currentSubscription.plan_code)

    const nextSubscription = buildCompanySubscriptionValue(
      {
        ...(data.plan_code !== undefined
          ? { plan_code: normalizeCompanyPlanCode(data.plan_code) }
          : {}),
        ...(nextDueDate !== undefined ? { next_due_date: nextDueDate } : {}),
        ...(clearUpgradeRequest
          ? { requested_upgrade_plan: null, requested_upgrade_at: null }
          : {}),
      },
      subscriptionRow?.value
    )

    const { error: upsertSubscriptionError } = await supabase
      .from("company_settings")
      .upsert(
        {
          company_id: data.id,
          key: "subscription",
          value: nextSubscription,
          updated_at: new Date().toISOString(),
        },
        { onConflict: "company_id,key" }
      )

    if (upsertSubscriptionError) {
      return NextResponse.json(
        { error: upsertSubscriptionError.message },
        { status: 400 }
      )
    }

    if (data.bot_module_enabled !== undefined) {
      const { error: upsertBotModuleError } = await supabase
        .from("company_settings")
        .upsert(
          {
            company_id: data.id,
            key: "bot_module",
            value: { enabled: data.bot_module_enabled },
            updated_at: new Date().toISOString(),
          },
          { onConflict: "company_id,key" }
        )

      if (upsertBotModuleError) {
        return NextResponse.json(
          { error: upsertBotModuleError.message },
          { status: 400 }
        )
      }
    }

    const refreshed = await readCompanyList(await requireAdminContext())
    const updated = refreshed.find((item) => item.id === data.id)

    return NextResponse.json(updated ?? { id: data.id })
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Erro ao atualizar empresa" },
      { status: 500 }
    )
  }
}
