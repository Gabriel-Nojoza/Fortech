export const COMPANY_PLAN_CODES = ["START", "PRO", "PREMIUM"] as const

export type CompanyPlanCode = (typeof COMPANY_PLAN_CODES)[number]

export type CompanyPlanDefinition = {
  code: CompanyPlanCode
  name: CompanyPlanCode
  monthlyPrice: number
  monthlyPriceLabel: string
  resources: string[]
  appFeatures: {
    reportBuilder: boolean
    campaigns: boolean
    excelExport: boolean
    campaignClientPreview: boolean
  }
}

export type CompanySubscriptionSettings = {
  plan_code: CompanyPlanCode
  next_due_date: string | null
  requested_upgrade_plan: CompanyPlanCode | null
  requested_upgrade_at: string | null
}

export type CompanySubscriptionStatus =
  | "active"
  | "suspended"
  | "past_due"

const COMPANY_PLAN_DEFINITION_LIST: CompanyPlanDefinition[] = [
  {
    code: "START",
    name: "START",
    monthlyPrice: 149,
    monthlyPriceLabel: "R$149/mês",
    resources: [
      "1 conexão de WhatsApp",
      "Atendimento com IA",
      "Cardápio em PDF",
      "Horário de funcionamento",
      "Promoções",
      "Encaminhamento para atendente",
      "Suporte básico",
    ],
    appFeatures: {
      reportBuilder: false,
      campaigns: true,
      excelExport: false,
      campaignClientPreview: false,
    },
  },
  {
    code: "PRO",
    name: "PRO",
    monthlyPrice: 249,
    monthlyPriceLabel: "R$249/mês",
    resources: [
      "1 conexão de WhatsApp",
      "Atendimento com IA",
      "Cardápio em PDF",
      "Horário de funcionamento",
      "Promoções",
      "Encaminhamento para atendente",
      "Suporte básico",
      "Fluxos personalizados",
      "Dashboard",
      "Relatórios",
      "Catálogo com imagens",
      "Agendamentos",
      "Suporte prioritário",
    ],
    appFeatures: {
      reportBuilder: true,
      campaigns: true,
      excelExport: true,
      campaignClientPreview: true,
    },
  },
  {
    code: "PREMIUM",
    name: "PREMIUM",
    monthlyPrice: 399,
    monthlyPriceLabel: "R$399/mês",
    resources: [
      "1 conexão de WhatsApp",
      "Atendimento com IA",
      "Cardápio em PDF",
      "Horário de funcionamento",
      "Promoções",
      "Encaminhamento para atendente",
      "Suporte básico",
      "Fluxos personalizados",
      "Dashboard",
      "Relatórios",
      "Catálogo com imagens",
      "Agendamentos",
      "Suporte prioritário",
      "Integrações via API",
      "CRM",
      "ERP",
      "Recursos personalizados",
      "Prioridade máxima no suporte",
    ],
    appFeatures: {
      reportBuilder: true,
      campaigns: true,
      excelExport: true,
      campaignClientPreview: true,
    },
  },
]

export const COMPANY_PLANS = Object.freeze(
  COMPANY_PLAN_DEFINITION_LIST.reduce<Record<CompanyPlanCode, CompanyPlanDefinition>>(
    (accumulator, plan) => {
      accumulator[plan.code] = plan
      return accumulator
    },
    {} as Record<CompanyPlanCode, CompanyPlanDefinition>
  )
)

export const DEFAULT_COMPANY_PLAN_CODE: CompanyPlanCode = "START"

export function normalizeCompanyPlanCode(value: unknown): CompanyPlanCode {
  if (typeof value !== "string") {
    return DEFAULT_COMPANY_PLAN_CODE
  }

  const normalized = value.trim().toUpperCase()
  return COMPANY_PLAN_CODES.includes(normalized as CompanyPlanCode)
    ? (normalized as CompanyPlanCode)
    : DEFAULT_COMPANY_PLAN_CODE
}

export function getCompanyPlanDefinition(planCode: unknown) {
  return COMPANY_PLANS[normalizeCompanyPlanCode(planCode)]
}

export function getCompanyPlanFeatureDefaults(planCode: unknown) {
  return getCompanyPlanDefinition(planCode).appFeatures
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

export function getNextPlanCode(planCode: CompanyPlanCode): CompanyPlanCode | null {
  const index = COMPANY_PLAN_CODES.indexOf(planCode)
  if (index < 0 || index === COMPANY_PLAN_CODES.length - 1) {
    return null
  }

  return COMPANY_PLAN_CODES[index + 1]
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

export function formatMonthlyPrice(monthlyPrice: number) {
  return new Intl.NumberFormat("pt-BR", {
    style: "currency",
    currency: "BRL",
    minimumFractionDigits: 0,
    maximumFractionDigits: 0,
  }).format(monthlyPrice)
}
