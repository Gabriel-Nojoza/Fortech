const TAB_SESSION_KEY = "solucao-inteligente.active-tab-session"
const TAB_ID_KEY = "solucao-inteligente.active-tab-id"
const ACTIVE_TABS_KEY = "solucao-inteligente.active-tabs"

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

export function hasTabSessionMarker() {
  if (typeof window === "undefined") {
    return false
  }

  return sessionStorage.getItem(TAB_SESSION_KEY) === "active"
}

function readActiveTabs() {
  if (typeof window === "undefined") {
    return [] as string[]
  }

  try {
    const rawValue = localStorage.getItem(ACTIVE_TABS_KEY)
    const parsedValue = rawValue ? JSON.parse(rawValue) : []
    return Array.isArray(parsedValue) ? parsedValue.filter((value) => typeof value === "string") : []
  } catch {
    return []
  }
}

function writeActiveTabs(tabIds: string[]) {
  if (typeof window === "undefined") {
    return
  }

  const nextTabIds = Array.from(new Set(tabIds.filter(Boolean)))

  if (nextTabIds.length === 0) {
    localStorage.removeItem(ACTIVE_TABS_KEY)
    return
  }

  localStorage.setItem(ACTIVE_TABS_KEY, JSON.stringify(nextTabIds))
}

function getOrCreateCurrentTabId() {
  if (typeof window === "undefined") {
    return ""
  }

  const existingTabId = sessionStorage.getItem(TAB_ID_KEY)
  if (existingTabId) {
    return existingTabId
  }

  const nextTabId =
    typeof crypto !== "undefined" && typeof crypto.randomUUID === "function"
      ? crypto.randomUUID()
      : `${Date.now()}-${Math.random().toString(16).slice(2)}`

  sessionStorage.setItem(TAB_ID_KEY, nextTabId)
  return nextTabId
}

export function hasOtherActiveTabs() {
  if (typeof window === "undefined") {
    return false
  }

  const currentTabId = sessionStorage.getItem(TAB_ID_KEY)
  return readActiveTabs().some((tabId) => tabId !== currentTabId)
}

export function registerCurrentTab() {
  if (typeof window === "undefined") {
    return
  }

  const currentTabId = getOrCreateCurrentTabId()
  const activeTabs = readActiveTabs()
  writeActiveTabs([...activeTabs, currentTabId])
}

export function unregisterCurrentTab() {
  if (typeof window === "undefined") {
    return
  }

  const currentTabId = sessionStorage.getItem(TAB_ID_KEY)
  if (!currentTabId) {
    return
  }

  const nextActiveTabs = readActiveTabs().filter((tabId) => tabId !== currentTabId)
  writeActiveTabs(nextActiveTabs)
}

export function markTabSessionActive() {
  if (typeof window === "undefined") {
    return
  }

  sessionStorage.setItem(TAB_SESSION_KEY, "active")
  registerCurrentTab()
}

export function clearTabSessionMarker() {
  if (typeof window === "undefined") {
    return
  }

  sessionStorage.removeItem(TAB_SESSION_KEY)
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
