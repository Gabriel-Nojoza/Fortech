export type BotModuleSettings = {
  enabled: boolean
}

export function normalizeBotModuleSettings(value: unknown): BotModuleSettings {
  const raw = value && typeof value === "object" ? (value as Record<string, unknown>) : {}
  return { enabled: typeof raw.enabled === "boolean" ? raw.enabled : true }
}
