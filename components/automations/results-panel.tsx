"use client"

import { useMemo, useState } from "react"
import {
  Settings2,
  Copy,
  Play,
  FileDown,
  Eye,
  ChevronDown,
  ChevronRight,
  TableIcon,
  Loader2,
  X,
  Terminal,
} from "lucide-react"
import { Button } from "@/components/ui/button"
import { Badge } from "@/components/ui/badge"
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table"
import type {
  SelectedColumn,
  SelectedMeasure,
  DAXQueryResult,
} from "@/lib/types"
import { toast } from "sonner"

interface ResultsPanelProps {
  selectedColumns: SelectedColumn[]
  selectedMeasures: SelectedMeasure[]
  daxQuery: string
  result: DAXQueryResult | null
  reportHtml: string | null
  isExecuting: boolean
  onExecute: () => void
  onPreviewHtml: () => void
  onGeneratePdf: () => void | Promise<void>
  isGeneratingPdf?: boolean
  onRemoveColumn: (tableName: string, columnName: string) => void
  onRemoveMeasure: (tableName: string, measureName: string) => void
}

function isNumericLikeType(dataType: string) {
  const normalized = dataType.toLowerCase()
  return (
    normalized.includes("int") ||
    normalized.includes("double") ||
    normalized.includes("decimal") ||
    normalized.includes("number") ||
    normalized.includes("currency") ||
    normalized.includes("real")
  )
}

function isDateLikeType(dataType: string) {
  const normalized = dataType.toLowerCase()
  return normalized.includes("date") || normalized.includes("time")
}

function normalizeMetricName(value: string) {
  return value
    .trim()
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
}

function isCurrencyMetricName(columnName: string) {
  const normalized = normalizeMetricName(columnName)

  if (normalized.includes("%")) {
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
    "cod",
    "sync",
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
    "pedidos enviados",
  ]

  return positiveHints.some((hint) => normalized.includes(hint))
}

function formatNumericValue(
  value: number,
  columnName: string,
  options?: { treatAsCurrency?: boolean }
) {
  if (columnName.includes("%")) {
    return new Intl.NumberFormat("pt-BR", {
      style: "percent",
      minimumFractionDigits: 2,
      maximumFractionDigits: 2,
    }).format(value)
  }

  if (options?.treatAsCurrency) {
    return new Intl.NumberFormat("pt-BR", {
      style: "currency",
      currency: "BRL",
      minimumFractionDigits: 2,
      maximumFractionDigits: 2,
    }).format(value)
  }

  const roundedToInteger = Math.round(value)
  const isEffectivelyInteger = Math.abs(value - roundedToInteger) < 0.0000001

  return new Intl.NumberFormat("pt-BR", {
    minimumFractionDigits: isEffectivelyInteger ? 0 : 2,
    maximumFractionDigits: isEffectivelyInteger ? 0 : 2,
  }).format(isEffectivelyInteger ? roundedToInteger : value)
}

function formatDateValue(value: string) {
  const parsed = new Date(value)

  if (Number.isNaN(parsed.getTime())) {
    return value
  }

  const hasTime =
    parsed.getHours() !== 0 ||
    parsed.getMinutes() !== 0 ||
    parsed.getSeconds() !== 0

  return new Intl.DateTimeFormat("pt-BR", {
    dateStyle: "short",
    ...(hasTime ? { timeStyle: "short" as const } : {}),
  }).format(parsed)
}

function formatCellValue(
  value: unknown,
  column: { name: string; dataType: string },
  options?: { treatAsCurrency?: boolean }
) {
  if (value === null || value === undefined) return ""

  if (typeof value === "number" && isNumericLikeType(column.dataType)) {
    return formatNumericValue(value, column.name, options)
  }

  if (typeof value === "string" && isDateLikeType(column.dataType)) {
    return formatDateValue(value)
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

export function ResultsPanel({
  selectedColumns,
  selectedMeasures,
  daxQuery,
  result,
  reportHtml,
  isExecuting,
  onExecute,
  onPreviewHtml,
  onGeneratePdf,
  isGeneratingPdf,
  onRemoveColumn,
  onRemoveMeasure,
}: ResultsPanelProps) {
  const [showDax, setShowDax] = useState(true)
  const totalItems = selectedColumns.length + selectedMeasures.length
  const selectedMeasureNames = useMemo(
    () => new Set(selectedMeasures.map((measure) => normalizeMetricName(measure.measureName))),
    [selectedMeasures]
  )

  const normalizedColumns = useMemo(() => {
    if (result?.columns?.length) return result.columns
    if (result?.rows?.length) {
      return Object.keys(result.rows[0]).map((name) => ({
        name,
        dataType: "",
      }))
    }
    return []
  }, [result])

  const isNumericColumn = (column: { name: string; dataType: string }) =>
    isNumericLikeType(column.dataType)

  const isCurrencyColumn = (column: { name: string; dataType: string }) => {
    if (column.dataType.toLowerCase().includes("currency")) {
      return true
    }

    return (
      selectedMeasureNames.has(normalizeMetricName(column.name)) &&
      isCurrencyMetricName(column.name)
    )
  }

  const copyDax = async () => {
    try {
      await navigator.clipboard.writeText(daxQuery)
      toast.success("DAX copiado para a area de transferencia")
    } catch {
      toast.error("Nao foi possivel copiar automaticamente neste navegador.")
    }
  }

  return (
    <div className="flex h-full flex-col">
      <div className="border-b border-border px-3 py-2">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <Settings2 className="size-4 text-primary" />
            <h3 className="text-sm font-semibold">ITENS SELECIONADOS</h3>
          </div>
          <Badge variant="secondary" className="text-xs">
            {totalItems}
          </Badge>
        </div>

        {totalItems === 0 ? (
          <p className="mt-2 text-xs text-muted-foreground">
            Nenhum item selecionado
          </p>
        ) : (
          <div className="mt-2 flex flex-wrap gap-1">
            {selectedColumns.map((c) => (
              <Badge
                key={`col-${c.tableName}.${c.columnName}`}
                variant="outline"
                className="gap-1 text-[10px]"
              >
                {c.tableName}.{c.columnName}
                <button onClick={() => onRemoveColumn(c.tableName, c.columnName)}>
                  <X className="size-2.5" />
                </button>
              </Badge>
            ))}

            {selectedMeasures.map((m) => (
              <Badge
                key={`msr-${m.tableName}.${m.measureName}`}
                className="gap-1 bg-chart-2/15 text-[10px] text-chart-2 hover:bg-chart-2/25"
              >
                {m.measureName}
                <button onClick={() => onRemoveMeasure(m.tableName, m.measureName)}>
                  <X className="size-2.5" />
                </button>
              </Badge>
            ))}
          </div>
        )}
      </div>

      <div className="border-b border-border">
        <div
          role="button"
          tabIndex={0}
          onClick={() => setShowDax(!showDax)}
          onKeyDown={(event) => {
            if (event.key === "Enter" || event.key === " ") {
              event.preventDefault()
              setShowDax((prev) => !prev)
            }
          }}
          className="flex w-full items-center gap-2 px-3 py-2 text-left transition-colors hover:bg-accent"
        >
          {showDax ? (
            <ChevronDown className="size-3.5" />
          ) : (
            <ChevronRight className="size-3.5" />
          )}
          <span className="text-xs font-semibold text-muted-foreground">
            DAX QUERY
          </span>
          <div className="ml-auto flex gap-1">
            <Button
              variant="ghost"
              size="sm"
              onClick={(e) => {
                e.stopPropagation()
                copyDax()
              }}
              className="h-5 gap-1 text-[10px] text-primary"
              disabled={!daxQuery || daxQuery.startsWith("--")}
            >
              <Copy className="size-3" />
              COPIAR
            </Button>
          </div>
        </div>

        {showDax && (
          <div className="px-3 pb-2">
            <pre className="overflow-x-auto whitespace-pre-wrap rounded-lg bg-muted/50 p-3 text-xs font-mono leading-relaxed text-primary">
              {daxQuery || "-- Selecione campos para gerar DAX"}
            </pre>
          </div>
        )}
      </div>

      <div className="flex items-center gap-2 border-b border-border px-3 py-2">
        <Button
          size="sm"
          onClick={onExecute}
          disabled={isExecuting || !daxQuery || daxQuery.startsWith("--")}
          className="h-7 gap-1.5 text-xs"
        >
          {isExecuting ? (
            <Loader2 className="size-3 animate-spin" />
          ) : (
            <Play className="size-3" />
          )}
          {isExecuting ? "Executando..." : "Executar Query"}
        </Button>

        <Button
          size="sm"
          variant="outline"
          onClick={onPreviewHtml}
          disabled={!reportHtml || !result || result.rows.length === 0}
          className="h-7 gap-1.5 text-xs"
        >
          <Eye className="size-3" />
          Visualizar HTML
        </Button>

        <Button
          size="sm"
          variant="outline"
          onClick={onGeneratePdf}
          disabled={!reportHtml || !result || result.rows.length === 0 || isGeneratingPdf}
          className="h-7 gap-1.5 text-xs"
        >
          {isGeneratingPdf ? (
            <Loader2 className="size-3 animate-spin" />
          ) : (
            <FileDown className="size-3" />
          )}
          {isGeneratingPdf ? "Gerando..." : "Gerar PDF"}
        </Button>

        {result && (
          <span className="text-xs text-muted-foreground">
            {result.rows.length} linha(s) retornada(s)
          </span>
        )}
      </div>

      <div className="flex min-h-0 flex-1 flex-col overflow-hidden">
        <div className="flex items-center gap-2 px-3 py-2">
          <TableIcon className="size-4 text-primary" />
          <h3 className="text-sm font-semibold">RESULTADOS</h3>
        </div>

        {result ? (
          result.rows.length > 0 ? (
            <div className="min-h-0 flex-1 overflow-auto px-1 pb-2">
              <div className="min-w-full">
                <Table>
                  <TableHeader>
                    <TableRow>
                      {normalizedColumns.map((col) => (
                        <TableHead
                          key={col.name}
                          className={`h-8 whitespace-nowrap text-xs font-semibold ${
                            isNumericColumn(col) ? "text-right tabular-nums" : ""
                          }`}
                        >
                          {col.name}
                        </TableHead>
                      ))}
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {result.rows.slice(0, 100).map((row, idx) => (
                      <TableRow key={idx}>
                        {normalizedColumns.map((col) => (
                          <TableCell
                            key={col.name}
                            className={`h-7 whitespace-nowrap text-xs ${
                              isNumericColumn(col) ? "text-right tabular-nums" : ""
                            }`}
                          >
                            {formatCellValue(row[col.name], col, {
                              treatAsCurrency: isCurrencyColumn(col),
                            })}
                          </TableCell>
                        ))}
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>

                {result.rows.length > 100 && (
                  <p className="px-3 py-2 text-center text-xs text-muted-foreground">
                    Mostrando 100 de {result.rows.length} linhas
                  </p>
                )}
              </div>
            </div>
          ) : (
            <div className="flex flex-1 flex-col items-center justify-center text-muted-foreground">
              <TableIcon className="mb-2 size-10 opacity-30" />
              <p className="text-xs font-medium uppercase tracking-wider">
                Consulta executada sem linhas
              </p>
            </div>
          )
        ) : (
          <div className="flex flex-1 flex-col items-center justify-center text-muted-foreground">
            <Terminal className="mb-2 size-10 opacity-30" />
            <p className="text-xs font-medium uppercase tracking-wider">
              Aguardando execucao
            </p>
          </div>
        )}
      </div>
    </div>
  )
}
