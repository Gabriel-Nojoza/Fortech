import type { SupabaseClient } from "@supabase/supabase-js"

export type CompanyPlanCode = string

export type CompanyPlanAppFeatures = {
  reportBuilder: boolean
  campaigns: boolean
  excelExport: boolean
  campaignClientPreview: boolean
  schedules: boolean
  operationalSummary: boolean
  logs: boolean
}

export type CompanyPlanDefinition = {
  id: string | null
  code: CompanyPlanCode
  name: string
  monthlyPrice: number
  monthlyPriceLabel: string
  resources: string[]
  isActive: boolean
  sortOrder: number
  appFeatures: CompanyPlanAppFeatures
}

// Fonte unica de verdade das funcoes da plataforma que podem ser ligadas/desligadas
// por plano. Usado pelo admin (tela de planos) e pela API de features do cliente.
export const PLATFORM_FEATURE_REGISTRY: ReadonlyArray<{
  key: keyof CompanyPlanAppFeatures
  column: keyof Pick<
    PlanRow,
    | "report_builder"
    | "campaigns"
    | "excel_export"
    | "campaign_client_preview"
    | "schedules"
    | "operational_summary"
    | "logs"
  >
  label: string
  description: string
}> = [
  {
    key: "reportBuilder",
    column: "report_builder",
    label: "Construtor de Relatorios",
    description: "Criar consultas DAX personalizadas e automacoes de envio.",
  },
  {
    key: "campaigns",
    column: "campaigns",
    label: "Campanhas",
    description: "Disparos em massa para clientes inativos ou segmentados.",
  },
  {
    key: "excelExport",
    column: "excel_export",
    label: "Exportacao para Excel",
    description: "Exportar relatorios em planilha .xlsx.",
  },
  {
    key: "campaignClientPreview",
    column: "campaign_client_preview",
    label: "Preview de campanha para o cliente",
    description: "Cliente final revisa a mensagem antes do disparo.",
  },
  {
    key: "schedules",
    column: "schedules",
    label: "Rotinas de Disparo",
    description: "Agendamento recorrente de envio de relatorios via WhatsApp.",
  },
  {
    key: "operationalSummary",
    column: "operational_summary",
    label: "Resumo Operacional",
    description: "Painel com visao geral das rotinas e envios.",
  },
  {
    key: "logs",
    column: "logs",
    label: "Logs",
    description: "Historico detalhado de envios e erros.",
  },
]

export type CompanySubscriptionSettings = {
  plan_code: CompanyPlanCode
  next_due_date: string | null
  requested_upgrade_plan: CompanyPlanCode | null
  requested_upgrade_at: string | null
}

export type CompanySubscriptionStatus = "active" | "suspended" | "past_due"

type PlanRow = {
  id: string
  code: string
  name: string
  monthly_price: number | string
  resources: unknown
  report_builder: boolean
  campaigns: boolean
  excel_export: boolean
  campaign_client_preview: boolean
  schedules: boolean
  operational_summary: boolean
  logs: boolean
  is_active: boolean
  sort_order: number
}

export const DEFAULT_COMPANY_PLAN_CODE: CompanyPlanCode = "START"

export function formatMonthlyPrice(monthlyPrice: number) {
  return new Intl.NumberFormat("pt-BR", {
    style: "currency",
    currency: "BRL",
    minimumFractionDigits: 0,
    maximumFractionDigits: 0,
  }).format(monthlyPrice)
}

function fallbackPlanDefinition(code: CompanyPlanCode): CompanyPlanDefinition {
  return {
    id: null,
    code,
    name: code,
    monthlyPrice: 0,
    monthlyPriceLabel: formatMonthlyPrice(0),
    resources: [],
    isActive: false,
    sortOrder: 0,
    appFeatures: {
      reportBuilder: false,
      campaigns: false,
      excelExport: false,
      campaignClientPreview: false,
      schedules: false,
      operationalSummary: false,
      logs: false,
    },
  }
}

export function mapPlanRow(row: PlanRow): CompanyPlanDefinition {
  const monthlyPrice = Number(row.monthly_price) || 0

  return {
    id: row.id,
    code: row.code,
    name: row.name,
    monthlyPrice,
    monthlyPriceLabel: formatMonthlyPrice(monthlyPrice),
    resources: Array.isArray(row.resources)
      ? row.resources.filter((item): item is string => typeof item === "string")
      : [],
    isActive: row.is_active,
    sortOrder: row.sort_order,
    appFeatures: {
      reportBuilder: row.report_builder,
      campaigns: row.campaigns,
      excelExport: row.excel_export,
      campaignClientPreview: row.campaign_client_preview,
      schedules: row.schedules,
      operationalSummary: row.operational_summary,
      logs: row.logs,
    },
  }
}

export function normalizeCompanyPlanCode(value: unknown): CompanyPlanCode {
  if (typeof value !== "string" || !value.trim()) {
    return DEFAULT_COMPANY_PLAN_CODE
  }

  return value.trim().toUpperCase()
}

export async function listCompanyPlans(
  supabase: SupabaseClient,
  options: { includeInactive?: boolean } = {}
): Promise<CompanyPlanDefinition[]> {
  let query = supabase.from("plans").select("*").order("sort_order", { ascending: true })

  if (!options.includeInactive) {
    query = query.eq("is_active", true)
  }

  const { data, error } = await query

  if (error) {
    throw error
  }

  return ((data ?? []) as PlanRow[]).map(mapPlanRow)
}

export async function findCompanyPlanByCode(
  supabase: SupabaseClient,
  planCode: unknown
): Promise<CompanyPlanDefinition | null> {
  const code = normalizeCompanyPlanCode(planCode)
  const { data, error } = await supabase
    .from("plans")
    .select("*")
    .eq("code", code)
    .maybeSingle()

  if (error) {
    throw error
  }

  return data ? mapPlanRow(data as PlanRow) : null
}

export async function getCompanyPlanDefinition(
  supabase: SupabaseClient,
  planCode: unknown
): Promise<CompanyPlanDefinition> {
  const found = await findCompanyPlanByCode(supabase, planCode)
  if (found) {
    return found
  }

  if (normalizeCompanyPlanCode(planCode) !== DEFAULT_COMPANY_PLAN_CODE) {
    const fallback = await findCompanyPlanByCode(supabase, DEFAULT_COMPANY_PLAN_CODE)
    if (fallback) {
      return fallback
    }
  }

  return fallbackPlanDefinition(normalizeCompanyPlanCode(planCode))
}

export async function getCompanyPlanFeatureDefaults(
  supabase: SupabaseClient,
  planCode: unknown
): Promise<CompanyPlanDefinition["appFeatures"]> {
  const plan = await getCompanyPlanDefinition(supabase, planCode)
  return plan.appFeatures
}

export async function getNextPlanCode(
  supabase: SupabaseClient,
  planCode: CompanyPlanCode
): Promise<CompanyPlanCode | null> {
  const activePlans = await listCompanyPlans(supabase)
  const normalized = normalizeCompanyPlanCode(planCode)
  const index = activePlans.findIndex((plan) => plan.code === normalized)

  if (index < 0 || index === activePlans.length - 1) {
    return null
  }

  return activePlans[index + 1].code
}

export function normalizeDateOnly(value: unknown): string | null {
  if (typeof value !== "string") {
    return null
  }

  const trimmed = value.trim()
  if (!trimmed) {
    return null
  }

  return /^\d{4}-\d{2}-\d{2}$/.test(trimmed) ? trimmed : null
}

export function normalizeCompanySubscriptionSettings(
  rawValue: unknown
): CompanySubscriptionSettings {
  const raw =
    rawValue && typeof rawValue === "object"
      ? (rawValue as Record<string, unknown>)
      : {}

  return {
    plan_code: normalizeCompanyPlanCode(raw.plan_code),
    next_due_date: normalizeDateOnly(raw.next_due_date),
    requested_upgrade_plan:
      raw.requested_upgrade_plan === null || raw.requested_upgrade_plan === undefined
        ? null
        : normalizeCompanyPlanCode(raw.requested_upgrade_plan),
    requested_upgrade_at:
      typeof raw.requested_upgrade_at === "string" && raw.requested_upgrade_at.trim()
        ? raw.requested_upgrade_at.trim()
        : null,
  }
}

export function buildCompanySubscriptionValue(
  input: Partial<CompanySubscriptionSettings>,
  currentValue?: unknown
): CompanySubscriptionSettings {
  const current = normalizeCompanySubscriptionSettings(currentValue)

  return {
    plan_code:
      input.plan_code !== undefined
        ? normalizeCompanyPlanCode(input.plan_code)
        : current.plan_code,
    next_due_date:
      input.next_due_date !== undefined
        ? normalizeDateOnly(input.next_due_date)
        : current.next_due_date,
    requested_upgrade_plan:
      input.requested_upgrade_plan !== undefined
        ? input.requested_upgrade_plan === null
          ? null
          : normalizeCompanyPlanCode(input.requested_upgrade_plan)
        : current.requested_upgrade_plan,
    requested_upgrade_at:
      input.requested_upgrade_at !== undefined
        ? typeof input.requested_upgrade_at === "string" &&
          input.requested_upgrade_at.trim()
          ? input.requested_upgrade_at.trim()
          : null
        : current.requested_upgrade_at,
  }
}

export function computeCompanySubscriptionStatus(params: {
  isActive: boolean
  nextDueDate: string | null
  now?: Date
}): CompanySubscriptionStatus {
  if (!params.isActive) {
    return "suspended"
  }

  if (!params.nextDueDate) {
    return "active"
  }

  const today = (params.now ?? new Date()).toISOString().slice(0, 10)
  return params.nextDueDate < today ? "past_due" : "active"
}

export function getCompanySubscriptionStatusLabel(status: CompanySubscriptionStatus) {
  switch (status) {
    case "suspended":
      return "Suspensa"
    case "past_due":
      return "Em atraso"
    default:
      return "Ativa"
  }
}
