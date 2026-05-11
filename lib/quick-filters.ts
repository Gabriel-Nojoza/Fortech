import type { DatasetColumn, QueryFilter } from "@/lib/types"

export type QuickFilterOption = {
  key: string
  label: string
  description: string
  mapped: boolean
  dataType: string
  activeCount: number
  tableName: string | null
  columnName: string | null
}

type QuickFilterBuildOptions = {
  preferredTableNames?: string[]
}

const QUICK_FILTER_SPECS = [
  {
    key: "status",
    label: "Status",
    description: "Filtrar por status",
    keywords: ["status", "situacao", "situação"],
  },
  {
    key: "client_company",
    label: "Cliente/Empresa",
    description: "Filtrar por cliente ou empresa",
    keywords: ["cliente", "empresa", "razao", "razão", "fantasia"],
  },
  {
    key: "date",
    label: "Data",
    description: "Filtrar por data",
    keywords: ["data", "dt_", "date", "emissao", "emissão"],
  },
  {
    key: "sale_condition",
    label: "Cond. Venda",
    description: "Filtrar por condicao de venda",
    keywords: ["condvenda", "cond venda", "cond_venda"],
  },
  {
    key: "goal_type",
    label: "Tipo Meta",
    description: "Filtrar por tipo de meta",
    keywords: ["tipometa", "tipo meta", "tipo_meta"],
  },
  {
    key: "report_type",
    label: "Tipo de Relatorio",
    description: "Filtrar por tipo de relatorio",
    keywords: ["relatorio", "relatório", "tipo_relatorio", "tipo relatório"],
  },
  {
    key: "contact_type",
    label: "Tipo de Contato",
    description: "Filtrar por tipo de contato",
    keywords: ["contato", "tipo_contato", "tipo contato", "grupo"],
  },
  {
    key: "name",
    label: "Buscar por Nome",
    description: "Filtrar por nome",
    keywords: ["nome", "name"],
  },
] as const

export function isDateLikeDataType(dataType: string) {
  const normalized = dataType.toLowerCase()
  return normalized.includes("date") || normalized.includes("time")
}

export function getDefaultFilterValue(dataType: string) {
  if (isDateLikeDataType(dataType)) {
    const now = new Date()
    const month = String(now.getMonth() + 1).padStart(2, "0")
    const day = String(now.getDate()).padStart(2, "0")
    return `${now.getFullYear()}-${month}-${day}`
  }

  return ""
}

export function getDefaultFilterValueTo(dataType: string) {
  return isDateLikeDataType(dataType) ? getDefaultFilterValue(dataType) : ""
}

function normalizeName(value: string | null | undefined) {
  return String(value ?? "").trim().toLowerCase()
}

function isCalendarLikeTableName(tableName: string) {
  const normalized = normalizeName(tableName)
  return (
    normalized.includes("calendar") ||
    normalized.includes("calend") ||
    normalized.includes("calendario")
  )
}

function scoreQuickFilterMatch(
  specKey: string,
  column: Pick<DatasetColumn, "tableName" | "columnName" | "dataType">,
  preferredTableNames: Set<string>
) {
  let score = 0
  const normalizedTableName = normalizeName(column.tableName)
  const normalizedColumnName = normalizeName(column.columnName)

  if (preferredTableNames.has(normalizedTableName)) {
    score += 100
  }

  if (specKey === "date") {
    if (isDateLikeDataType(column.dataType)) {
      score += 50
    }

    if (isCalendarLikeTableName(column.tableName)) {
      score += 80
    }

    if (normalizedColumnName === "data" || normalizedColumnName.startsWith("data")) {
      score += 20
    }
  }

  return score
}

export function buildQuickFilters(
  columns: Array<Pick<DatasetColumn, "tableName" | "columnName" | "dataType">>,
  filters: QueryFilter[],
  options?: QuickFilterBuildOptions
): QuickFilterOption[] {
  const preferredTableNames = new Set(
    (options?.preferredTableNames ?? []).map((tableName) => normalizeName(tableName))
  )

  return QUICK_FILTER_SPECS.map((spec) => {
    const match = columns
      .filter((column) => {
        const haystack = `${column.tableName} ${column.columnName}`.toLowerCase()
        return spec.keywords.some((keyword) => haystack.includes(keyword))
      })
      .sort((left, right) => {
        const scoreDiff =
          scoreQuickFilterMatch(spec.key, right, preferredTableNames) -
          scoreQuickFilterMatch(spec.key, left, preferredTableNames)

        if (scoreDiff !== 0) {
          return scoreDiff
        }

        return `${left.tableName}.${left.columnName}`.localeCompare(
          `${right.tableName}.${right.columnName}`
        )
      })[0]

    const activeCount = match
      ? filters.filter(
          (filter) =>
            filter.tableName === match.tableName &&
            filter.columnName === match.columnName
        ).length
      : 0

    return {
      key: spec.key,
      label: spec.label,
      description: spec.description,
      mapped: !!match,
      dataType: match?.dataType || "N/A",
      activeCount,
      tableName: match?.tableName || null,
      columnName: match?.columnName || null,
    }
  })
}
