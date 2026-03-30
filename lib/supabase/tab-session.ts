const TAB_SESSION_KEY = "solucao-inteligente.active-tab-session"
const TAB_ID_KEY = "solucao-inteligente.active-tab-id"
const OPEN_TABS_KEY = "solucao-inteligente.open-protected-tabs"
const REQUIRE_LOGIN_AFTER_CLOSE_KEY =
  "solucao-inteligente.require-login-after-close"

function readBrowserCookies() {
  if (typeof document === "undefined" || !document.cookie.trim()) {
    return []
  }

  return document.cookie
    .split(/;\s*/)
    .filter(Boolean)
    .map((entry) => {
      const separatorIndex = entry.indexOf("=")

      if (separatorIndex === -1) {
        return { name: entry, value: "" }
      }

      return {
        name: entry.slice(0, separatorIndex),
        value: entry.slice(separatorIndex + 1),
      }
    })
}

function readOpenTabs() {
  if (typeof window === "undefined") {
    return {} as Record<string, number>
  }

  try {
    const rawValue = localStorage.getItem(OPEN_TABS_KEY)

    if (!rawValue) {
      return {} as Record<string, number>
    }

    const parsed = JSON.parse(rawValue)

    if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) {
      return {} as Record<string, number>
    }

    return parsed as Record<string, number>
  } catch {
    return {} as Record<string, number>
  }
}

function writeOpenTabs(openTabs: Record<string, number>) {
  if (typeof window === "undefined") {
    return
  }

  if (Object.keys(openTabs).length === 0) {
    localStorage.removeItem(OPEN_TABS_KEY)
    return
  }

  localStorage.setItem(OPEN_TABS_KEY, JSON.stringify(openTabs))
}

function getOrCreateTabId() {
  if (typeof window === "undefined") {
    return null
  }

  const existingTabId = sessionStorage.getItem(TAB_ID_KEY)

  if (existingTabId) {
    return existingTabId
  }

  const nextTabId =
    typeof crypto !== "undefined" && typeof crypto.randomUUID === "function"
      ? crypto.randomUUID()
      : `${Date.now()}-${Math.random().toString(36).slice(2)}`

  sessionStorage.setItem(TAB_ID_KEY, nextTabId)
  return nextTabId
}

export function hasTabSessionMarker() {
  if (typeof window === "undefined") {
    return false
  }

  return sessionStorage.getItem(TAB_SESSION_KEY) === "active"
}

export function markTabSessionActive() {
  if (typeof window === "undefined") {
    return
  }

  sessionStorage.setItem(TAB_SESSION_KEY, "active")
  clearFreshLoginRequirement()
}

export function clearTabSessionMarker() {
  if (typeof window === "undefined") {
    return
  }

  sessionStorage.removeItem(TAB_SESSION_KEY)
}

export function registerProtectedTab() {
  if (typeof window === "undefined") {
    return
  }

  const tabId = getOrCreateTabId()

  if (!tabId) {
    return
  }

  const openTabs = readOpenTabs()
  openTabs[tabId] = Date.now()
  writeOpenTabs(openTabs)
}

export function unregisterProtectedTab() {
  if (typeof window === "undefined") {
    return
  }

  const tabId = sessionStorage.getItem(TAB_ID_KEY)
  const openTabs = readOpenTabs()

  if (tabId) {
    delete openTabs[tabId]
  }

  writeOpenTabs(openTabs)

  if (Object.keys(openTabs).length === 0) {
    localStorage.setItem(REQUIRE_LOGIN_AFTER_CLOSE_KEY, "true")
  }
}

export function shouldRequireFreshLoginAfterClose() {
  if (typeof window === "undefined") {
    return false
  }

  return localStorage.getItem(REQUIRE_LOGIN_AFTER_CLOSE_KEY) === "true"
}

export function clearFreshLoginRequirement() {
  if (typeof window === "undefined") {
    return
  }

  localStorage.removeItem(REQUIRE_LOGIN_AFTER_CLOSE_KEY)
}

export function hasSupabaseAuthCookies() {
  return readBrowserCookies().some((cookie) => cookie.name.startsWith("sb-"))
}

export function clearSupabaseAuthCookies() {
  readBrowserCookies()
    .filter((cookie) => cookie.name.startsWith("sb-"))
    .forEach((cookie) => {
      document.cookie = `${cookie.name}=; Path=/; Max-Age=0; Expires=Thu, 01 Jan 1970 00:00:00 GMT`
    })
}
