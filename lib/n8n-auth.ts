import { createServiceClient } from "@/lib/supabase/server"
import { getRequestContext } from "@/lib/tenant"

export type RequestCompanyContext = {
  companyId: string
  source: "auth" | "n8n_secret" | "platform"
}

function getSecretFromRequest(request: Request) {
  const url = new URL(request.url)
  const querySecret = url.searchParams.get("secret")?.trim()
  const headerSecret = request.headers.get("x-callback-secret")?.trim()
  const authHeader = request.headers.get("authorization")?.trim()

  const bearerSecret =
    authHeader && authHeader.toLowerCase().startsWith("bearer ")
      ? authHeader.slice(7).trim()
      : null

  const raw = querySecret || headerSecret || bearerSecret || ""
  // n8n 2.8.4 prepends "=" to expression values — strip it so secrets match correctly
  return raw.replace(/^=+/, "")
}

async function getCompanyIdFromCallbackSecret(secret: string) {
  if (!secret) {
    return null
  }

  const supabase = createServiceClient()
  const { data, error } = await supabase
    .from("company_settings")
    .select("company_id, value")
    .eq("key", "n8n")

  if (error) {
    throw new Error(error.message)
  }

  const match = (data ?? []).find((row) => {
    const value = row.value as Record<string, unknown> | null
    return (
      typeof value?.callback_secret === "string" &&
      value.callback_secret.trim() === secret
    )
  })

  return match?.company_id ?? null
}

function stripN8nPrefix(value: unknown): string | null {
  if (typeof value !== "string") return null
  const s = value.trim().replace(/^=+/, "")
  return s || null
}

async function getCompanyIdFromWahaSessionName(sessionName: string) {
  const supabase = createServiceClient()
  const { data } = await supabase
    .from("waha_sessions")
    .select("company_id")
    .eq("session_name", sessionName)
    .maybeSingle()

  return data?.company_id ?? null
}

async function getCompanyIdFromBody(request: Request): Promise<string | null> {
  let body: Record<string, unknown> | null = null
  try {
    const cloned = request.clone()
    const parsed = await cloned.json().catch(() => null)
    if (parsed && typeof parsed === "object") {
      body = parsed as Record<string, unknown>
    }
  } catch {
    body = null
  }

  let searchParams: URLSearchParams | null = null
  try {
    searchParams = new URL(request.url).searchParams
  } catch {
    searchParams = null
  }

  try {
    const supabase = createServiceClient()

    // Try dispatch_log_id or dispatch_log_ids (strip n8n "=" prefix)
    const logId =
      stripN8nPrefix(body?.dispatch_log_id) ??
      (Array.isArray(body?.dispatch_log_ids) ? stripN8nPrefix(body.dispatch_log_ids[0]) : null)

    if (logId) {
      const { data } = await supabase
        .from("dispatch_logs")
        .select("company_id")
        .eq("id", logId)
        .single()
      if (data?.company_id) return data.company_id
    }

    // Try company_id directly (from body or URL query param)
    const companyId =
      (typeof body?.company_id === "string" && body.company_id.trim()) ||
      searchParams?.get("company_id")?.trim() ||
      null
    if (companyId) return companyId

    // Try report_id
    const reportId =
      typeof body?.report_id === "string" && body.report_id.trim()
        ? body.report_id.trim()
        : null

    if (reportId) {
      const { data } = await supabase
        .from("reports")
        .select("company_id")
        .eq("id", reportId)
        .single()
      if (data?.company_id) return data.company_id
    }

    // Try WAHA session name (identifies the company that owns that WhatsApp session)
    const sessionName =
      stripN8nPrefix(body?.session) ??
      stripN8nPrefix(body?.session_name) ??
      (searchParams?.get("session")?.trim() || null) ??
      (searchParams?.get("session_name")?.trim() || null)

    if (sessionName) {
      const companyIdFromSession = await getCompanyIdFromWahaSessionName(sessionName)
      if (companyIdFromSession) return companyIdFromSession
    }

    return null
  } catch {
    return null
  }
}

export async function resolveRequestCompanyContext(
  request: Request,
  options?: { allowCallbackSecret?: boolean; callbackSecret?: string | null }
): Promise<RequestCompanyContext> {
  if (options?.allowCallbackSecret) {
    const secret =
      (typeof options.callbackSecret === "string"
        ? options.callbackSecret.trim()
        : "") || getSecretFromRequest(request)

    if (secret) {
      // Check if it's the platform secret
      const platformSecret = process.env.PLATFORM_SCHEDULER_SECRET?.trim()
      if (platformSecret && secret === platformSecret) {
        const companyId = await getCompanyIdFromBody(request)
        if (!companyId) {
          throw new Error("Callback secret invalido")
        }
        return { companyId, source: "platform" }
      }

      const companyId = await getCompanyIdFromCallbackSecret(secret)

      if (!companyId) {
        throw new Error("Callback secret invalido")
      }

      return {
        companyId,
        source: "n8n_secret",
      }
    }

    // No secret provided — fall back to dispatch_log_id / company_id in body
    const companyId = await getCompanyIdFromBody(request)
    if (companyId) {
      return { companyId, source: "n8n_secret" }
    }
  }

  const context = await getRequestContext()

  return {
    companyId: context.companyId,
    source: "auth",
  }
}
