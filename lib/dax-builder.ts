// lib/dax-builder.ts

type Column = {
  tableName: string
  columnName: string
}

type Measure = {
  tableName?: string
  measureName: string
}

type FilterOperator =
  | "eq"
  | "neq"
  | "gt"
  | "lt"
  | "gte"
  | "lte"
  | "contains"
  | "startswith"

type Filter = {
  tableName: string
  columnName: string
  operator: FilterOperator
  value: string
  valueTo?: string
  dataType?: string
}

type BuildParams = {
  columns: Column[]
  measures: Measure[]
  filters: Filter[]
  limit?: number
  hideZeroRows?: boolean
  useCalculatetable?: boolean
}

function escapeDaxName(value: string) {
  return String(value).replace(/]/g, "]]")
}

function escapeDaxString(value: string) {
  return String(value).replace(/"/g, '""')
}

function tableRef(table: string) {
  return `'${escapeDaxName(table)}'`
}

function colRef(table: string, col: string) {
  return `${tableRef(table)}[${escapeDaxName(col)}]`
}

function measureRef(name: string) {
  return `[${escapeDaxName(name)}]`
}

function isNumericType(dataType?: string) {
  const normalized = String(dataType || "").toLowerCase()
  return (
    normalized.includes("int") ||
    normalized.includes("double") ||
    normalized.includes("decimal") ||
    normalized.includes("number")
  )
}

function isDateType(dataType?: string) {
  const normalized = String(dataType || "").toLowerCase()
  return normalized.includes("date") || normalized.includes("time")
}

type ParsedDate = {
  year: number
  month: number
  day: number
}

type ParsedDateRange = {
  start: ParsedDate
  end: ParsedDate
}

function getDaysInMonth(year: number, month: number) {
  return new Date(Date.UTC(year, month, 0)).getUTCDate()
}

function parseDateValue(value: string): ParsedDateRange | null {
  const trimmed = String(value).trim()
  if (!trimmed) return null

  const fullDateMatch = trimmed.match(/^(\d{4})-(\d{2})-(\d{2})$/)
  if (fullDateMatch) {
    const year = Number(fullDateMatch[1])
    const month = Number(fullDateMatch[2])
    const day = Number(fullDateMatch[3])

    if (!year || month < 1 || month > 12) {
      return null
    }

    const maxDay = getDaysInMonth(year, month)
    if (day < 1 || day > maxDay) {
      return null
    }

    return {
      start: { year, month, day },
      end: { year, month, day },
    }
  }

  const monthMatch = trimmed.match(/^(\d{4})-(\d{2})$/)
  if (monthMatch) {
    const year = Number(monthMatch[1])
    const month = Number(monthMatch[2])

    if (!year || month < 1 || month > 12) {
      return null
    }

    return {
      start: { year, month, day: 1 },
      end: { year, month, day: getDaysInMonth(year, month) },
    }
  }

  const yearMatch = trimmed.match(/^(\d{4})$/)
  if (yearMatch) {
    const year = Number(yearMatch[1])
    if (!year) {
      return null
    }

    return {
      start: { year, month: 1, day: 1 },
      end: { year, month: 12, day: 31 },
    }
  }

  return null
}

function formatDaxDate(date: ParsedDate) {
  return `DATE(${date.year}, ${date.month}, ${date.day})`
}

function formatDaxValue(value: string, dataType?: string) {
  if (isNumericType(dataType)) {
    return value
  }

  if (isDateType(dataType)) {
    const parsed = parseDateValue(value)
    if (parsed) {
      return formatDaxDate(parsed.start)
    }
  }

  return `"${escapeDaxString(value)}"`
}

function buildFilterExpression(filter: Filter) {
  const ref = colRef(filter.tableName, filter.columnName)
  const rawValue = String(filter.value ?? "").trim()
  const rawValueTo = String(filter.valueTo ?? "").trim()

  if (!rawValue && !rawValueTo) return null

  if (isDateType(filter.dataType)) {
    const startDate = rawValue ? parseDateValue(rawValue) : null
    const endDate = rawValueTo ? parseDateValue(rawValueTo) : null

    if (startDate && endDate) {
      return `${ref} >= ${formatDaxDate(startDate.start)} && ${ref} <= ${formatDaxDate(endDate.end)}`
    }

    if (startDate) {
      return `${ref} >= ${formatDaxDate(startDate.start)}`
    }

    if (endDate) {
      return `${ref} <= ${formatDaxDate(endDate.end)}`
    }
  }

  // Multi-select: valor com vírgula → IN {v1, v2, ...}
  const multiValues = rawValue.split(",").map((v) => v.trim()).filter(Boolean)
  if (multiValues.length > 1 && (filter.operator === "eq" || filter.operator === "neq")) {
    const inList = multiValues.map((v) => formatDaxValue(v, filter.dataType)).join(", ")
    if (filter.operator === "neq") return `NOT ${ref} IN {${inList}}`
    return `${ref} IN {${inList}}`
  }

  const valueRef = formatDaxValue(rawValue, filter.dataType)

  switch (filter.operator) {
    case "neq":
      return `${ref} <> ${valueRef}`
    case "gt":
      return `${ref} > ${valueRef}`
    case "lt":
      return `${ref} < ${valueRef}`
    case "gte":
      return `${ref} >= ${valueRef}`
    case "lte":
      return `${ref} <= ${valueRef}`
    case "contains":
      return `CONTAINSSTRING(${ref}, ${valueRef})`
    case "startswith":
      return `STARTSWITH(${ref}, ${valueRef})`
    case "eq":
    default:
      return `${ref} = ${valueRef}`
  }
}

function buildWrappedFilters(filters: Filter[]) {
  return filters
    .filter(
      (filter) =>
        String(filter.value ?? "").trim() !== "" ||
        String(filter.valueTo ?? "").trim() !== ""
    )
    .map(buildFilterExpression)
    .filter((expr): expr is string => Boolean(expr))
}

// Group filters by table and wrap each group as FILTER(ALL(table), expr1 && expr2)
// This is the correct pattern for SUMMARIZECOLUMNS — avoids CALCULATETABLE
// overriding the row context and returning zeros across different dataset structures.
function buildSumcolFilterArgs(filters: Filter[]): string[] {
  const validFilters = filters.filter(
    (f) =>
      String(f.value ?? "").trim() !== "" ||
      String(f.valueTo ?? "").trim() !== ""
  )

  const byTable = new Map<string, Filter[]>()
  for (const filter of validFilters) {
    const existing = byTable.get(filter.tableName) ?? []
    byTable.set(filter.tableName, [...existing, filter])
  }

  const result: string[] = []
  for (const [tableName, tableFilters] of byTable) {
    const exprs = tableFilters
      .map(buildFilterExpression)
      .filter((e): e is string => Boolean(e))
    if (exprs.length === 0) continue
    const combined = exprs.length === 1 ? exprs[0] : exprs.map((e) => `(${e})`).join(" && ")
    result.push(`FILTER(ALL(${tableRef(tableName)}), ${combined})`)
  }

  return result
}

function normalizeForCondition(name: string) {
  return name
    .toLowerCase()
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
}

function buildHideZeroRowsCondition(measures: Measure[]): string {
  if (measures.length === 0) return ""

  // Usa apenas medidas de valor principal — exclui percentuais (%) e devoluções
  // para que a condição reflita exatamente [Meta] + [Vl Pedidos] >= 1
  const valueMeasures = measures.filter((m) => {
    const n = normalizeForCondition(m.measureName)
    return !n.includes("%") && !n.includes("devolu")
  })

  const effective = valueMeasures.length > 0 ? valueMeasures : measures
  const parts = effective.map((m) => `[${escapeDaxName(m.measureName)}]`)
  return parts.length === 1
    ? `${parts[0]} >= 1`
    : `(${parts.join(" + ")}) >= 1`
}

function buildMeasureAlias(measureName: string) {
  return `"${escapeDaxString(measureName)}", COALESCE(CALCULATE(${measureRef(measureName)}), 0)`
}

function choosePrimaryTable(columns: Column[], measures: Measure[]) {
  return columns[0]?.tableName || measures[0]?.tableName || ""
}

export function buildDAXQuery({
  columns,
  measures,
  filters,
  limit = 100,
  hideZeroRows = false,
  useCalculatetable = false,
}: BuildParams): string {
  const hasColumns = columns.length > 0
  const hasMeasures = measures.length > 0

  if (!hasColumns && !hasMeasures) {
    return "-- Selecione campos para gerar DAX"
  }

  const wrappedFilters = buildWrappedFilters(filters)
  const primaryTable = choosePrimaryTable(columns, measures)

  // somente medidas
  if (!hasColumns && hasMeasures) {
    const measureRows = measures.map(
      (measure) =>
        `"${escapeDaxString(measure.measureName)}", COALESCE(CALCULATE(${measureRef(
          measure.measureName
        )}), 0)`
    )

    if (wrappedFilters.length === 0) {
      return `EVALUATE\nROW(\n  ${measureRows.join(",\n  ")}\n)`
    }

    return [
      "EVALUATE",
      "CALCULATETABLE(",
      "  ROW(",
      `    ${measureRows.join(",\n    ")}`,
      "  ),",
      `  ${wrappedFilters.join(",\n  ")}`,
      ")",
    ].join("\n")
  }

  // colunas + medidas
  if (hasColumns && hasMeasures) {
    const uniqueTableNames = new Set(columns.map((c) => c.tableName))
    const isMultiTable = uniqueTableNames.size > 1

    const groupByRefs = columns.map((column) => `    ${colRef(column.tableName, column.columnName)}`)
    const measureAliases = measures.map((measure) => `    ${buildMeasureAlias(measure.measureName)}`)

    if (isMultiTable) {
      // Múltiplas tabelas de dimensão (ex: hierarquia Gerente/Supervisor/Vendedor de tabelas distintas).
      // FILTER(ALL()) dentro do SUMMARIZECOLUMNS não funciona para cross-table — usar CALCULATETABLE.
      const wrappedFilters = buildWrappedFilters(filters)
      const summarizeBody = [...groupByRefs, ...measureAliases].join(",\n")
      const summarizeExpression = ["SUMMARIZECOLUMNS(", summarizeBody, ")"].join("\n")

      const wrapWithHideZero = (inner: string) => {
        if (!hideZeroRows) return inner
        const cond = buildHideZeroRowsCondition(measures)
        return `FILTER(\n  ${inner.replace(/\n/g, "\n  ")},\n  ${cond}\n)`
      }

      if (wrappedFilters.length === 0) {
        const topNInner = wrapWithHideZero(summarizeExpression)
        return [
          "EVALUATE",
          `TOPN(${limit},`,
          `  ${topNInner.replace(/\n/g, "\n  ")},`,
          `  ${measureRef(measures[0].measureName)}, DESC`,
          ")",
          "ORDER BY",
          `  ${measureRef(measures[0].measureName)} DESC`,
        ].join("\n")
      }

      const calcTable = [
        "CALCULATETABLE(",
        `  ${summarizeExpression.replace(/\n/g, "\n  ")},`,
        `  ${wrappedFilters.join(",\n  ")}`,
        ")",
      ].join("\n")
      const topNInner = wrapWithHideZero(calcTable)
      return [
        "EVALUATE",
        `TOPN(${limit},`,
        `  ${topNInner.replace(/\n/g, "\n  ")},`,
        `  ${measureRef(measures[0].measureName)}, DESC`,
        ")",
        "ORDER BY",
        `  ${measureRef(measures[0].measureName)} DESC`,
      ].join("\n")
    }

    if (useCalculatetable) {
      // Modo CALCULATETABLE: filtros ficam fora do SUMMARIZECOLUMNS para evitar que o autoexist
      // restrinja a dimensão de GROUP BY via relacionamento bidirecional (ex: DEVOLUCAO ↔ Gerente).
      // ALL(primaryTable) dentro do SUMMARIZECOLUMNS garante que todos os Gerentes apareçam
      // mesmo que o CALCULATETABLE propague o filtro de volta via relacionamento.
      const wrappedFilters = buildWrappedFilters(filters)
      const summarizeBody = [
        ...groupByRefs,
        `    ALL(${tableRef(primaryTable)})`,
        ...measureAliases,
      ].join(",\n")
      const summarizeExpression = ["SUMMARIZECOLUMNS(", summarizeBody, ")"].join("\n")

      const topNInner = hideZeroRows
        ? `FILTER(\n  ${summarizeExpression.replace(/\n/g, "\n  ")},\n  ${buildHideZeroRowsCondition(measures)}\n)`
        : summarizeExpression

      if (wrappedFilters.length === 0) {
        return [
          "EVALUATE",
          `TOPN(${limit},`,
          `  ${topNInner.replace(/\n/g, "\n  ")},`,
          `  ${measureRef(measures[0].measureName)}, DESC`,
          ")",
          "ORDER BY",
          `  ${measureRef(measures[0].measureName)} DESC`,
        ].join("\n")
      }

      const calcTable = [
        "CALCULATETABLE(",
        `  ${topNInner.replace(/\n/g, "\n  ")},`,
        `  ${wrappedFilters.join(",\n  ")}`,
        ")",
      ].join("\n")
      return [
        "EVALUATE",
        `TOPN(${limit},`,
        `  ${calcTable.replace(/\n/g, "\n  ")},`,
        `  ${measureRef(measures[0].measureName)}, DESC`,
        ")",
        "ORDER BY",
        `  ${measureRef(measures[0].measureName)} DESC`,
      ].join("\n")
    }

    // Tabela única: FILTER(ALL()) dentro do SUMMARIZECOLUMNS evita zeros em datasets de empresa única.
    const filterArgs = buildSumcolFilterArgs(filters).map((f) => `    ${f}`)
    // ALL(primaryTable) quebra cross-filter implícito via relacionamento — necessário quando há filtros
    // em tabelas diferentes da tabela de GROUP BY (ex: CODUSUR em PEDIDOS enquanto GROUP BY é 'Gerente').
    // Sem isso, o FILTER(ALL(outraTabela)) restringe a dimensão do GROUP BY pelo relacionamento.
    const hasOtherTableFilters = filters.some(
      (f) =>
        (String(f.value ?? "").trim() !== "" || String(f.valueTo ?? "").trim() !== "") &&
        f.tableName !== primaryTable
    )
    const forceAllArgs = hideZeroRows || hasOtherTableFilters ? [`    ALL(${tableRef(primaryTable)})`] : []
    const summarizeBody = [...groupByRefs, ...forceAllArgs, ...filterArgs, ...measureAliases].join(",\n")
    const summarizeExpression = ["SUMMARIZECOLUMNS(", summarizeBody, ")"].join("\n")

    const topNInner = hideZeroRows
      ? `FILTER(\n  ${summarizeExpression.replace(/\n/g, "\n  ")},\n  ${buildHideZeroRowsCondition(measures)}\n)`
      : summarizeExpression

    return [
      "EVALUATE",
      `TOPN(${limit},`,
      `  ${topNInner.replace(/\n/g, "\n  ")},`,
      `  ${measureRef(measures[0].measureName)}, DESC`,
      ")",
      "ORDER BY",
      `  ${measureRef(measures[0].measureName)} DESC`,
    ].join("\n")
  }

  // somente colunas
  const selectedFromPrimary = columns.filter((column) => column.tableName === primaryTable)

  if (selectedFromPrimary.length === 0) {
    return "-- Selecione ao menos uma coluna da tabela principal"
  }

  const selectParts = selectedFromPrimary.map(
    (column) =>
      `    "${escapeDaxString(column.columnName)}", ${colRef(column.tableName, column.columnName)}`
  )

  let baseTable = tableRef(primaryTable)

  if (wrappedFilters.length > 0) {
    baseTable = [
      "FILTER(",
      `  ${baseTable},`,
      `  ${wrappedFilters.join("\n  && ")}`,
      ")",
    ].join("\n")
  }

  return [
    "EVALUATE",
    `TOPN(${limit},`,
    "  SELECTCOLUMNS(",
    `    ${baseTable},`,
    `${selectParts.join(",\n")}`,
    "  ),",
    `  ${colRef(selectedFromPrimary[0].tableName, selectedFromPrimary[0].columnName)}, ASC`,
    ")",
  ].join("\n")
}
