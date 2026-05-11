import { describePrimaryDateFilter } from "@/lib/query-filters"
import type { QueryFilter } from "@/lib/types"
import { BRAND_LOGO_PATH, BRAND_NAME } from "@/lib/branding"

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
  filters?: QueryFilter[]
  brandLogoUrl?: string
  summaryCards?: ReportSummaryCard[]
  result: ReportResult
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
  { label: "Cod/Gerente",   aliases: ["gerente[cod/gerente]", "gerente.cod/gerente", "cod/gerente", "cod/sup.", "pcusuari[cod/vend.]"] },
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
  return PERCENT_INDICATOR_COLUMNS.some((kw) => n.includes(normalizeMetricName(kw)))
}

function getPercentIndicatorHtml(value: unknown): string {
  if (typeof value !== "number" || !Number.isFinite(value)) return ""
  const isDecimal = Math.abs(value) <= 1.5
  const pct = isDecimal ? value * 100 : value
  if (pct >= 100) return `<span class="ind-up">▲</span>`
  return `<span class="ind-down">▼</span>`
}

function resolvePdfColumns(columns: ReportColumn[]): ResolvedPdfColumn[] {
  const usedColumnNames = new Set<string>()

  const visibleColumns = columns.filter(
    (column) => !HIDDEN_PDF_COLUMNS.some((h) => normalizeMetricName(column.name).includes(h))
  )

  const fixedColumns = FIXED_PDF_COLUMNS.map((fixedColumn) => {
    const match = visibleColumns.find((column) =>
      fixedColumn.aliases.some(
        (alias) => normalizeMetricName(alias) === normalizeMetricName(column.name)
      )
    )

    if (match) usedColumnNames.add(match.name)

    return {
      name: match?.name ?? fixedColumn.label,
      headerName: fixedColumn.label,
      sourceName: match?.name ?? null,
      dataType: match?.dataType,
    }
  })

  const extraColumns = visibleColumns
    .filter((column) => !usedColumnNames.has(column.name))
    .map((column) => ({
      name: column.name,
      headerName: column.name,
      sourceName: column.name,
      dataType: column.dataType,
    }))

  return [...fixedColumns, ...extraColumns]
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
  subtitle,
  generatedAt,
  selectedItems: _selectedItems,
  filters = [],
  brandLogoUrl = BRAND_LOGO_PATH,
  summaryCards = [],
  result,
}: ReportDocumentInput): string {
  const generated = (generatedAt ?? new Date()).toLocaleString("pt-BR")
  const filteredPeriod = describePrimaryDateFilter(filters)
  const columns = result.columns
  const rows = result.rows
  const totalRecords = formatCount(rows.length)

  const visibleSummaryCards =
    summaryCards.length > 0
      ? summaryCards
      : [
          {
            label: filteredPeriod ? "Periodo" : "Gerado em",
            value: filteredPeriod?.value ?? generated,
            dataType: "String",
          },
          {
            label: "Registros",
            value: rows.length,
            dataType: "Int64",
          },
        ]

  const summaryCardsHtml = visibleSummaryCards
    .map((card) => {
      const displayValue = formatDisplayValue(card.value, {
        name: card.label,
        dataType: card.dataType,
      })
      const compactClass =
        displayValue.length > 18
          ? "summary-card--tight"
          : displayValue.length > 13
            ? "summary-card--compact"
            : ""

      return `<article class="summary-card ${compactClass}">
        <span>${escapeHtml(card.label)}</span>
        <strong>${escapeHtml(displayValue || "-")}</strong>
      </article>`
    })
    .join("")

  const infoChips = [
    filteredPeriod
      ? `<span class="info-chip"><b>Periodo:</b> ${escapeHtml(filteredPeriod.value)}</span>`
      : "",
    `<span class="info-chip"><b>Registros:</b> ${escapeHtml(totalRecords)}</span>`,
    `<span class="info-chip"><b>Gerado em:</b> ${escapeHtml(generated)}</span>`,
  ]
    .filter(Boolean)
    .join("")

  const orderedColumns = resolvePdfColumns(columns)

  const tableHead = orderedColumns
    .map((column) => {
      const numericClass = isNumericColumn(column) ? " is-numeric" : ""
      return `<th class="${numericClass.trim()}">${escapeHtml(column.headerName)}</th>`
    })
    .join("")

  const tableBody = rows.length
    ? rows
        .map((row) => {
          const cells = orderedColumns
            .map((column) => {
              const cellValue = column.sourceName ? row[column.sourceName] : ""
              const classes = [
                isNumericColumn(column) ? "is-numeric" : "",
                getColumnThemeClass(column.sourceName ?? column.headerName),
                isNegativeNumericValue(cellValue) ? "is-negative" : "",
              ]
                .filter(Boolean)
                .join(" ")

              const formattedValue = formatDisplayValue(cellValue, {
                name: column.sourceName ?? column.headerName,
                dataType: column.dataType,
              })
              const indicator = isIndicatorColumn(column.headerName)
                ? getPercentIndicatorHtml(cellValue)
                : ""
              const displayContent = formattedValue
                ? `${indicator}${escapeHtml(formattedValue)}`
                : "&nbsp;"
              return `<td class="${classes}">${displayContent}</td>`
            })
            .join("")

          return `<tr>${cells}</tr>`
        })
        .join("")
    : `<tr><td colspan="${Math.max(orderedColumns.length, 1)}" class="empty">Nenhum dado retornado.</td></tr>`

  const headerSubtitle = subtitle?.trim()
    ? subtitle.trim()
    : "Acompanhe o progresso da consulta com o mesmo recorte aplicado no construtor."

  return `<!DOCTYPE html>
<html lang="pt-BR">
<head>
  <meta charset="utf-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1" />
  <title>${escapeHtml(title)}</title>
  <style>
    :root {
      color-scheme: light;
      --page-bg: #eef2fb;
      --surface: #ffffff;
      --line: #1e2a5a;
      --hero: #334182;
      --hero-accent: #ff7f11;
      --hero-text: #ffd8a8;
      --body-text: #0f172a;
      --meta-bg: #dff3fb;
      --sales-bg: #ffe7a7;
      --gap-bg: #ffb6b3;
      --trend-bg: #f5d89a;
      --support-bg: #eef2ff;
      --margin-bg: #fff4cf;
    }
    * { box-sizing: border-box; }
    body {
      margin: 0;
      padding: 20px;
      background: linear-gradient(180deg, #f8faff 0%, var(--page-bg) 100%);
      color: var(--body-text);
      font-family: "Segoe UI", Tahoma, Arial, sans-serif;
    }
    .report-shell {
      display: flex;
      width: 100%;
      max-width: 1680px;
      margin: 0 auto;
      background: var(--surface);
      border-radius: 18px;
      overflow: hidden;
      box-shadow: 0 18px 42px rgba(15, 23, 42, 0.12);
      border: 1px solid #d8deee;
    }
    .report-strip {
      width: 78px;
      flex: 0 0 78px;
      background: linear-gradient(180deg, #ff8a1e 0%, var(--hero-accent) 100%);
    }
    .report-main {
      flex: 1;
      min-width: 0;
      background: #f7f8fc;
    }
    .hero {
      background: var(--hero);
      color: #fff;
      padding: 18px 22px 14px;
    }
    .hero-top {
      display: flex;
      align-items: center;
      gap: 14px;
      margin-bottom: 10px;
    }
    .hero-top img {
      width: 44px;
      height: 44px;
      object-fit: contain;
    }
    .hero-brand {
      display: flex;
      flex-direction: column;
      gap: 2px;
    }
    .hero-brand strong {
      font-size: 14px;
      line-height: 1.1;
      letter-spacing: 0.02em;
    }
    .hero-brand span {
      font-size: 11px;
      text-transform: uppercase;
      letter-spacing: 0.08em;
      color: rgba(255, 255, 255, 0.74);
    }
    .hero h1 {
      margin: 0;
      color: var(--hero-text);
      font-size: 24px;
      line-height: 1.1;
      font-weight: 800;
    }
    .hero p {
      margin: 6px 0 0;
      font-size: 13px;
      color: rgba(255, 255, 255, 0.9);
    }
    .summary-zone {
      padding: 18px 22px 14px;
      background: #ffffff;
      border-bottom: 1px solid #dde3f0;
    }
    .summary-grid {
      display: grid;
      grid-template-columns: repeat(auto-fit, minmax(220px, 1fr));
      gap: 10px;
      margin-bottom: 12px;
    }
    .summary-card {
      position: relative;
      min-height: 84px;
      padding: 16px 14px 14px 18px;
      border: 1px solid #304080;
      border-radius: 10px;
      background: linear-gradient(180deg, #ffffff 0%, #fbfcff 100%);
      display: flex;
      flex-direction: column;
      justify-content: center;
      gap: 8px;
      box-shadow: 0 10px 20px rgba(48, 64, 128, 0.08);
    }
    .summary-card::before {
      content: "";
      position: absolute;
      left: 0;
      top: 0;
      bottom: 0;
      width: 8px;
      border-radius: 10px 0 0 10px;
      background: var(--hero);
    }
    .summary-card span {
      display: block;
      color: #253774;
      font-size: 12px;
      font-weight: 700;
      line-height: 1.2;
    }
    .summary-card strong {
      display: block;
      color: #111827;
      font-size: clamp(20px, 1.9vw, 28px);
      font-weight: 800;
      line-height: 1.08;
      letter-spacing: -0.035em;
      overflow-wrap: anywhere;
      word-break: break-word;
    }
    .summary-card--compact strong {
      font-size: clamp(18px, 1.55vw, 24px);
    }
    .summary-card--tight strong {
      font-size: clamp(16px, 1.3vw, 21px);
    }
    .info-ribbon {
      display: flex;
      flex-wrap: wrap;
      gap: 8px;
    }
    .info-chip {
      display: inline-flex;
      align-items: center;
      border-radius: 999px;
      border: 1px solid #ced6eb;
      background: #f7f9ff;
      padding: 7px 12px;
      font-size: 12px;
      color: #31427d;
    }
    .selected {
      padding: 16px 22px 0;
      background: #ffffff;
    }
    .selected .label {
      display: block;
      margin-bottom: 8px;
      font-size: 12px;
      font-weight: 700;
      text-transform: uppercase;
      letter-spacing: 0.05em;
      color: #475467;
    }
    .pill-list {
      display: flex;
      flex-wrap: wrap;
      gap: 8px;
    }
    .pill {
      display: inline-flex;
      align-items: center;
      border-radius: 999px;
      border: 1px solid #cfd6ea;
      background: #ffffff;
      padding: 6px 12px;
      font-size: 12px;
      color: #253774;
    }
    .content {
      padding: 12px 8px 18px 8px;
      background: #f7f8fc;
    }
    .section-title {
      display: inline-flex;
      align-items: center;
      min-height: 28px;
      padding: 0 10px;
      border-radius: 10px 10px 0 0;
      background: var(--hero);
      color: #ffffff;
      font-size: 11px;
      font-weight: 700;
      margin: 0 0 4px 82px;
      box-shadow: inset 0 0 0 2px rgba(255, 255, 255, 0.16);
    }
    .table-wrap {
      overflow-x: auto;
      border: 1px solid var(--line);
      background: #ffffff;
    }
    table {
      width: 100%;
      border-collapse: collapse;
      font-size: 10px;
      table-layout: fixed;
    }
    thead th {
      background: var(--hero);
      color: #ffffff;
      border: 1px solid var(--line);
      padding: 2px 4px;
      text-align: center;
      vertical-align: top;
      font-size: 9px;
      font-weight: 800;
      white-space: normal;
      line-height: 1.1;
      word-break: break-word;
    }
    tbody td {
      border: 1px solid #aeb7d0;
      padding: 1px 1px;
      vertical-align: middle;
      font-size: 9px;
      font-weight: 600;
      white-space: normal;
      line-height: 1.1;
      word-break: break-word;
      background: #ffffff;
    }
    tbody tr:nth-child(even) td:not(.theme-meta):not(.theme-sales):not(.theme-gap):not(.theme-trend):not(.theme-support):not(.theme-margin) {
      background: #f7f8fc;
    }
    .is-numeric {
      text-align: right !important;
      font-variant-numeric: tabular-nums;
    }
    .theme-meta { background: var(--meta-bg); }
    .theme-sales { background: var(--sales-bg); }
    .theme-gap { background: var(--gap-bg); }
    .theme-trend { background: var(--trend-bg); }
    .theme-support { background: var(--support-bg); }
    .theme-margin { background: var(--margin-bg); }
    .ind-up {
      color: #15803d;
      font-size: 8px;
      margin-right: 2px;
    }
    .ind-down {
      color: #b91c1c;
      font-size: 8px;
      margin-right: 2px;
    }
    .is-negative {
      color: #991b1b;
      font-weight: 800;
    }
    .empty {
      text-align: center;
      color: #667085;
      padding: 26px;
      background: #f8fafc;
      font-size: 13px;
    }
    .footer {
      padding: 16px 22px 20px;
      color: #475467;
      font-size: 11px;
      background: #ffffff;
      border-top: 1px solid #dde3f0;
    }
    @media print {
      body {
        padding: 0;
        background: #ffffff;
      }
      .report-shell {
        box-shadow: none;
        border-radius: 0;
        max-width: none;
      }
      .table-wrap {
        overflow: visible;
      }
    }
    @media (max-width: 980px) {
      body { padding: 10px; }
      .report-strip { display: none; }
      .summary-grid {
        grid-template-columns: repeat(2, minmax(0, 1fr));
      }
      .summary-card strong {
        font-size: 22px;
      }
      .section-title {
        margin-left: 0;
      }
    }
  </style>
</head>
<body>
  <div class="report-shell">
    <aside class="report-strip"></aside>
    <main class="report-main">
      <section class="hero">
        <div class="hero-top">
          <img src="${escapeHtml(brandLogoUrl)}" alt="${escapeHtml(BRAND_NAME)}" />
          <div class="hero-brand">
            <strong>${escapeHtml(BRAND_NAME)}</strong>
            <span>Relatorio automatizado</span>
          </div>
        </div>
        <h1>${escapeHtml(title)}</h1>
        <p>${escapeHtml(headerSubtitle)}</p>
      </section>

      <section class="summary-zone">
        <div class="summary-grid">${summaryCardsHtml}</div>
        <div class="info-ribbon">${infoChips}</div>
      </section>

      <section class="content">
        <div class="section-title">${escapeHtml(title)}</div>
        <div class="table-wrap">
          <table>
            <thead>
              <tr>${tableHead}</tr>
            </thead>
            <tbody>
              ${tableBody}
            </tbody>
          </table>
        </div>
      </section>

      <footer class="footer">
        ${escapeHtml(BRAND_NAME)} | Conteudo pronto para envio por N8N e conversao para PDF quando necessario.
      </footer>
    </main>
  </div>
</body>
</html>`
}
