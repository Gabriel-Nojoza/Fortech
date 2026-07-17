export const BOT_TRANSFER_TYPES = ["human", "department", "whatsapp", "group", "webhook"] as const
export type BotTransferType = (typeof BOT_TRANSFER_TYPES)[number]

export const BOT_AI_PROVIDERS = ["none", "openai", "gemini", "ollama", "claude"] as const
export type BotAiProvider = (typeof BOT_AI_PROVIDERS)[number]

export type BotAiConfig = {
  provider: BotAiProvider
  api_key: string
  model: string
  system_prompt: string
  temperature: number
  max_tokens: number
}

export const BOT_WEEKDAYS = [
  "monday",
  "tuesday",
  "wednesday",
  "thursday",
  "friday",
  "saturday",
  "sunday",
] as const
export type BotWeekday = (typeof BOT_WEEKDAYS)[number]

export const BOT_WEEKDAY_LABELS: Record<BotWeekday, string> = {
  monday: "Segunda",
  tuesday: "Terça",
  wednesday: "Quarta",
  thursday: "Quinta",
  friday: "Sexta",
  saturday: "Sábado",
  sunday: "Domingo",
}

export type BotWeekdayHours = {
  enabled: boolean
  open: string
  close: string
}

export type BotBusinessHours = {
  hours: Record<BotWeekday, BotWeekdayHours>
  closed_message: string
}

export type BotGeneralSettings = {
  is_enabled: boolean
}

export type BotModuleSettings = {
  enabled: boolean
}

export function normalizeBotModuleSettings(value: unknown): BotModuleSettings {
  const raw = value && typeof value === "object" ? (value as Record<string, unknown>) : {}
  return { enabled: typeof raw.enabled === "boolean" ? raw.enabled : true }
}

export type BotWelcomeMessageSettings = {
  message: string
}

export const DEFAULT_BOT_WELCOME_MESSAGE =
  "Olá {{nome}}\n\nBem-vindo à empresa.\nEscolha uma opção.\n\n1️⃣ Comercial\n2️⃣ Financeiro\n3️⃣ Suporte\n4️⃣ Falar com atendente"

export const DEFAULT_BOT_CLOSED_MESSAGE =
  "No momento estamos fora do horário de atendimento. Retornaremos assim que possível."

function defaultWeekdayHours(enabled: boolean): BotWeekdayHours {
  return { enabled, open: "08:00", close: "18:00" }
}

export function normalizeBotGeneralSettings(value: unknown): BotGeneralSettings {
  const raw = value && typeof value === "object" ? (value as Record<string, unknown>) : {}
  return { is_enabled: raw.is_enabled === true }
}

export function normalizeBotWelcomeMessageSettings(value: unknown): BotWelcomeMessageSettings {
  const raw = value && typeof value === "object" ? (value as Record<string, unknown>) : {}
  return {
    message:
      typeof raw.message === "string" && raw.message.trim() ? raw.message : DEFAULT_BOT_WELCOME_MESSAGE,
  }
}

export function normalizeBotBusinessHours(value: unknown): BotBusinessHours {
  const raw = value && typeof value === "object" ? (value as Record<string, unknown>) : {}
  const rawHours = raw.hours && typeof raw.hours === "object" ? (raw.hours as Record<string, unknown>) : {}

  const hours = BOT_WEEKDAYS.reduce(
    (acc, day) => {
      const rawDay =
        rawHours[day] && typeof rawHours[day] === "object"
          ? (rawHours[day] as Record<string, unknown>)
          : {}
      const fallback = defaultWeekdayHours(day !== "saturday" && day !== "sunday")

      acc[day] = {
        enabled: typeof rawDay.enabled === "boolean" ? rawDay.enabled : fallback.enabled,
        open: typeof rawDay.open === "string" && rawDay.open ? rawDay.open : fallback.open,
        close: typeof rawDay.close === "string" && rawDay.close ? rawDay.close : fallback.close,
      }
      return acc
    },
    {} as Record<BotWeekday, BotWeekdayHours>
  )

  return {
    hours,
    closed_message:
      typeof raw.closed_message === "string" && raw.closed_message.trim()
        ? raw.closed_message
        : DEFAULT_BOT_CLOSED_MESSAGE,
  }
}

export type BotCatalogFile = {
  url: string
  mimetype: string
  file_name: string
  uploaded_at: string | null
}

export function normalizeBotCatalogFile(value: unknown): BotCatalogFile | null {
  const raw = value && typeof value === "object" ? (value as Record<string, unknown>) : null
  if (!raw || typeof raw.url !== "string" || !raw.url.trim()) {
    return null
  }

  return {
    url: raw.url.trim(),
    mimetype: typeof raw.mimetype === "string" && raw.mimetype ? raw.mimetype : "application/pdf",
    file_name: typeof raw.file_name === "string" && raw.file_name ? raw.file_name : "catalogo",
    uploaded_at: typeof raw.uploaded_at === "string" ? raw.uploaded_at : null,
  }
}

export function normalizeBotAiConfig(value: unknown): BotAiConfig {
  const raw = value && typeof value === "object" ? (value as Record<string, unknown>) : {}
  const provider =
    typeof raw.provider === "string" && BOT_AI_PROVIDERS.includes(raw.provider as BotAiProvider)
      ? (raw.provider as BotAiProvider)
      : "none"

  return {
    provider,
    api_key: typeof raw.api_key === "string" ? raw.api_key : "",
    model: typeof raw.model === "string" ? raw.model : "",
    system_prompt: typeof raw.system_prompt === "string" ? raw.system_prompt : "",
    temperature: typeof raw.temperature === "number" ? raw.temperature : 0.7,
    max_tokens: typeof raw.max_tokens === "number" ? raw.max_tokens : 512,
  }
}

export function getBotTransferTypeLabel(type: BotTransferType) {
  switch (type) {
    case "human":
      return "Humano"
    case "department":
      return "Departamento"
    case "whatsapp":
      return "Outro WhatsApp"
    case "group":
      return "Grupo"
    case "webhook":
      return "Webhook"
    default:
      return type
  }
}

export const BOT_AGENT_DISTRIBUTION_STRATEGIES = ["round_robin", "random", "least_queue"] as const
export type BotAgentDistributionStrategy = (typeof BOT_AGENT_DISTRIBUTION_STRATEGIES)[number]

export type BotAgentsConfig = {
  distribution: BotAgentDistributionStrategy
}

export function getBotAgentDistributionLabel(strategy: BotAgentDistributionStrategy) {
  switch (strategy) {
    case "random":
      return "Aleatoria"
    case "least_queue":
      return "Menor fila"
    default:
      return "Round Robin"
  }
}

export function normalizeBotAgentsConfig(value: unknown): BotAgentsConfig {
  const raw = value && typeof value === "object" ? (value as Record<string, unknown>) : {}
  const distribution =
    typeof raw.distribution === "string" &&
    BOT_AGENT_DISTRIBUTION_STRATEGIES.includes(raw.distribution as BotAgentDistributionStrategy)
      ? (raw.distribution as BotAgentDistributionStrategy)
      : "round_robin"

  return { distribution }
}

export function getBotAiProviderLabel(provider: BotAiProvider) {
  switch (provider) {
    case "openai":
      return "OpenAI"
    case "gemini":
      return "Gemini"
    case "ollama":
      return "Ollama"
    case "claude":
      return "Claude"
    default:
      return "Desativado"
  }
}
