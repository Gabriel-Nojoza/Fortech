import type { BotAiProvider } from "@/lib/bot"

/** Mensagem recebida via webhook de mensagem do WAHA (evento "message"). */
export type IncomingWahaMessage = {
  session: string
  fromMe: boolean
  contactPhone: string
  text: string
  raw: unknown
}

export type BotWeekdayHours = {
  enabled: boolean
  open: string
  close: string
}

export type BotAgentRow = {
  id: string
  company_id: string
  name: string
  phone: string
  department: string | null
  priority: number
  is_active: boolean
}

export type BotKeywordRow = {
  id: string
  company_id: string
  trigger: string
  response: string
  is_active: boolean
}

export type BotTransferTargetRow = {
  id: string
  company_id: string
  name: string
  type: "human" | "department" | "whatsapp" | "group" | "webhook"
  target_value: string | null
  is_active: boolean
}

/** Espelha exatamente a resposta de GET /api/bot/context (endpoint existente, nao alterado). */
export type BotContext = {
  version: number
  generated_at: string
  company_id: string
  module_enabled: boolean
  is_enabled: boolean
  welcome_message: string
  business_hours: {
    is_open_now: boolean
    today: string
    closed_message: string
    hours: Record<string, BotWeekdayHours>
  }
  ai: {
    provider: BotAiProvider
    api_key: string
    model: string
    system_prompt: string
    temperature: number
    max_tokens: number
  }
  agents: {
    distribution: "round_robin" | "random" | "least_queue"
    list: BotAgentRow[]
  }
  keywords: BotKeywordRow[]
  quick_replies: unknown[]
  transfer_targets: BotTransferTargetRow[]
  products: unknown[]
}

export type BotMenuOptionRow = {
  id: string
  company_id: string
  menu_id: string
  position: number
  label: string
  action_type: "open_menu" | "send_text" | "transfer_human" | "end_conversation"
  child_menu_id: string | null
  response_text: string | null
  is_active: boolean
}

export type BotMenuRow = {
  id: string
  company_id: string
  name: string
  prompt_text: string
  is_root: boolean
  is_active: boolean
}

export type BotMenuWithOptions = BotMenuRow & {
  options: BotMenuOptionRow[]
}

export type BotConversationStateRow = {
  id: string
  company_id: string
  contact_phone: string
  current_menu_id: string | null
  context: Record<string, unknown>
}

export type EngineAction =
  | "module_disabled"
  | "bot_disabled"
  | "outside_business_hours"
  | "welcome_message"
  | "menu_navigation"
  | "keyword_match"
  | "menu_option"
  | "ai_response"
  | "human_transfer"
  | "ignored"

export type EngineResult = {
  action: EngineAction
  replyText: string | null
  transferredTo: { type: "agent" | "transfer_target"; id: string; name: string } | null
}
