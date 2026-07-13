import type { SupabaseClient } from "@supabase/supabase-js"
import {
  buildWahaSessionName,
  createEmptyWahaSessionSummary,
  createWahaRemoteSession,
  deleteStoredWahaSession,
  deleteWahaRemoteSession,
  ensureStoredWahaSession,
  getStoredWahaSession,
  getWahaRemoteQr,
  getWahaRemoteSession,
  normalizeStoredWahaSession,
  restartWahaRemoteSession,
  startWahaRemoteSession,
  syncStoredWahaSessionFromRemote,
  type WahaSessionSummary,
} from "@/lib/waha"

export async function ensureCompanyWahaSession(
  supabase: SupabaseClient,
  companyId: string
): Promise<WahaSessionSummary> {
  const stored = await ensureStoredWahaSession(supabase, companyId)
  const remote =
    (await createWahaRemoteSession(stored.session_name)) ??
    (await getWahaRemoteSession(stored.session_name))

  if (!remote) {
    return normalizeStoredWahaSession(companyId, stored)
  }

  return syncStoredWahaSessionFromRemote(supabase, companyId, remote, {
    lastError: null,
  })
}

export async function refreshCompanyWahaSession(
  supabase: SupabaseClient,
  companyId: string
): Promise<WahaSessionSummary> {
  const stored = await getStoredWahaSession(supabase, companyId)
  const sessionName = stored?.session_name ?? buildWahaSessionName(companyId)
  const remote = await getWahaRemoteSession(sessionName)

  if (!remote) {
    if (stored) {
      await deleteStoredWahaSession(supabase, companyId)
    }

    return createEmptyWahaSessionSummary(companyId)
  }

  return syncStoredWahaSessionFromRemote(supabase, companyId, remote)
}

export async function startCompanyWahaSession(
  supabase: SupabaseClient,
  companyId: string
): Promise<WahaSessionSummary> {
  const ensured = await ensureCompanyWahaSession(supabase, companyId)
  const remote =
    (await startWahaRemoteSession(ensured.sessionName)) ??
    (await getWahaRemoteSession(ensured.sessionName))

  if (!remote) {
    return ensured
  }

  return syncStoredWahaSessionFromRemote(supabase, companyId, remote, {
    lastError: null,
  })
}

export async function restartCompanyWahaSession(
  supabase: SupabaseClient,
  companyId: string
): Promise<WahaSessionSummary> {
  const ensured = await ensureCompanyWahaSession(supabase, companyId)
  const remote =
    (await restartWahaRemoteSession(ensured.sessionName)) ??
    (await getWahaRemoteSession(ensured.sessionName))

  if (!remote) {
    return ensured
  }

  return syncStoredWahaSessionFromRemote(supabase, companyId, remote, {
    lastError: null,
  })
}

export async function fetchCompanyWahaQr(
  supabase: SupabaseClient,
  companyId: string
): Promise<WahaSessionSummary> {
  const ensured = await ensureCompanyWahaSession(supabase, companyId)
  const [{ qrCodeDataUrl, qrCodeMimetype }, remote] = await Promise.all([
    getWahaRemoteQr(ensured.sessionName),
    getWahaRemoteSession(ensured.sessionName),
  ])

  if (!remote) {
    return ensured
  }

  return syncStoredWahaSessionFromRemote(supabase, companyId, remote, {
    qrCodeDataUrl,
    qrCodeMimetype,
    lastError: null,
  })
}

export async function removeCompanyWahaSession(
  supabase: SupabaseClient,
  companyId: string
): Promise<WahaSessionSummary> {
  const stored = await getStoredWahaSession(supabase, companyId)
  const sessionName = stored?.session_name ?? buildWahaSessionName(companyId)

  await deleteWahaRemoteSession(sessionName)
  await deleteStoredWahaSession(supabase, companyId)

  return createEmptyWahaSessionSummary(companyId)
}
