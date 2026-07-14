import type { SupabaseClient } from "@supabase/supabase-js"

export const WAHA_SESSION_STATUS_VALUES = [
  "NOT_CREATED",
  "STOPPED",
  "STARTING",
  "SCAN_QR_CODE",
  "WORKING",
  "FAILED",
] as const

export type WahaSessionStatus = (typeof WAHA_SESSION_STATUS_VALUES)[number]

export type WahaSessionRecord = {
  id: string
  company_id: string
  session_name: string
  status: string | null
  phone_number: string | null
  connected_name: string | null
  me_id: string | null
  qr_code: string | null
  qr_code_mimetype: string | null
  last_connection_at: string | null
  last_seen_at: string | null
  last_error: string | null
  created_at: string | null
  updated_at: string | null
}

export type WahaSessionSummary = {
  exists: boolean
  companyId: string
  sessionName: string
  status: WahaSessionStatus
  phoneNumber: string | null
  connectedName: string | null
  meId: string | null
  qrCodeDataUrl: string | null
  lastConnectionAt: string | null
  lastSeenAt: string | null
  lastError: string | null
  createdAt: string | null
  updatedAt: string | null
}

type WahaRemoteSession = {
  name?: string
  status?: string
  me?: {
    id?: string | null
    pushName?: string | null
  } | null
  error?: string | null
}

type WahaRemoteQrResponse = {
  mimetype?: string
  data?: string
}

const DEFAULT_QR_MIMETYPE = "image/png"

function normalizeErrorMessage(error: unknown) {
  if (error instanceof Error && error.message.trim()) {
    return error.message.trim()
  }

  if (error && typeof error === "object" && "message" in error) {
    const value = (error as { message?: unknown }).message
    if (typeof value === "string" && value.trim()) {
      return value.trim()
    }
  }

  return "Erro ao processar requisicao do WAHA"
}

export function isMissingWahaSessionsTableError(error: unknown) {
  const message = normalizeErrorMessage(error).toLowerCase()
  const code =
    typeof error === "object" && error !== null && "code" in error
      ? String((error as { code?: unknown }).code ?? "")
      : ""

  return (
    code === "42P01" ||
    message.includes("waha_sessions") ||
    message.includes('relation "public.waha_sessions" does not exist')
  )
}

export function getWahaBaseUrl() {
  const baseUrl = (process.env.WAHA_BASE_URL || "http://127.0.0.1:3000").trim()
  if (!baseUrl) {
    throw new Error("Configure WAHA_BASE_URL no backend para usar o WAHA.")
  }

  return baseUrl.replace(/\/+$/, "")
}

function getWahaApiKey() {
  return (process.env.WAHA_API_KEY || "").trim()
}

function buildWahaUrl(pathname: string) {
  return `${getWahaBaseUrl()}${pathname.startsWith("/") ? pathname : `/${pathname}`}`
}

function tryParseJson<T>(raw: string): T | null {
  try {
    return JSON.parse(raw) as T
  } catch {
    return null
  }
}

function extractPhoneNumberFromMeId(value: string | null | undefined) {
  if (!value) {
    return null
  }

  const digits = value.replace(/\D/g, "")
  return digits || null
}

async function wahaRequest<T>(
  pathname: string,
  init: RequestInit = {},
  options: { allowNotFound?: boolean } = {}
): Promise<T | null> {
  let response: Response

  try {
    response = await fetch(buildWahaUrl(pathname), {
      ...init,
      cache: "no-store",
      headers: {
        Accept: "application/json",
        ...(init.body ? { "Content-Type": "application/json" } : {}),
        ...(getWahaApiKey() ? { "X-Api-Key": getWahaApiKey() } : {}),
        ...(init.headers ?? {}),
      },
    })
  } catch (error) {
    throw new Error(
      `Nao foi possivel conectar ao WAHA em ${getWahaBaseUrl()}. Detalhe: ${normalizeErrorMessage(error)}`
    )
  }

  const raw = await response.text()
  const parsed = tryParseJson<T & { error?: string; message?: string | string[] }>(raw)

  if (options.allowNotFound && response.status === 404) {
    return null
  }

  if (!response.ok) {
    const detailedMessage = Array.isArray(parsed?.message)
      ? parsed.message.join(", ")
      : parsed?.message

    throw new Error(
      detailedMessage ||
        parsed?.error ||
        (raw.trim() || `WAHA respondeu com status ${response.status}`)
    )
  }

  return parsed
}

export function buildWahaSessionName(companyId: string) {
  const normalized = companyId.replace(/[^a-zA-Z0-9]/g, "").toLowerCase()
  return `empresa_${normalized}`
}

export function normalizeWahaSessionStatus(value: unknown): WahaSessionStatus {
  if (typeof value !== "string") {
    return "STOPPED"
  }

  const normalized = value.trim().toUpperCase()
  return WAHA_SESSION_STATUS_VALUES.includes(normalized as WahaSessionStatus)
    ? (normalized as WahaSessionStatus)
    : "STOPPED"
}

export function createEmptyWahaSessionSummary(companyId: string): WahaSessionSummary {
  return {
    exists: false,
    companyId,
    sessionName: buildWahaSessionName(companyId),
    status: "NOT_CREATED",
    phoneNumber: null,
    connectedName: null,
    meId: null,
    qrCodeDataUrl: null,
    lastConnectionAt: null,
    lastSeenAt: null,
    lastError: null,
    createdAt: null,
    updatedAt: null,
  }
}

export function normalizeStoredWahaSession(
  companyId: string,
  row: WahaSessionRecord | null
): WahaSessionSummary {
  if (!row) {
    return createEmptyWahaSessionSummary(companyId)
  }

  return {
    exists: true,
    companyId,
    sessionName: row.session_name || buildWahaSessionName(companyId),
    status: normalizeWahaSessionStatus(row.status),
    phoneNumber: row.phone_number ?? null,
    connectedName: row.connected_name ?? null,
    meId: row.me_id ?? null,
    qrCodeDataUrl: row.qr_code ?? null,
    lastConnectionAt: row.last_connection_at ?? null,
    lastSeenAt: row.last_seen_at ?? null,
    lastError: row.last_error ?? null,
    createdAt: row.created_at ?? null,
    updatedAt: row.updated_at ?? null,
  }
}

export async function getStoredWahaSession(
  supabase: SupabaseClient,
  companyId: string
): Promise<WahaSessionRecord | null> {
  const { data, error } = await supabase
    .from("waha_sessions")
    .select("*")
    .eq("company_id", companyId)
    .maybeSingle()

  if (error) {
    if (isMissingWahaSessionsTableError(error)) {
      throw new Error(
        "O banco ainda nao suporta sessoes do WAHA. Execute a migration 20260713_plans_and_waha.sql no Supabase."
      )
    }

    throw error
  }

  return (data as WahaSessionRecord | null) ?? null
}

export async function ensureStoredWahaSession(
  supabase: SupabaseClient,
  companyId: string
): Promise<WahaSessionRecord> {
  const existing = await getStoredWahaSession(supabase, companyId)
  if (existing) {
    return existing
  }

  const sessionName = buildWahaSessionName(companyId)
  const now = new Date().toISOString()
  const { data, error } = await supabase
    .from("waha_sessions")
    .insert({
      company_id: companyId,
      session_name: sessionName,
      status: "STOPPED",
      created_at: now,
      updated_at: now,
      last_seen_at: now,
    })
    .select("*")
    .single()

  if (error) {
    if (isMissingWahaSessionsTableError(error)) {
      throw new Error(
        "O banco ainda nao suporta sessoes do WAHA. Execute a migration 20260713_plans_and_waha.sql no Supabase."
      )
    }

    throw error
  }

  return data as WahaSessionRecord
}

async function upsertStoredWahaSession(
  supabase: SupabaseClient,
  companyId: string,
  payload: Partial<WahaSessionRecord> & { session_name?: string }
) {
  const current = await getStoredWahaSession(supabase, companyId)
  const sessionName = payload.session_name ?? current?.session_name ?? buildWahaSessionName(companyId)
  const now = new Date().toISOString()

  const value = {
    company_id: companyId,
    session_name: sessionName,
    status: payload.status ?? current?.status ?? "STOPPED",
    phone_number:
      payload.phone_number !== undefined ? payload.phone_number : current?.phone_number ?? null,
    connected_name:
      payload.connected_name !== undefined
        ? payload.connected_name
        : current?.connected_name ?? null,
    me_id: payload.me_id !== undefined ? payload.me_id : current?.me_id ?? null,
    qr_code: payload.qr_code !== undefined ? payload.qr_code : current?.qr_code ?? null,
    qr_code_mimetype:
      payload.qr_code_mimetype !== undefined
        ? payload.qr_code_mimetype
        : current?.qr_code_mimetype ?? null,
    last_connection_at:
      payload.last_connection_at !== undefined
        ? payload.last_connection_at
        : current?.last_connection_at ?? null,
    last_seen_at:
      payload.last_seen_at !== undefined ? payload.last_seen_at : now,
    last_error:
      payload.last_error !== undefined ? payload.last_error : current?.last_error ?? null,
    updated_at: now,
  }

  const { data, error } = await supabase
    .from("waha_sessions")
    .upsert(value, { onConflict: "company_id" })
    .select("*")
    .single()

  if (error) {
    if (isMissingWahaSessionsTableError(error)) {
      throw new Error(
        "O banco ainda nao suporta sessoes do WAHA. Execute a migration 20260713_plans_and_waha.sql no Supabase."
      )
    }

    throw error
  }

  return data as WahaSessionRecord
}

export async function deleteStoredWahaSession(
  supabase: SupabaseClient,
  companyId: string
) {
  const { error } = await supabase
    .from("waha_sessions")
    .delete()
    .eq("company_id", companyId)

  if (error && !isMissingWahaSessionsTableError(error)) {
    throw error
  }
}

export async function getWahaRemoteSession(sessionName: string) {
  return wahaRequest<WahaRemoteSession>(`/api/sessions/${encodeURIComponent(sessionName)}`, {}, {
    allowNotFound: true,
  })
}

function buildWahaSessionConfig(webhookUrl?: string | null) {
  const url = webhookUrl?.trim()
  if (!url) {
    return undefined
  }

  return {
    webhooks: [
      {
        url,
        events: ["message"],
      },
    ],
  }
}

export async function updateWahaRemoteSessionConfig(
  sessionName: string,
  webhookUrl?: string | null
) {
  const config = buildWahaSessionConfig(webhookUrl)
  if (!config) {
    return null
  }

  return wahaRequest<WahaRemoteSession>(
    `/api/sessions/${encodeURIComponent(sessionName)}`,
    { method: "PUT", body: JSON.stringify({ config }) }
  )
}

export async function createWahaRemoteSession(
  sessionName: string,
  webhookUrl?: string | null
) {
  const config = buildWahaSessionConfig(webhookUrl)

  try {
    return await wahaRequest<WahaRemoteSession>("/api/sessions", {
      method: "POST",
      body: JSON.stringify({
        name: sessionName,
        ...(config ? { config } : {}),
      }),
    })
  } catch (error) {
    const message = normalizeErrorMessage(error).toLowerCase()
    if (
      message.includes("already exists") ||
      message.includes("duplicate") ||
      message.includes("conflict")
    ) {
      if (config) {
        await updateWahaRemoteSessionConfig(sessionName, webhookUrl).catch(() => null)
      }
      return getWahaRemoteSession(sessionName)
    }

    throw error
  }
}

export async function startWahaRemoteSession(sessionName: string) {
  return wahaRequest<WahaRemoteSession>(
    `/api/sessions/${encodeURIComponent(sessionName)}/start`,
    { method: "POST" }
  )
}

export async function restartWahaRemoteSession(sessionName: string) {
  return wahaRequest<WahaRemoteSession>(
    `/api/sessions/${encodeURIComponent(sessionName)}/restart`,
    { method: "POST" }
  )
}

export async function deleteWahaRemoteSession(sessionName: string) {
  return wahaRequest<Record<string, unknown>>(
    `/api/sessions/${encodeURIComponent(sessionName)}`,
    { method: "DELETE" },
    { allowNotFound: true }
  )
}

async function requestWahaQrWithMethod(
  sessionName: string,
  method: "GET" | "POST"
) {
  return wahaRequest<WahaRemoteQrResponse>(
    `/api/${encodeURIComponent(sessionName)}/auth/qr?format=image`,
    { method }
  )
}

export async function getWahaRemoteQr(sessionName: string) {
  let qrData: WahaRemoteQrResponse | null = null

  try {
    qrData = await requestWahaQrWithMethod(sessionName, "GET")
  } catch (error) {
    const message = normalizeErrorMessage(error).toLowerCase()
    if (
      message.includes("405") ||
      message.includes("method not allowed") ||
      message.includes("cannot get")
    ) {
      qrData = await requestWahaQrWithMethod(sessionName, "POST")
    } else {
      throw error
    }
  }

  if (!qrData?.data) {
    return { qrCodeDataUrl: null, qrCodeMimetype: null }
  }

  const mimetype = qrData.mimetype?.trim() || DEFAULT_QR_MIMETYPE
  return {
    qrCodeDataUrl: `data:${mimetype};base64,${qrData.data}`,
    qrCodeMimetype: mimetype,
  }
}

export async function syncStoredWahaSessionFromRemote(
  supabase: SupabaseClient,
  companyId: string,
  remoteSession: WahaRemoteSession | null,
  extra?: {
    qrCodeDataUrl?: string | null
    qrCodeMimetype?: string | null
    lastError?: string | null
  }
): Promise<WahaSessionSummary> {
  const sessionName = remoteSession?.name?.trim() || buildWahaSessionName(companyId)
  const status = normalizeWahaSessionStatus(remoteSession?.status)
  const now = new Date().toISOString()

  const record = await upsertStoredWahaSession(supabase, companyId, {
    session_name: sessionName,
    status,
    phone_number: extractPhoneNumberFromMeId(remoteSession?.me?.id),
    connected_name: remoteSession?.me?.pushName?.trim() || null,
    me_id: remoteSession?.me?.id?.trim() || null,
    qr_code:
      extra?.qrCodeDataUrl !== undefined ? extra.qrCodeDataUrl : undefined,
    qr_code_mimetype:
      extra?.qrCodeMimetype !== undefined ? extra.qrCodeMimetype : undefined,
    last_connection_at:
      status === "WORKING" ? now : undefined,
    last_seen_at: now,
    last_error:
      extra?.lastError !== undefined
        ? extra.lastError
        : typeof remoteSession?.error === "string"
          ? remoteSession.error
          : status === "FAILED"
            ? "Sessao WAHA falhou"
            : null,
  })

  return normalizeStoredWahaSession(companyId, record)
}

export async function getCompanyWahaSessionSummary(
  supabase: SupabaseClient,
  companyId: string
) {
  const record = await getStoredWahaSession(supabase, companyId)
  return normalizeStoredWahaSession(companyId, record)
}

/** Converte telefone/jid/id de grupo cru no chatId que a API do WAHA espera. */
export function buildWahaChatId(params: {
  jid?: string | null
  phone?: string | null
  whatsappGroupId?: string | null
}) {
  if (params.jid?.trim()) {
    return params.jid.trim()
  }
  if (params.whatsappGroupId?.trim()) {
    const groupId = params.whatsappGroupId.trim()
    return groupId.includes("@") ? groupId : `${groupId}@g.us`
  }
  if (params.phone?.trim()) {
    const digits = params.phone.replace(/\D/g, "")
    return `${digits}@c.us`
  }
  return null
}

export type WahaSendMessagePayload = {
  jid?: string | null
  phone?: string | null
  whatsapp_group_id?: string | null
  text?: string | null
  message?: string | null
  caption?: string | null
  document_url?: string | null
  document_base64?: string | null
  file_name?: string | null
  mimetype?: string | null
  audio_base64?: string | null
}

/**
 * Envia uma mensagem via API do WAHA (sessao propria da empresa) — texto ou
 * arquivo/documento. Usado por /api/bot/send quando a empresa esta no canal WAHA.
 */
export async function sendWahaMessage(sessionName: string, payload: WahaSendMessagePayload) {
  const chatId = buildWahaChatId({
    jid: payload.jid,
    phone: payload.phone,
    whatsappGroupId: payload.whatsapp_group_id,
  })

  if (!chatId) {
    throw new Error("Informe jid, phone ou whatsapp_group_id para enviar pelo WAHA")
  }

  const documentSource = payload.document_url || payload.document_base64
  const text = payload.text || payload.message || ""

  if (documentSource) {
    const file = payload.document_url
      ? { url: payload.document_url }
      : { data: payload.document_base64, mimetype: payload.mimetype || "application/pdf", filename: payload.file_name || "arquivo.pdf" }

    await wahaRequest("/api/sendFile", {
      method: "POST",
      body: JSON.stringify({
        session: sessionName,
        chatId,
        file,
        caption: payload.caption || text || undefined,
      }),
    })
    return { chatId }
  }

  if (payload.audio_base64) {
    await wahaRequest("/api/sendVoice", {
      method: "POST",
      body: JSON.stringify({
        session: sessionName,
        chatId,
        file: { data: payload.audio_base64, mimetype: "audio/ogg; codecs=opus" },
      }),
    })
    return { chatId }
  }

  if (!text.trim()) {
    throw new Error("Informe message, text, caption ou um arquivo para enviar pelo WAHA")
  }

  await wahaRequest("/api/sendText", {
    method: "POST",
    body: JSON.stringify({ session: sessionName, chatId, text }),
  })

  return { chatId }
}
