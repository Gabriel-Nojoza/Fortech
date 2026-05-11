import { buildDAXQuery } from "@/lib/dax-builder"
import type { DAXQueryResult, DatasetMeasure, QueryFilter } from "@/lib/types"

const PREFERRED_SUMMARY_CARD_NAMES = [
  "Dias Uteis",
  "Dias Realizados",
  "Dias Restantes",
  "Vl Faturados",
  "Real x Meta",
  "% Margem Pedidos",
  "Semana_",
] as const

function normalizeMeasureName(value: string) {
  return value
    .trim()
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
}

function selectSummaryMeasures(availableMeasures: DatasetMeasure[]) {
  const measureMap = new Map<string, DatasetMeasure>()

  for (const measure of availableMeasures) {
    const normalized = normalizeMeasureName(measure.measureName)
    if (!measureMap.has(normalized)) {
      measureMap.set(normalized, measure)
    }
  }

  return PREFERRED_SUMMARY_CARD_NAMES.flatMap((measureName) => {
    const measure = measureMap.get(normalizeMeasureName(measureName))
    return measure ? [measure] : []
  })
}

export async function fetchReportSummaryCards(params: {
  availableMeasures: DatasetMeasure[]
  filters: QueryFilter[]
  runQuery: (query: string) => Promise<DAXQueryResult>
}) {
  const summaryMeasures = selectSummaryMeasures(params.availableMeasures)

  if (summaryMeasures.length === 0) {
    return []
  }

  const summaryQuery = buildDAXQuery({
    columns: [],
    measures: summaryMeasures.map((measure) => ({
      tableName: measure.tableName,
      measureName: measure.measureName,
    })),
    filters: params.filters,
    limit: 1,
  })

  const result = await params.runQuery(summaryQuery)
  const firstRow = result.rows[0]

  if (!firstRow) {
    return []
  }

  return summaryMeasures.flatMap((measure) => {
    const columnName =
      Object.keys(firstRow).find(
        (key) => normalizeMeasureName(key) === normalizeMeasureName(measure.measureName)
      ) ?? measure.measureName

    const value = firstRow[columnName]

    if (value === null || value === undefined || value === "") {
      return []
    }

    const matchingColumn = result.columns.find(
      (column) => normalizeMeasureName(column.name) === normalizeMeasureName(columnName)
    )

    return [
      {
        label: measure.measureName,
        value,
        dataType: matchingColumn?.dataType || measure.dataType,
      },
    ]
  })
}
