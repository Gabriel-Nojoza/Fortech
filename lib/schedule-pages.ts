function normalizePageName(value: unknown) {
  return typeof value === "string" && value.trim() ? value.trim() : null
}

export function normalizeSchedulePageNames(value: unknown) {
  if (Array.isArray(value)) {
    const uniquePageNames = new Set<string>()

    for (const item of value) {
      const normalized = normalizePageName(item)
      if (normalized) {
        uniquePageNames.add(normalized)
      }
    }

    return [...uniquePageNames]
  }

  const normalized = normalizePageName(value)
  return normalized ? [normalized] : []
}

export function resolveSchedulePageNames(input: {
  pbi_page_names?: unknown
  pbi_page_name?: unknown
}) {
  const normalizedPageNames = normalizeSchedulePageNames(input.pbi_page_names)

  if (normalizedPageNames.length > 0) {
    return normalizedPageNames
  }

  return normalizeSchedulePageNames(input.pbi_page_name)
}

export function getPrimarySchedulePageName(pageNames: string[]) {
  return pageNames[0] ?? null
}
