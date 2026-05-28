import { utils as xlsxUtils, write as xlsxWrite } from "xlsx"
import { describePrimaryDateFilter } from "@/lib/query-filters"
import type { QueryFilter, SelectedColumn } from "@/lib/types"

export interface ReportColumn {
  name: string
  dataType?: string
}

export interface ReportResult {
  columns: ReportColumn[]
  rows: Array<Record<string, unknown>>
}

export interface ReportSummaryCard {
  label: string
  value: unknown
  dataType?: string
}

export interface ReportDocumentInput {
  title: string
  subtitle?: string | null
  generatedAt?: Date
  selectedItems?: string[]
  selectedColumns?: SelectedColumn[]
  filters?: QueryFilter[]
  brandLogoUrl?: string
  summaryCards?: ReportSummaryCard[]
  result: ReportResult
  datasetRefreshedAt?: string | null
}

// Colunas fixas do relatório de gerente — define ordem e label exibido no PDF
// aliases: variações do nome que podem vir do Power BI (comparação sem espaços/acentos)
// Para adicionar uma coluna nova: copie um bloco e ajuste label + aliases
// Colunas que aparecem primeiro em todos os relatórios, na ordem abaixo
// aliases: variações do nome que podem vir do Power BI (sem espaços/acentos na comparação)
// Colunas que nunca aparecem no PDF mesmo que selecionadas
const HIDDEN_PDF_COLUMNS = ["condvenda"]

// Para adicionar mais: copie um bloco { label, aliases } e insira na posição desejada
const FIXED_PDF_COLUMNS = [
  { label: "Cod/Gerente",   aliases: ["gerente[cod/gerente]", "gerente.cod/gerente", "cod/gerente"] },
  { label: "Meta",          aliases: ["meta"] },
  { label: "Vl Pedidos",    aliases: ["vl pedidos", "vlpedidos"] },
  { label: "% Meta Ped.",   aliases: ["% meta ped.", "%metaped."] },
  { label: "Gap Ped. R$",   aliases: ["gap ped. r$", "gap ped r$", "falta meta r$"] },
  { label: "% Margem",      aliases: ["% margem", "% margem pedidos", "margem"] },
  { label: "Tend. Ped.",    aliases: ["tend. ped.", "tend.ped.", "% tendencia ped.", "$ tendencia ped.", "tendencia ped."] },
] as const

type ResolvedPdfColumn = {
  name: string
  headerName: string
  sourceName: string | null
  dataType?: string
}

function escapeHtml(value: unknown): string {
  return String(value ?? "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/\"/g, "&quot;")
    .replace(/'/g, "&#39;")
}

function formatRawCellValue(value: unknown): string {
  if (value === null || value === undefined) return ""
  if (typeof value === "boolean") return value ? "Sim" : "Nao"
  if (typeof value === "number") return Number.isFinite(value) ? String(value) : ""
  if (value instanceof Date) return value.toLocaleString("pt-BR")
  return String(value)
}

function normalizeMetricName(value: string) {
  return value
    .trim()
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[\s[\].]+/g, "")
}

function isNumericLikeType(dataType?: string) {
  const normalized = String(dataType || "").toLowerCase()
  return (
    normalized.includes("int") ||
    normalized.includes("double") ||
    normalized.includes("decimal") ||
    normalized.includes("number") ||
    normalized.includes("currency") ||
    normalized.includes("real")
  )
}

function isDateLikeType(dataType?: string) {
  const normalized = String(dataType || "").toLowerCase()
  return normalized.includes("date") || normalized.includes("time")
}

function isPercentMetricName(columnName: string) {
  const normalized = normalizeMetricName(columnName)
  return normalized.includes("%") || normalized.includes("percent")
}

function isCurrencyMetricName(columnName: string) {
  const normalized = normalizeMetricName(columnName)

  if (isPercentMetricName(columnName)) {
    return false
  }

  const negativeHints = [
    "qtde",
    "qtd",
    "quant",
    "condvenda",
    "cliente",
    "status",
    "ano",
    "mes",
    "semana",
    "dias",
    "dia",
    "cod",
    "sync",
    "pos",
  ]

  if (negativeHints.some((hint) => normalized.includes(hint))) {
    return false
  }

  const positiveHints = [
    "r$",
    "$",
    "valor",
    "venda",
    "fatur",
    "ticket",
    "lucro",
    "devolu",
    "meta",
    "gap",
    "prem",
    "forecast",
    "tendencia",
    "pedido",
    "real x meta",
  ]

  return positiveHints.some((hint) => normalized.includes(hint))
}

function isDiscreteMetricName(columnName: string) {
  const normalized = normalizeMetricName(columnName)
  return [
    "dias",
    "dia",
    "semana",
    "posit",
    "cliente",
    "ranking",
    "cod",
    "ordem",
    "qtd",
    "qtde",
  ].some((hint) => normalized.includes(hint))
}

function formatNumericValue(value: number, columnName: string, dataType?: string) {
  if (isPercentMetricName(columnName)) {
    if (Math.abs(value) > 1.5) {
      return `${new Intl.NumberFormat("pt-BR", {
        minimumFractionDigits: 2,
        maximumFractionDigits: 2,
      }).format(value)}%`
    }

    return new Intl.NumberFormat("pt-BR", {
      style: "percent",
      minimumFractionDigits: 2,
      maximumFractionDigits: 2,
    }).format(value)
  }

  if (isCurrencyMetricName(columnName) || String(dataType || "").toLowerCase().includes("currency")) {
    return new Intl.NumberFormat("pt-BR", {
      style: "currency",
      currency: "BRL",
      minimumFractionDigits: 2,
      maximumFractionDigits: 2,
    }).format(value)
  }

  const rounded = Math.round(value)
  const isIntegerLike = Math.abs(value - rounded) < 0.0000001

  if (isDiscreteMetricName(columnName) || (isIntegerLike && isNumericLikeType(dataType))) {
    return new Intl.NumberFormat("pt-BR", {
      maximumFractionDigits: 0,
    }).format(rounded)
  }

  return new Intl.NumberFormat("pt-BR", {
    minimumFractionDigits: isIntegerLike ? 0 : 2,
    maximumFractionDigits: 2,
  }).format(isIntegerLike ? rounded : value)
}

function formatDisplayValue(
  value: unknown,
  column: { name: string; dataType?: string }
): string {
  if (value === null || value === undefined || value === "") return ""

  if (typeof value === "boolean") {
    return value ? "Sim" : "Nao"
  }

  if (typeof value === "number" && isNumericLikeType(column.dataType)) {
    return formatNumericValue(value, column.name, column.dataType)
  }

  if (typeof value === "string" && isDateLikeType(column.dataType)) {
    const parsed = new Date(value)
    if (!Number.isNaN(parsed.getTime())) {
      const hasTime =
        parsed.getHours() !== 0 ||
        parsed.getMinutes() !== 0 ||
        parsed.getSeconds() !== 0

      return new Intl.DateTimeFormat("pt-BR", {
        dateStyle: "short",
        ...(hasTime ? { timeStyle: "short" as const } : {}),
      }).format(parsed)
    }
  }

  if (typeof value === "object") {
    try {
      return JSON.stringify(value)
    } catch {
      return String(value)
    }
  }

  return String(value)
}

function formatCount(value: number) {
  return new Intl.NumberFormat("pt-BR").format(value)
}

function isNumericColumn(column: ReportColumn) {
  return isNumericLikeType(column.dataType)
}

function isNegativeNumericValue(value: unknown) {
  return typeof value === "number" && Number.isFinite(value) && value < 0
}

function getColumnThemeClass(columnName: string) {
  const normalized = normalizeMetricName(columnName)

  if (normalized.includes("meta")) return "theme-meta"
  if (normalized.includes("gap") || normalized.includes("falta")) return "theme-gap"
  if (normalized.includes("tendencia")) return "theme-trend"
  if (normalized.includes("margem")) return "theme-margin"
  if (
    normalized.includes("pedido") ||
    normalized.includes("fatur") ||
    normalized.includes("vl ")
  ) {
    return "theme-sales"
  }
  if (
    normalized.includes("dia") ||
    normalized.includes("semana") ||
    normalized.includes("pos")
  ) {
    return "theme-support"
  }

  return ""
}

const PERCENT_INDICATOR_COLUMNS = ["% meta ped", "tendencia ped", "tend ped"]

function isIndicatorColumn(columnName: string) {
  const n = normalizeMetricName(columnName)
  return n.includes("%") || n.includes("percent") ||
    PERCENT_INDICATOR_COLUMNS.some((kw) => n.includes(normalizeMetricName(kw)))
}

function getPercentIndicatorHtml(value: unknown): string {
  if (typeof value !== "number" || !Number.isFinite(value)) return ""
  const isDecimal = Math.abs(value) <= 1.5
  const pct = isDecimal ? value * 100 : value
  if (pct >= 100) return `<span class="ind-up">▲</span>`
  return `<span class="ind-down">▼</span>`
}

function isHierarchyColumn(headerName: string): boolean {
  const n = normalizeMetricName(headerName)
  return n.includes("gerente") || n.includes("supervisor") || n.includes("cod/sup")
}


function isMetaColumn(name: string): boolean {
  const n = normalizeMetricName(name)
  return (
    n.includes("meta") &&
    !n.includes("%") &&
    !n.includes("gap") &&
    !n.includes("tend") &&
    !n.includes("metaped") &&
    !n.includes("jametasup")
  )
}

function isVendasColumn(name: string): boolean {
  const n = normalizeMetricName(name)
  return n.includes("somavenda") || n.includes("vlpedido") || n.includes("vlvenda")
}

function filterZeroRows(rows: Array<Record<string, unknown>>, columns: ReportColumn[]): Array<Record<string, unknown>> {
  const metaCol = columns.find((c) => isMetaColumn(c.name))
  const vendasCol = columns.find((c) => isVendasColumn(c.name))

  if (metaCol && vendasCol) {
    return rows.filter((row) => {
      const meta = Number(row[metaCol.name] ?? 0)
      const venda = Number(row[vendasCol.name] ?? 0)
      return meta + venda >= 1
    })
  }

  // Sem par meta/vendas — remove linhas onde todas as colunas numéricas são zero
  const numericCols = columns.filter((c) => isNumericLikeType(c.dataType))
  if (numericCols.length > 0) {
    return rows.filter((row) =>
      numericCols.some((col) => {
        const v = Number(row[col.name] ?? 0)
        return Number.isFinite(v) && v !== 0
      })
    )
  }

  return rows
}

const HIERARCHY_LEVELS = [
  { rank: 0, hints: ["fornecedor", "cod/forn", "codforn", "fornec"] },
  { rank: 1, hints: ["gerente"] },
  { rank: 2, hints: ["supervisor", "cod/sup", "codsup"] },
  { rank: 3, hints: ["cod/vend", "codvend", "vendedor"] },
] as const

function getHierarchyRank(name: string): number {
  const n = normalizeMetricName(name)
  for (const level of HIERARCHY_LEVELS) {
    if (level.hints.some((h) => n.includes(normalizeMetricName(h)))) return level.rank
  }
  return -1
}

function sortByHierarchy(
  rows: Array<Record<string, unknown>>,
  cols: ResolvedPdfColumn[]
): Array<Record<string, unknown>> {
  const hierCols = cols
    .filter((c) => getHierarchyRank(c.name) >= 0)
    .sort((a, b) => getHierarchyRank(a.name) - getHierarchyRank(b.name))

  if (hierCols.length === 0) return rows

  return [...rows].sort((a, b) => {
    for (const col of hierCols) {
      const av = String(a[col.sourceName ?? col.name] ?? "")
      const bv = String(b[col.sourceName ?? col.name] ?? "")
      const cmp = av.localeCompare(bv, "pt-BR", { sensitivity: "base" })
      if (cmp !== 0) return cmp
    }
    return 0
  })
}

function isPedidosEnviadosColumn(name: string): boolean {
  const n = normalizeMetricName(name)
  return (
    n.includes("pedidosenviado") ||
    n.includes("pedidosenv") ||
    n.includes("somavenda") ||
    n.includes("vlpedido") ||
    n.includes("vlvenda")
  )
}

function isTendenciaValueColumn(name: string): boolean {
  const n = normalizeMetricName(name)
  return n.includes("tendencia") && !n.includes("%") && !n.includes("percent")
}

function sumCol(rows: Array<Record<string, unknown>>, col: ResolvedPdfColumn): number {
  return rows.reduce((acc, row) => {
    const v = col.sourceName ? row[col.sourceName] : undefined
    return acc + (typeof v === "number" && Number.isFinite(v) ? v : 0)
  }, 0)
}

function buildTotalsRow(
  rows: Array<Record<string, unknown>>,
  cols: ResolvedPdfColumn[]
): string {
  // Pre-compute sums for non-% numeric columns
  const sums = new Map<string, number>()
  for (const col of cols) {
    if (isNumericColumn(col) && !isPercentMetricName(col.headerName)) {
      sums.set(col.sourceName ?? col.name, sumCol(rows, col))
    }
  }

  // Totals needed for weighted % calculation
  const metaSum = Array.from(sums.entries()).find(([k]) => isMetaColumn(k))?.[1] ?? 0
  const pedidosSum = Array.from(sums.entries()).find(([k]) => isPedidosEnviadosColumn(k))?.[1] ?? 0
  const tendenciaSum = Array.from(sums.entries()).find(([k]) => isTendenciaValueColumn(k))?.[1] ?? 0

  const cells = cols.map((col, idx) => {
    if (idx === 0) return `<td class="totals-label">TOTAL</td>`

    if (!isNumericColumn(col)) return `<td class="totals-empty"></td>`

    if (isPercentMetricName(col.headerName)) {
      const n = normalizeMetricName(col.headerName)
      let pctValue: number | null = null

      if (n.includes("tend") && metaSum > 0) {
        pctValue = (tendenciaSum / metaSum) * 100
      } else if (n.includes("meta") && metaSum > 0) {
        pctValue = (pedidosSum / metaSum) * 100
      }

      if (pctValue === null) return `<td class="totals-empty"></td>`

      const formatted = formatNumericValue(pctValue, col.headerName, col.dataType)
      const indicator = getPercentIndicatorHtml(pctValue)
      const themeClass = getColumnThemeClass(col.sourceName ?? col.headerName)
      return `<td class="totals-cell is-numeric${themeClass ? " " + themeClass : ""}">${indicator}${escapeHtml(formatted)}</td>`
    }

    const sum = sums.get(col.sourceName ?? col.name) ?? 0
    const formatted = formatDisplayValue(sum, {
      name: col.sourceName ?? col.headerName,
      dataType: col.dataType,
    })
    const themeClass = getColumnThemeClass(col.sourceName ?? col.headerName)
    return `<td class="totals-cell is-numeric${themeClass ? " " + themeClass : ""}">${escapeHtml(formatted)}</td>`
  })
  return `<tr class="totals-row">${cells.join("")}</tr>`
}

function isFilterColumn(columnName: string, filters: QueryFilter[]): boolean {
  const normalizedCol = normalizeMetricName(columnName)
  return filters.some((f) => {
    // Match "TableName[ColumnName]" format returned by DAX
    const composed = normalizeMetricName(`${f.tableName}${f.columnName}`)
    const colOnly = normalizeMetricName(f.columnName)
    return normalizedCol === composed || normalizedCol === colOnly
  })
}

function getColumnWidth(headerName: string): string {
  const chars = headerName.length
  const PX = 5.5  // ~px per character at 9px font
  const PAD = 14  // left + right cell padding
  const raw = Math.round(chars * PX + PAD)

  if (isHierarchyColumn(headerName)) return `${Math.max(130, Math.min(raw, 220))}px`
  if (isPercentMetricName(headerName)) return `${Math.max(52, Math.min(raw, 90))}px`
  if (isCurrencyMetricName(headerName)) return `${Math.max(75, Math.min(raw, 140))}px`
  return `${Math.max(55, Math.min(raw, 140))}px`
}

function groupBy(
  rows: Array<Record<string, unknown>>,
  col: ResolvedPdfColumn
): Array<{ key: string; rows: Array<Record<string, unknown>> }> {
  const order: string[] = []
  const map = new Map<string, Array<Record<string, unknown>>>()
  for (const row of rows) {
    const key = String(formatRawCellValue(col.sourceName ? row[col.sourceName] : ""))
    if (!map.has(key)) { map.set(key, []); order.push(key) }
    map.get(key)!.push(row)
  }
  return order.map((key) => ({ key, rows: map.get(key)! }))
}

function resolvePdfColumns(columns: ReportColumn[]): ResolvedPdfColumn[] {
  const visibleColumns = columns.filter(
    (column) => !HIDDEN_PDF_COLUMNS.some((h) => normalizeMetricName(column.name).includes(h))
  )

  return visibleColumns.map((column) => {
    const fixedMatch = FIXED_PDF_COLUMNS.find((fixedColumn) =>
      fixedColumn.aliases.some(
        (alias) => normalizeMetricName(alias) === normalizeMetricName(column.name)
      )
    )

    return {
      name: column.name,
      headerName: fixedMatch ? fixedMatch.label : column.name,
      sourceName: column.name,
      dataType: column.dataType,
    }
  })
}

function renderDataCells(row: Record<string, unknown>, cols: ResolvedPdfColumn[]): string {
  return cols.map((column) => {
    const cellValue = column.sourceName ? row[column.sourceName] : ""
    const classes = [
      isNumericColumn(column) ? "is-numeric" : "",
      getColumnThemeClass(column.sourceName ?? column.headerName),
      isNegativeNumericValue(cellValue) ? "is-negative" : "",
    ].filter(Boolean).join(" ")
    const formattedValue = formatDisplayValue(cellValue, {
      name: column.sourceName ?? column.headerName,
      dataType: column.dataType,
    })
    const indicator = isIndicatorColumn(column.headerName) ? getPercentIndicatorHtml(cellValue) : ""
    const displayContent = formattedValue ? `${indicator}${escapeHtml(formattedValue)}` : "&nbsp;"
    return `<td class="${classes}">${displayContent}</td>`
  }).join("")
}

function renderGroupHeaderHtml(
  groupName: string,
  rows: Array<Record<string, unknown>>,
  displayCols: ResolvedPdfColumn[],
  level: number
): string {
  const sums = new Map<string, number>()
  for (const col of displayCols) {
    if (isNumericColumn(col) && !isPercentMetricName(col.headerName)) {
      sums.set(col.sourceName ?? col.name, sumCol(rows, col))
    }
  }
  const metaSum = Array.from(sums.entries()).find(([k]) => isMetaColumn(k))?.[1] ?? 0
  const pedidosSum = Array.from(sums.entries()).find(([k]) => isPedidosEnviadosColumn(k))?.[1] ?? 0
  const tendenciaSum = Array.from(sums.entries()).find(([k]) => isTendenciaValueColumn(k))?.[1] ?? 0

  const cells = displayCols.map((col, idx) => {
    if (idx === 0) {
      return `<td class="group-name level-${level}">${escapeHtml(groupName || "—")}</td>`
    }
    if (!isNumericColumn(col)) return `<td class="group-empty"></td>`
    if (isPercentMetricName(col.headerName)) {
      const n = normalizeMetricName(col.headerName)
      let pct: number | null = null
      if (n.includes("tend") && metaSum > 0) pct = (tendenciaSum / metaSum) * 100
      else if (n.includes("meta") && metaSum > 0) pct = (pedidosSum / metaSum) * 100
      if (pct === null) return `<td class="group-empty"></td>`
      const indicator = getPercentIndicatorHtml(pct)
      return `<td class="group-metric is-numeric">${indicator}${escapeHtml(formatNumericValue(pct, col.headerName, col.dataType))}</td>`
    }
    const sum = sums.get(col.sourceName ?? col.name) ?? 0
    const formatted = formatDisplayValue(sum, { name: col.sourceName ?? col.headerName, dataType: col.dataType })
    return `<td class="group-metric is-numeric">${escapeHtml(formatted)}</td>`
  })

  return `<tr class="group-header level-${level}">${cells.join("")}</tr>`
}

function buildGroupedRows(
  rows: Array<Record<string, unknown>>,
  groupCols: ResolvedPdfColumn[],
  displayCols: ResolvedPdfColumn[],
  level: number
): string {
  const groupCol = groupCols[0]
  const remaining = groupCols.slice(1)
  const groups = groupBy(rows, groupCol)
  let html = ""
  for (const group of groups) {
    html += renderGroupHeaderHtml(group.key, group.rows, displayCols, level)
    if (remaining.length > 0) {
      html += buildGroupedRows(group.rows, remaining, displayCols, level + 1)
    } else {
      for (const row of group.rows) {
        html += `<tr class="detail-row">${renderDataCells(row, displayCols)}</tr>`
      }
    }
  }
  return html
}

export function buildSummaryCardsFromResult(result: ReportResult): ReportSummaryCard[] {
  if (!result.rows.length || !result.columns.length) return []

  const orderedColumns = resolvePdfColumns(result.columns)
  const numericNonPct = orderedColumns.filter((c) => isNumericColumn(c) && !isPercentMetricName(c.headerName))

  const sums = new Map<string, number>()
  for (const col of numericNonPct) {
    sums.set(col.sourceName ?? col.name, sumCol(result.rows, col))
  }

  const metaSum = Array.from(sums.entries()).find(([k]) => isMetaColumn(k))?.[1] ?? 0
  const pedidosSum = Array.from(sums.entries()).find(([k]) => isPedidosEnviadosColumn(k))?.[1] ?? 0
  const tendenciaSum = Array.from(sums.entries()).find(([k]) => isTendenciaValueColumn(k))?.[1] ?? 0

  const cards: ReportSummaryCard[] = []
  for (const col of orderedColumns) {
    if (!isNumericColumn(col)) continue
    if (isPercentMetricName(col.headerName)) {
      const n = normalizeMetricName(col.headerName)
      let pct: number | null = null
      if (n.includes("tend") && metaSum > 0) pct = (tendenciaSum / metaSum) * 100
      else if (n.includes("meta") && metaSum > 0) pct = (pedidosSum / metaSum) * 100
      if (pct === null) continue
      cards.push({ label: col.headerName, value: pct, dataType: col.dataType })
    } else {
      cards.push({ label: col.headerName, value: sums.get(col.sourceName ?? col.name) ?? 0, dataType: col.dataType })
    }
  }
  return cards
}

export function buildCsvContent(result: ReportResult): string {
  if (!result.columns.length) return ""

  const escapeCsv = (value: unknown) => `"${formatRawCellValue(value).replace(/"/g, '""')}"`
  const header = result.columns.map((column) => escapeCsv(column.name)).join(",")
  const rows = result.rows.map((row) =>
    result.columns.map((column) => escapeCsv(row[column.name])).join(",")
  )

  return [header, ...rows].join("\n")
}

export function buildExcelContent(result: ReportResult, sheetName = "Relatório"): Buffer {
  const headerRow = result.columns.map((c) => c.name)
  const dataRows = result.rows.map((row) =>
    result.columns.map((c) => {
      const v = row[c.name]
      if (v === null || v === undefined) return ""
      if (typeof v === "number") return v
      const parsed = parseFloat(String(v).replace(",", "."))
      if (!isNaN(parsed) && String(v).trim() !== "") return parsed
      return String(v)
    })
  )

  const worksheet = xlsxUtils.aoa_to_sheet([headerRow, ...dataRows])

  const colCount = result.columns.length
  const rowCount = result.rows.length

  for (let ci = 0; ci < colCount; ci++) {
    const colName = result.columns[ci].name
    const isPercent = colName.includes("%")

    for (let ri = 0; ri < rowCount; ri++) {
      const cellAddr = xlsxUtils.encode_cell({ r: ri + 1, c: ci })
      const cell = worksheet[cellAddr]
      if (!cell || cell.t !== "n") continue

      if (isPercent) {
        cell.z = "0.00%"
      } else {
        const val = cell.v as number
        const hasDecimals = Math.abs(val - Math.round(val)) > 1e-9
        cell.z = hasDecimals ? "#,##0.00" : "#,##0"
      }
    }
  }

  const workbook = xlsxUtils.book_new()
  xlsxUtils.book_append_sheet(workbook, worksheet, sheetName.slice(0, 31))
  return Buffer.from(xlsxWrite(workbook, { type: "buffer", bookType: "xlsx" }))
}

export function buildTextReport(result: ReportResult, maxRows = 100): string {
  if (!result.columns.length) return "Nenhum dado retornado."

  const rows = result.rows.slice(0, maxRows)
  const headers = result.columns.map((column) => column.name)
  const values = rows.map((row) =>
    result.columns.map((column) => formatRawCellValue(row[column.name]))
  )
  const widths = headers.map((header, index) =>
    Math.max(header.length, ...values.map((row) => row[index]?.length ?? 0))
  )

  const renderRow = (row: string[]) =>
    row.map((cell, index) => cell.padEnd(widths[index], " ")).join(" | ")

  const separator = widths.map((width) => "-".repeat(width)).join("-+-")
  const lines = [renderRow(headers), separator, ...values.map(renderRow)]

  if (result.rows.length > maxRows) {
    lines.push("")
    lines.push(`... ${result.rows.length - maxRows} linha(s) omitida(s)`)
  }

  return lines.join("\n")
}

export function buildHtmlReport({
  title,
  generatedAt: _generatedAt,
  selectedItems: _selectedItems,
  selectedColumns = [],
  filters = [],
  summaryCards = [],
  result,
  datasetRefreshedAt,
}: ReportDocumentInput): string {
  const refreshedAt = datasetRefreshedAt
    ? new Date(datasetRefreshedAt).toLocaleString("pt-BR")
    : null
  const filteredPeriod = describePrimaryDateFilter(filters)
  const columns = result.columns
  const rows = filterZeroRows(result.rows, columns)
  const totalRecords = formatCount(rows.length)

  const displayColumns = columns.filter((col) => {
    if (!isFilterColumn(col.name, filters)) return true
    // Filter column — keep in PDF only if it was also explicitly checked as a column
    const n = normalizeMetricName(col.name)
    return selectedColumns.some((sc) => {
      return (
        n === normalizeMetricName(`${sc.tableName}${sc.columnName}`) ||
        n === normalizeMetricName(sc.columnName)
      )
    })
  })
  const orderedColumns = resolvePdfColumns(displayColumns)
  // Quando há medidas numéricas, a query DAX já retorna ordenado pelo valor principal (DESC).
  // Reordenar pela hierarquia quebraria esse sort — só aplica o sort hierárquico em
  // relatórios puramente dimensionais (sem métricas numéricas).
  const hasMeasureColumns = orderedColumns.some((c) => isNumericColumn(c))
  const sortedRows = hasMeasureColumns ? rows : sortByHierarchy(rows, orderedColumns)

  // Detect hierarchy for grouping (gerente → supervisor → vendedor)
  const allHierCols = orderedColumns
    .filter((c) => getHierarchyRank(c.name) >= 0)
    .sort((a, b) => getHierarchyRank(a.name) - getHierarchyRank(b.name))

  // Non-hierarchy text/dimension columns (e.g. fornecedor, produto)
  const extraDimCols = orderedColumns.filter(
    (c) => getHierarchyRank(c.name) < 0 && !isNumericColumn(c)
  )

  // When extra dim cols exist alongside hierarchy cols, promote ALL hierarchy cols
  // to group headers so the extra dim appears in the detail rows (not side-by-side)
  const groupCols = extraDimCols.length > 0 && allHierCols.length >= 1
    ? allHierCols
    : allHierCols.length >= 2 ? allHierCols.slice(0, -1) : []

  // displayCols removes the group-level hierarchy columns (they become row headers)
  const displayCols = groupCols.length > 0
    ? orderedColumns.filter((c) => !groupCols.includes(c))
    : orderedColumns

  const colCount = Math.max(displayCols.length, 1)

  const tableHead = displayCols
    .map((column) => {
      const numericClass = isNumericColumn(column) ? " is-numeric" : ""
      return `<th class="${numericClass.trim()}">${escapeHtml(column.headerName)}</th>`
    })
    .join("")

  const totalsRow = sortedRows.length ? buildTotalsRow(sortedRows, displayCols) : ""

  const tableBody = sortedRows.length === 0
    ? `<tr><td colspan="${colCount}" class="empty">Nenhum dado retornado.</td></tr>`
    : groupCols.length > 0
      ? buildGroupedRows(sortedRows, groupCols, displayCols, 0) + totalsRow
      : sortedRows.map((row) => `<tr>${renderDataCells(row, displayCols)}</tr>`).join("") + totalsRow

  const metaLine = [
    filteredPeriod ? `Periodo: ${filteredPeriod.value}` : "",
    `Registros: ${totalRecords}`,
    refreshedAt ? `Atualizado em: ${refreshedAt}` : "",
  ].filter(Boolean).join("  |  ")

  return `<!DOCTYPE html>
<html lang="pt-BR">
<head>
  <meta charset="utf-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1" />
  <title>${escapeHtml(title)}</title>
  <style>
    * { box-sizing: border-box; margin: 0; padding: 0; }

    body {
      background: #f0f2f8;
      color: #111827;
      font-family: "Segoe UI", Arial, sans-serif;
      overflow-x: auto;
    }

    /* ── Page wrapper ── */
    .page {
      width: fit-content;
      min-width: 320px;
      margin: 24px auto;
      background: #ffffff;
      border-radius: 12px;
      overflow: hidden;
      box-shadow: 0 4px 24px rgba(10,20,60,0.13);
    }

    /* ── Top bar ── */
    .topbar {
      background: #1b2d6e;
      padding: 14px 22px 12px;
      display: flex;
      align-items: center;
      justify-content: space-between;
      gap: 16px;
    }
    .topbar-title {
      color: #ffffff;
      font-size: 17px;
      font-weight: 800;
      letter-spacing: 0.01em;
    }
    .topbar-meta {
      color: rgba(255,255,255,0.72);
      font-size: 11px;
      white-space: nowrap;
    }

    /* ── Accent bar ── */
    .accent-bar {
      height: 4px;
      background: linear-gradient(90deg, #3b82f6 0%, #6366f1 50%, #a855f7 100%);
    }

    /* ── Table area ── */
    .table-wrap {
      padding: 16px 16px 20px;
    }

    table {
      width: auto;
      border-collapse: collapse;
      table-layout: auto;
      font-size: 10px;
    }

    thead tr {
      background: #1b2d6e;
    }
    thead th {
      color: #ffffff;
      padding: 5px 6px;
      text-align: center;
      vertical-align: middle;
      font-size: 9px;
      font-weight: 700;
      white-space: nowrap;
      line-height: 1.25;
      word-break: break-word;
      border-right: 1px solid rgba(255,255,255,0.12);
    }
    thead th:last-child { border-right: none; }

    tbody tr { border-bottom: 1px solid #e5e9f2; }
    tbody tr:last-child { border-bottom: none; }
    tbody tr:hover td { background: #eef2ff !important; }

    tbody td {
      padding: 3px 5px;
      vertical-align: middle;
      font-size: 9px;
      font-weight: 500;
      white-space: nowrap;
      line-height: 1.3;
      word-break: normal;
      background: #ffffff;
      border-right: 1px solid #e5e9f2;
    }
    tbody td:first-child {
      white-space: normal;
      word-break: break-word;
      max-width: 280px;
    }
    tbody td:last-child { border-right: none; }

    tbody tr:nth-child(even) td:not(.theme-meta):not(.theme-sales):not(.theme-gap):not(.theme-trend):not(.theme-support):not(.theme-margin) {
      background: #f8f9fd;
    }

    /* ── Numerics ── */
    .is-numeric {
      text-align: right !important;
      font-variant-numeric: tabular-nums;
      font-weight: 600;
    }

    /* ── Column themes ── */
    .theme-meta    { background: #dbeafe; }
    .theme-sales   { background: #fef9c3; }
    .theme-gap     { background: #fee2e2; }
    .theme-trend   { background: #fef3c7; }
    .theme-support { background: #ede9fe; }
    .theme-margin  { background: #dcfce7; }

    /* ── Indicators ── */
    .ind-up   { color: #16a34a; font-size: 8px; margin-right: 2px; }
    .ind-down { color: #dc2626; font-size: 8px; margin-right: 2px; }
    .is-negative { color: #b91c1c; font-weight: 700; }

    /* ── Group headers ── */
    .group-header.level-0 td { background: #1b2d6e !important; border-top: 2px solid #0f1e54; border-right: 1px solid rgba(255,255,255,0.12); }
    .group-header.level-1 td { background: #2a4490 !important; border-top: 1px solid #1b2d6e; border-right: 1px solid rgba(255,255,255,0.12); }
    .group-header.level-2 td { background: #3d5fbe !important; border-top: 1px solid #2a4490; border-right: 1px solid rgba(255,255,255,0.12); }
    .group-name {
      color: #ffffff !important;
      font-size: 9px;
      font-weight: 800;
      padding: 4px 8px;
      letter-spacing: 0.02em;
    }
    .group-name.level-1 { padding-left: 20px; }
    .group-metric {
      color: #ffffff !important;
      font-size: 9px;
      font-weight: 700;
      padding: 4px 5px;
    }
    .group-empty { background: #1b2d6e !important; }
    .group-header.level-1 .group-empty { background: #2a4490 !important; }
    .group-header.level-2 .group-empty { background: #3d5fbe !important; }
    .detail-row td:first-child { padding-left: 16px; }

    /* ── Totals row ── */
    .totals-row td {
      background: #1b2d6e !important;
      border-top: 2px solid #0f1e54;
      border-bottom: none;
    }
    .totals-label {
      color: #ffffff;
      font-size: 9px;
      font-weight: 800;
      padding: 4px 5px;
      letter-spacing: 0.05em;
    }
    .totals-cell {
      color: #ffffff;
      font-size: 9px;
      font-weight: 700;
      padding: 4px 5px;
    }
    .totals-empty {
      background: #1b2d6e !important;
    }

    /* ── Summary cards ── */
    .cards-wrap {
      display: flex;
      flex-wrap: wrap;
      gap: 10px;
      padding: 14px 16px 6px;
      border-bottom: 1px solid #e5e9f2;
    }
    .card {
      background: #ffffff;
      border: 1px solid #d1d9f0;
      border-radius: 8px;
      padding: 8px 14px;
      min-width: 100px;
      text-align: center;
      box-shadow: 0 1px 4px rgba(10,20,60,0.07);
    }
    .card-label {
      font-size: 9px;
      font-weight: 600;
      color: #1b2d6e;
      white-space: nowrap;
      margin-bottom: 3px;
    }
    .card-value {
      font-size: 13px;
      font-weight: 800;
      color: #111827;
      white-space: nowrap;
      font-variant-numeric: tabular-nums;
    }
    .card-value.is-negative { color: #b91c1c; }

    /* ── Empty state ── */
    .empty {
      text-align: center;
      color: #9ca3af;
      padding: 28px;
      font-size: 12px;
    }

    /* ── Print ── */
    @page { size: A4 landscape; margin: 8mm; }
    @media print {
      * {
        -webkit-print-color-adjust: exact !important;
        print-color-adjust: exact !important;
      }
      body { background: #ffffff; }
      .page { margin: 0; border-radius: 0; box-shadow: none; max-width: none; }
      .table-wrap { padding: 8px; overflow: visible; }
      tbody tr:hover td { background: inherit !important; }
    }
  </style>
</head>
<body>
  <div class="page">
    <header class="topbar">
      <span class="topbar-title">${escapeHtml(title)}</span>
      <span class="topbar-meta">${escapeHtml(metaLine)}</span>
    </header>
    <div class="accent-bar"></div>
    ${summaryCards.length > 0 ? `
    <div class="cards-wrap">
      ${summaryCards.map((card) => {
        const formatted = formatDisplayValue(card.value, { name: card.label, dataType: card.dataType })
        const isNeg = typeof card.value === "number" && card.value < 0
        return `<div class="card">
          <div class="card-label">${escapeHtml(card.label)}</div>
          <div class="card-value${isNeg ? " is-negative" : ""}">${escapeHtml(formatted || String(card.value ?? "—"))}</div>
        </div>`
      }).join("")}
    </div>` : ""}
    <div class="table-wrap">
      <table>
        <colgroup>${displayCols.map((c) => `<col style="min-width:${getColumnWidth(c.headerName)}" />`).join("")}</colgroup>
        <thead>
          <tr>${tableHead}</tr>
        </thead>
        <tbody>
          ${tableBody}
        </tbody>
      </table>
    </div>
  </div>
</body>
</html>`
}
