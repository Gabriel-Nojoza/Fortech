"use client"

import { useCallback, useEffect, useMemo, useRef, useState } from "react"
import { useRouter } from "next/navigation"
import useSWR, { mutate as globalMutate } from "swr"
import {
  Workflow,
  Loader2,
  AlertCircle,
  Database,
  ListFilter,
  Code2,
  X,
} from "lucide-react"
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select"
import { Button } from "@/components/ui/button"
import { Textarea } from "@/components/ui/textarea"
import {
  ResizablePanelGroup,
  ResizablePanel,
  ResizableHandle,
} from "@/components/ui/resizable"
import { TablesPanel } from "@/components/automations/tables-panel"
import { MeasuresPanel } from "@/components/automations/measures-panel"
import { FiltersPanel } from "@/components/automations/filters-panel"
import { ResultsPanel } from "@/components/automations/results-panel"
import { SaveAutomationDialog } from "@/components/automations/save-automation-dialog"
import { SavedAutomationsList, type Automation as SavedAutomation } from "@/components/automations/saved-automations-list"
import { DispatchDialog } from "@/components/automations/dispatch-dialog"
import { PageHeader } from "@/components/dashboard/page-header"
import { buildDAXQuery } from "@/lib/dax-builder"
import { createId } from "@/lib/id"
import {
  buildQuickFilters,
  getDefaultFilterValue,
  getDefaultFilterValueTo,
} from "@/lib/quick-filters"
import { toast } from "sonner"
import { SidebarTrigger } from "@/components/ui/sidebar"
import type { CompanyFeatures } from "@/app/api/features/route"
import type {
  Workspace,
  Contact,
  SelectedColumn,
  SelectedMeasure,
  QueryFilter,
  DatasetTable,
  DatasetColumn,
  DatasetMeasure,
  DAXQueryResult,
  WhatsAppBotInstance,
} from "@/lib/types"

const fetcher = async (url: string) => {
  const response = await fetch(url)
  const data = await response.json()

  if (!response.ok) {
    throw new Error(data?.error || "Falha ao carregar dados")
  }

  return data
}


const BUILDER_STORAGE_KEY = "report-builder-draft"

function loadBuilderDraft() {
  if (typeof window === "undefined") return null
  try {
    const raw = localStorage.getItem(BUILDER_STORAGE_KEY)
    return raw ? JSON.parse(raw) : null
  } catch {
    return null
  }
}

export default function AutomationsPage() {
  const router = useRouter()
  const lastExecutedSignatureRef = useRef("")
  const [mounted, setMounted] = useState(false)
  const [activeTab, setActiveTab] = useState("builder")

  const [selectedWorkspace, setSelectedWorkspace] = useState<string>("")
  const [selectedDataset, setSelectedDataset] = useState<string>("")
  const [selectedExecutionDataset, setSelectedExecutionDataset] = useState<string>("")
  const [selectedColumns, setSelectedColumns] = useState<SelectedColumn[]>([])
  const [selectedMeasures, setSelectedMeasures] = useState<SelectedMeasure[]>([])
  const [activeTableName, setActiveTableName] = useState<string | null>(null)
  const [filters, setFilters] = useState<QueryFilter[]>([])
  const [editingAutomation, setEditingAutomation] = useState<{
    id: string
    name: string
    cron_expression: string | null
    export_format: string
    message_template: string
    contact_ids: string[]
    bot_instance_id?: string | null
  } | null>(null)
  const [autoOpenFilterSignal, setAutoOpenFilterSignal] = useState<string | null>(null)
  const [showHidden, setShowHidden] = useState(false)
  const [result, setResult] = useState<DAXQueryResult | null>(null)
  const [reportHtml, setReportHtml] = useState<string | null>(null)
  const [isExecuting, setIsExecuting] = useState(false)
  const [savingExecutionDataset, setSavingExecutionDataset] = useState(false)
  const [importingAllPowerBi, setImportingAllPowerBi] = useState(false)
  const [importingScannerCatalog, setImportingScannerCatalog] = useState(false)
  const [importingWorkspaceScannerCatalog, setImportingWorkspaceScannerCatalog] =
    useState(false)
  const [customDaxQuery, setCustomDaxQuery] = useState("")
  const [showCustomDax, setShowCustomDax] = useState(false)

  useEffect(() => {
    const draft = loadBuilderDraft()
    if (draft) {
      if (draft.selectedWorkspace) setSelectedWorkspace(draft.selectedWorkspace)
      if (draft.selectedDataset) setSelectedDataset(draft.selectedDataset)
      if (Array.isArray(draft.selectedColumns)) setSelectedColumns(draft.selectedColumns)
      if (Array.isArray(draft.selectedMeasures)) setSelectedMeasures(draft.selectedMeasures)
      if (draft.activeTableName) setActiveTableName(draft.activeTableName)
      if (Array.isArray(draft.filters)) setFilters(draft.filters)
      if (draft.editingAutomationId) {
        setEditingAutomation({
          id: draft.editingAutomationId,
          name: draft.editingAutomationName ?? "",
          cron_expression: draft.editingAutomationCron ?? null,
          export_format: draft.editingAutomationFormat ?? "csv",
          message_template: draft.editingAutomationMessage ?? "",
          contact_ids: Array.isArray(draft.editingAutomationContactIds)
            ? draft.editingAutomationContactIds
            : [],
        })
      }
    }
    setMounted(true)
  }, [])

  // Persist builder state to localStorage whenever it changes
  useEffect(() => {
    if (!mounted) return
    try {
      const state: Record<string, unknown> = {
        selectedWorkspace,
        selectedDataset,
        selectedExecutionDataset,
        selectedColumns,
        selectedMeasures,
        activeTableName,
        filters,
      }
      if (editingAutomation) {
        state.editingAutomationId = editingAutomation.id
        state.editingAutomationName = editingAutomation.name
        state.editingAutomationCron = editingAutomation.cron_expression
        state.editingAutomationFormat = editingAutomation.export_format
        state.editingAutomationMessage = editingAutomation.message_template
        state.editingAutomationContactIds = editingAutomation.contact_ids
      }
      localStorage.setItem(BUILDER_STORAGE_KEY, JSON.stringify(state))
    } catch {
      // ignore storage errors
    }
  }, [mounted, selectedWorkspace, selectedDataset, selectedExecutionDataset, selectedColumns, selectedMeasures, activeTableName, filters, editingAutomation])

  const SWR_OPTS = { revalidateOnFocus: false }
  const { data: rawWorkspaces } = useSWR("/api/workspaces", fetcher, SWR_OPTS)
  const { data: companyFeatures } = useSWR<CompanyFeatures>("/api/features", fetcher, SWR_OPTS)
  const { data: rawContacts } = useSWR("/api/contacts", fetcher, SWR_OPTS)
  const { data: rawBotInstances } = useSWR<WhatsAppBotInstance[]>(
    "/api/bot/instances",
    fetcher,
    SWR_OPTS
  )
  const { data: stats } = useSWR<{
    n8nConfigured?: boolean
    canSyncAllPowerBi?: boolean
    canImportWorkspaceCatalogInBulk?: boolean
  }>("/api/stats", fetcher, SWR_OPTS)
  const { data: botQrConfig } = useSWR<{
    status?: "starting" | "awaiting_qr" | "connected" | "reconnecting" | "offline" | "error"
  }>("/api/bot/qr", fetcher, SWR_OPTS)

  const workspaces: Workspace[] = Array.isArray(rawWorkspaces) ? rawWorkspaces : []
  const contacts: Contact[] = Array.isArray(rawContacts) ? rawContacts : []
  const botInstances: WhatsAppBotInstance[] = Array.isArray(rawBotInstances) ? rawBotInstances : []
  const canShowContacts = botQrConfig?.status === "connected"

  const selectedWs = workspaces.find((w) => w.id === selectedWorkspace)
  const pbiWorkspaceId = selectedWs?.pbi_workspace_id

  const {
    data: rawDatasets,
    isLoading: loadingDatasets,
    error: datasetsError,
  } = useSWR(
    pbiWorkspaceId ? `/api/powerbi/datasets?workspaceId=${pbiWorkspaceId}` : null,
    fetcher,
    SWR_OPTS
  )

  const datasets = Array.isArray(rawDatasets) ? rawDatasets : []

  const {
    data: fixedCatalogPayload,
    mutate: mutateFixedCatalog,
  } = useSWR<{
    catalog: {
      tables: DatasetTable[]
      columns: DatasetColumn[]
      measures: DatasetMeasure[]
    } | null
    updated_at: string | null
    execution_dataset_id: string | null
    execution_workspace_id: string | null
    execution_dataset_name: string | null
  }>(
    selectedDataset ? `/api/automations/catalog?datasetId=${selectedDataset}` : null,
    fetcher,
    SWR_OPTS
  )

  const {
    data: metadata,
    isLoading: loadingMetadata,
    error: metadataError,
    mutate: mutateMetadata,
  } = useSWR<{
    tables: DatasetTable[]
    columns: DatasetColumn[]
    measures: DatasetMeasure[]
  }>(
    selectedDataset && pbiWorkspaceId
      ? `/api/powerbi/metadata?datasetId=${selectedDataset}&workspaceId=${pbiWorkspaceId}&refresh=1`
      : null,
    fetcher,
    SWR_OPTS
  )

  const isLoadingSchema = !!selectedDataset && loadingMetadata

  const schemaError = metadataError ?? null

  const tables = useMemo(() => {
    if (metadata?.tables?.length) return metadata.tables

    const tableMap = new Map<string, DatasetTable>()

    for (const column of metadata?.columns || []) {
      if (!column.tableName || tableMap.has(column.tableName)) continue
      tableMap.set(column.tableName, {
        name: column.tableName,
        isHidden: false,
      })
    }

    for (const measure of metadata?.measures || []) {
      if (!measure.tableName || tableMap.has(measure.tableName)) continue
      tableMap.set(measure.tableName, {
        name: measure.tableName,
        isHidden: false,
      })
    }

    return [...tableMap.values()]
  }, [metadata])

  const columns = metadata?.columns || []
  const measures = metadata?.measures || []

  const linkedTableNames = useMemo(() => {
    const fromColumns = selectedColumns.map((column) => column.tableName)
    const fromFilters = filters.map((filter) => filter.tableName)
    const fromMeasures = selectedMeasures.map((measure) => measure.tableName)
    const linked = [...fromColumns, ...fromFilters, ...fromMeasures]

    if (linked.length > 0) {
      return [...new Set(linked)]
    }

    return activeTableName ? [activeTableName] : []
  }, [activeTableName, filters, selectedColumns, selectedMeasures])

  useEffect(() => {
    if (!selectedDataset) {
      setSelectedExecutionDataset("")
      return
    }

    setSelectedExecutionDataset(
      fixedCatalogPayload?.execution_dataset_id || selectedDataset
    )
  }, [selectedDataset, fixedCatalogPayload?.execution_dataset_id])


  const quickFilters = useMemo(() => {
    return buildQuickFilters(columns, filters, {
      preferredTableNames: linkedTableNames,
    }).filter((item) => item.key === "date")
  }, [columns, filters, linkedTableNames])

  const features = companyFeatures as { reportBuilder?: boolean; campaigns?: boolean; excelExport?: boolean; appName?: string; daxCalculatetable?: boolean; hideZeroRows?: boolean; hideZeroRowsIncludeDevolution?: boolean; daxPreserveGroupBy?: boolean } | null

  const useCalculatetable = features?.daxCalculatetable === true
  const hideZeroRows = features?.hideZeroRows === true
  const hideZeroRowsIncludeDevolution = features?.hideZeroRowsIncludeDevolution === true
  const preserveGroupByContext = features?.daxPreserveGroupBy === true

  const excelExportEnabled = features?.excelExport === true

  const daxQuery = useMemo(
    () =>
      buildDAXQuery({
        columns: selectedColumns,
        measures: selectedMeasures,
        filters,
        limit: 100,
        hideZeroRows,
        hideZeroRowsIncludeDevolution,
        useCalculatetable,
        preserveGroupByContext,
      }),
    [selectedColumns, selectedMeasures, filters, hideZeroRows, hideZeroRowsIncludeDevolution, useCalculatetable, preserveGroupByContext]
  )

  const effectiveDaxQuery = customDaxQuery.trim() || daxQuery

  const hasQuery =
    typeof effectiveDaxQuery === "string" &&
    effectiveDaxQuery.trim().length > 0 &&
    !effectiveDaxQuery.startsWith("--")

  const activateTable = useCallback((tableName: string) => {
    setActiveTableName(tableName)
  }, [])

  const toggleColumn = useCallback((tableName: string, columnName: string) => {
    setActiveTableName(tableName)

    setSelectedColumns((prev) => {
      const exists = prev.some(
        (c) => c.tableName === tableName && c.columnName === columnName
      )

      if (exists) {
        return prev.filter(
          (c) => !(c.tableName === tableName && c.columnName === columnName)
        )
      }

      return [...prev, { tableName, columnName }]
    })
  }, [])

  const toggleMeasure = useCallback((tableName: string, measureName: string) => {
    setActiveTableName(tableName)

    setSelectedMeasures((prev) => {
      const exists = prev.some(
        (m) => m.tableName === tableName && m.measureName === measureName
      )

      if (exists) {
        return prev.filter(
          (m) => !(m.tableName === tableName && m.measureName === measureName)
        )
      }

      return [...prev, { tableName, measureName }]
    })
  }, [])

  const addFilter = useCallback(
    (tableName: string, columnName: string, dataType: string, defaultValue?: string) => {
      const existingFilter = filters.find(
        (filter) =>
          filter.tableName === tableName && filter.columnName === columnName
      )

      if (existingFilter) {
        setAutoOpenFilterSignal(`${existingFilter.id}:${Date.now()}`)
        return
      }

      const nextFilterId = createId("filter")
      setAutoOpenFilterSignal(`${nextFilterId}:${Date.now()}`)

      setFilters((prev) => [
        ...prev,
        {
          id: nextFilterId,
          tableName,
          columnName,
          operator: "eq",
          value: defaultValue ?? getDefaultFilterValue(dataType),
          valueTo: getDefaultFilterValueTo(dataType),
          dataType,
        },
      ])
    },
    [filters]
  )

  const addQuickFilter = useCallback(
    (key: string) => {
      const quickFilter = quickFilters.find((item) => item.key === key)

      if (!quickFilter?.mapped || !quickFilter.tableName || !quickFilter.columnName) {
        toast.error("Esse filtro rapido ainda nao tem uma coluna correspondente no dataset")
        return
      }

      addFilter(quickFilter.tableName, quickFilter.columnName, quickFilter.dataType)
    },
    [addFilter, quickFilters]
  )

  const updateFilter = useCallback((id: string, field: string, value: string) => {
    setFilters((prev) => prev.map((f) => (f.id === id ? { ...f, [field]: value } : f)))
  }, [])

  const removeFilter = useCallback((id: string) => {
    setFilters((prev) => {
      const target = prev.find((f) => f.id === id)
      if (target?.locked) return prev
      return prev.filter((f) => f.id !== id)
    })
    setAutoOpenFilterSignal((current) =>
      current?.startsWith(`${id}:`) ? null : current
    )
  }, [])

  const lockFilter = useCallback((id: string, locked: boolean) => {
    setFilters((prev) => prev.map((f) => (f.id === id ? { ...f, locked } : f)))
  }, [])

  const reorderFilters = useCallback((ids: string[]) => {
    setFilters((prev) => ids.map((id) => prev.find((f) => f.id === id)!).filter(Boolean))
  }, [])

  const executeQuery = useCallback(
    async (options?: { silent?: boolean }) => {
      if (!selectedDataset) {
        toast.error("Selecione um dataset")
        return
      }

      if (!hasQuery) {
        toast.error("Monte uma query valida antes de executar")
        return
      }

      setIsExecuting(true)

      try {
        const requestExecution = async (
          query: string,
          columnsToExecute: SelectedColumn[],
          measuresToExecute: SelectedMeasure[]
        ) => {
          const response = await fetch("/api/powerbi/execute-query", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
              datasetId: selectedDataset,
              executionDatasetId: selectedExecutionDataset || selectedDataset,
              executionWorkspaceId: pbiWorkspaceId || "",
              query,
              filters,
              selectedColumns: columnsToExecute,
              selectedMeasures: measuresToExecute,
              limit: 100,
              reportTitle: "Resultado da Query",
              selectedItems: [
                ...columnsToExecute.map(
                  (column) => `${column.tableName}.${column.columnName}`
                ),
                ...measuresToExecute.map((measure) => measure.measureName),
              ],
            }),
          })

          const data = await response.json()

          return { response, data }
        }

        let { response: res, data } = await requestExecution(
          effectiveDaxQuery,
          selectedColumns,
          selectedMeasures
        )

        if (
          !res.ok &&
          options?.silent &&
          data?.code === "INVALID_MEASURE_CONTEXT" &&
          selectedColumns.length > 0 &&
          selectedMeasures.length > 0
        ) {
          const previewQuery = buildDAXQuery({
            columns: selectedColumns,
            measures: [],
            filters,
            limit: 100,
          })

          const previewExecution = await requestExecution(
            previewQuery,
            selectedColumns,
            []
          )

          if (previewExecution.response.ok) {
            res = previewExecution.response
            data = previewExecution.data
          }
        }

        if (!res.ok) {
          throw new Error(data.error)
        }

        setResult({
          columns: data.columns || [],
          rows: data.rows || [],
        })

        setReportHtml(data.report?.html || null)

        if (!options?.silent) {
          toast.success(`Query executada: ${data.rows?.length || 0} linhas`)
        }
      } catch (error) {
        setReportHtml(null)

        if (!options?.silent) {
          toast.error(error instanceof Error ? error.message : "Erro ao executar query")
        }
      } finally {
        setIsExecuting(false)
      }
    },
    [
      effectiveDaxQuery,
      filters,
      hasQuery,
      pbiWorkspaceId,
      selectedColumns,
      selectedDataset,
      selectedExecutionDataset,
      selectedMeasures,
    ]
  )

  const saveExecutionDatasetMapping = useCallback(
    async (executionDatasetId: string) => {
      if (!selectedDataset || !pbiWorkspaceId) return

      const executionDataset = datasets.find(
        (dataset: { id: string; name: string }) => dataset.id === executionDatasetId
      )

      setSavingExecutionDataset(true)

      try {
        const res = await fetch("/api/automations/catalog", {
          method: "PUT",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            datasetId: selectedDataset,
            workspaceId: pbiWorkspaceId,
            executionDatasetId,
            executionWorkspaceId: pbiWorkspaceId,
            executionDatasetName: executionDataset?.name || null,
          }),
        })

        const data = await res.json()

        if (!res.ok) {
          throw new Error(data.error || "Erro ao salvar dataset auxiliar")
        }

        await mutateFixedCatalog()
        await mutateMetadata()

        toast.success(
          executionDatasetId === selectedDataset
            ? "Execucao configurada para usar o proprio dataset."
            : "Dataset auxiliar de execucao salvo."
        )
      } catch (error) {
        toast.error(
          error instanceof Error ? error.message : "Erro ao salvar dataset auxiliar"
        )
      } finally {
        setSavingExecutionDataset(false)
      }
    },
    [datasets, mutateFixedCatalog, pbiWorkspaceId, selectedDataset]
  )

  useEffect(() => {
    if (!hasQuery) {
      lastExecutedSignatureRef.current = ""
      return
    }
  }, [hasQuery])

  useEffect(() => {
    if (!mounted || !selectedDataset || !hasQuery || isExecuting) {
      return
    }

    const signature = `${selectedDataset}::${effectiveDaxQuery}`

    if (lastExecutedSignatureRef.current === signature) {
      return
    }

    const timeoutId = window.setTimeout(() => {
      lastExecutedSignatureRef.current = signature
      void executeQuery({ silent: true })
    }, 600)

    return () => window.clearTimeout(timeoutId)
  }, [mounted, selectedDataset, hasQuery, effectiveDaxQuery, isExecuting, executeQuery])

  const [isGeneratingPdf, setIsGeneratingPdf] = useState(false)

  const handleGeneratePdf = useCallback(async () => {
    if (!reportHtml) {
      toast.error("Execute uma query com resultado antes de gerar PDF")
      return
    }

    setIsGeneratingPdf(true)
    const toastId = toast.loading("Gerando PDF...")

    try {
      const res = await fetch("/api/automations/generate-pdf", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ html: reportHtml }),
      })

      if (!res.ok) {
        const data = await res.json().catch(() => ({}))
        throw new Error((data as { error?: string }).error || "Erro ao gerar PDF")
      }

      const pdfBlob = await res.blob()
      const url = URL.createObjectURL(pdfBlob)
      const a = document.createElement("a")
      a.href = url
      a.download = "relatorio.pdf"
      document.body.appendChild(a)
      a.click()
      document.body.removeChild(a)
      URL.revokeObjectURL(url)
      toast.success("PDF gerado com sucesso", { id: toastId })
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Erro ao gerar PDF", { id: toastId })
    } finally {
      setIsGeneratingPdf(false)
    }
  }, [reportHtml])

  const handlePreviewHtml = useCallback(() => {
    if (!reportHtml) {
      toast.error("Execute uma query com resultado antes de visualizar o HTML")
      return
    }

    const blob = new Blob([reportHtml], { type: "text/html;charset=utf-8" })
    const url = URL.createObjectURL(blob)
    const previewWindow = window.open(url, "_blank", "width=1400,height=900")

    if (!previewWindow) {
      URL.revokeObjectURL(url)
      toast.error(
        "Nao foi possivel abrir a janela de visualizacao. Verifique se o navegador bloqueou pop-up."
      )
      return
    }

    window.setTimeout(() => URL.revokeObjectURL(url), 30000)
  }, [reportHtml])

  const clearEditingState = () => {
    setEditingAutomation(null)
    try {
      const draft = loadBuilderDraft()
      if (draft) {
        delete draft.editingAutomationId
        delete draft.editingAutomationName
        delete draft.editingAutomationCron
        delete draft.editingAutomationFormat
        delete draft.editingAutomationMessage
        delete draft.editingAutomationContactIds
        localStorage.setItem(BUILDER_STORAGE_KEY, JSON.stringify(draft))
      }
    } catch {
      // ignore
    }
  }

  const handleEditFromList = useCallback((auto: SavedAutomation) => {
    setEditingAutomation({
      id: auto.id,
      name: auto.name,
      cron_expression: auto.cron_expression ?? null,
      export_format: auto.export_format ?? "csv",
      message_template: auto.message_template ?? "",
      contact_ids: auto.contacts?.map((c) => c.id) ?? [],
    })
    setSelectedWorkspace(auto.workspace_id ?? "")
    setSelectedDataset(auto.dataset_id ?? "")
    setSelectedExecutionDataset("")
    setSelectedColumns(auto.selected_columns ?? [])
    setSelectedMeasures(auto.selected_measures ?? [])
    setActiveTableName(null)
    setFilters((auto.filters as QueryFilter[]) ?? [])
    setAutoOpenFilterSignal(null)
    setResult(null)
    setReportHtml(null)
    setActiveTab("builder")
  }, [])

  const handleSave = async (saveData: {
    name: string
    cron_expression: string | null
    export_format: string
    message_template: string
    contact_ids: string[]
    is_active?: boolean
    bot_instance_id?: string | null
  }) => {
    if (!selectedDataset) {
      throw new Error("Selecione um dataset antes de salvar a automacao")
    }

    if (!hasQuery) {
      throw new Error("Monte uma query valida antes de salvar a automacao")
    }

    const isEditing = !!editingAutomation?.id

    const res = await fetch("/api/automations", {
      method: isEditing ? "PUT" : "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        ...saveData,
        ...(isEditing ? { id: editingAutomation!.id } : {}),
        dataset_id: selectedDataset,
        workspace_id: selectedWorkspace || null,
        selected_columns: selectedColumns,
        selected_measures: selectedMeasures,
        filters,
        dax_query: effectiveDaxQuery,
      }),
    })

    const data = await res.json()

    if (!res.ok) {
      const message =
        typeof data?.error === "string"
          ? data.error
          : typeof data?.error?.message === "string"
            ? data.error.message
            : "Erro ao salvar automacao"

      throw new Error(message)
    }

    toast.success(isEditing ? "Automacao atualizada com sucesso!" : "Automacao salva com sucesso!")
    if (isEditing) clearEditingState()
    await globalMutate("/api/automations")
    if (saveData.cron_expression) {
      router.push("/schedules")
    }
  }

  const handleWorkspaceChange = (value: string) => {
    setSelectedWorkspace(value)
    setSelectedDataset("")
    setSelectedExecutionDataset("")
    setSelectedColumns([])
    setSelectedMeasures([])
    setActiveTableName(null)
    setFilters([])
    setAutoOpenFilterSignal(null)
    setResult(null)
    setReportHtml(null)
    lastExecutedSignatureRef.current = ""
  }

  const handleDatasetChange = (value: string) => {
    setSelectedDataset(value)
    setSelectedExecutionDataset(value)
    setSelectedColumns([])
    setSelectedMeasures([])
    setActiveTableName(null)
    setFilters([])
    setAutoOpenFilterSignal(null)
    setResult(null)
    setReportHtml(null)
    lastExecutedSignatureRef.current = ""
  }

  const handleExecutionDatasetChange = async (value: string) => {
    setSelectedExecutionDataset(value)
    lastExecutedSignatureRef.current = ""
    await saveExecutionDatasetMapping(value)
  }

  const importCatalogFromScanner = async () => {
    if (!selectedDataset || !pbiWorkspaceId) {
      toast.error("Selecione workspace e dataset antes de importar")
      return
    }

    setImportingScannerCatalog(true)

    try {
      const res = await fetch("/api/powerbi/scanner-catalog", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          workspaceId: pbiWorkspaceId,
          datasetId: selectedDataset,
        }),
      })

      const data = await res.json()

      if (!res.ok) {
        throw new Error(data.error || "Falha ao importar catalogo via scanner")
      }

      await mutateFixedCatalog()
      await mutateMetadata()

      toast.success(
        `Catalogo importado: ${data.table_count ?? 0} tabelas, ${data.column_count ?? 0
        } colunas, ${data.measure_count ?? 0} medidas`
      )
    } catch (error) {
      toast.error(
        error instanceof Error ? error.message : "Erro ao importar catalogo via scanner"
      )
    } finally {
      setImportingScannerCatalog(false)
    }
  }

  const importAllFromPowerBi = async () => {
    setImportingAllPowerBi(true)

    try {
      const res = await fetch("/api/powerbi/sync", {
        method: "POST",
      })

      const data = await res.json()

      if (!res.ok) {
        throw new Error(data.error || "Falha ao importar tudo do Power BI")
      }

      await globalMutate("/api/workspaces")
      await globalMutate("/api/stats")

      if (pbiWorkspaceId) {
        await globalMutate(`/api/powerbi/datasets?workspaceId=${pbiWorkspaceId}`)
      }

      if (selectedDataset) {
        await mutateFixedCatalog()
        await mutateMetadata()
      }

      const warningsCount = Array.isArray(data.warnings) ? data.warnings.length : 0
      const warningsSuffix = warningsCount > 0 ? ` com ${warningsCount} aviso(s)` : ""

      toast.success(
        `Importacao completa concluida: ${data.workspaces ?? 0} workspaces, ${data.reports ?? 0} relatorios e ${data.datasets ?? 0} datasets${warningsSuffix}`
      )
    } catch (error) {
      toast.error(
        error instanceof Error ? error.message : "Erro ao importar tudo do Power BI"
      )
    } finally {
      setImportingAllPowerBi(false)
    }
  }

  const importWorkspaceCatalogsFromScanner = async () => {
    if (!pbiWorkspaceId) {
      toast.error("Selecione um workspace antes de importar em lote")
      return
    }

    setImportingWorkspaceScannerCatalog(true)

    try {
      const res = await fetch("/api/powerbi/scanner-catalog/bulk", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ workspaceId: pbiWorkspaceId }),
      })

      const data = await res.json()

      if (!res.ok) {
        throw new Error(data.error || "Falha ao importar catalogos do workspace")
      }

      await mutateFixedCatalog()
      await mutateMetadata()

      toast.success(
        `Importacao em lote concluida: ${data.imported_datasets ?? 0} datasets atualizados`
      )
    } catch (error) {
      toast.error(
        error instanceof Error ? error.message : "Erro na importacao em lote do scanner"
      )
    } finally {
      setImportingWorkspaceScannerCatalog(false)
    }
  }

  if (!mounted) {
    return (
      <div className="flex h-[calc(100vh-1rem)] items-center justify-center">
        <Loader2 className="size-8 animate-spin text-primary" />
      </div>
    )
  }

  return (
    <div className="flex h-[calc(100vh-1rem)] flex-col">
      <div className="flex flex-wrap items-center gap-2 border-b border-border px-3 py-2 sm:gap-3 sm:px-4 sm:py-3">
        <div className="flex items-center gap-2">
          <SidebarTrigger className="-ml-1 sm:hidden" />
          <Workflow className="size-5 text-primary" />
          <h1 className="text-base font-bold sm:text-lg">Automações</h1>
        </div>

        <div className="ml-2 inline-flex h-8 items-center gap-1 rounded-lg border border-border bg-muted/40 p-1">
          <Button
            type="button"
            variant={activeTab === "builder" ? "secondary" : "ghost"}
            size="sm"
            className="h-6 gap-1.5 px-2 text-xs"
            onClick={() => setActiveTab("builder")}
          >
            <Database className="size-3" />
            <span className="hidden sm:inline">Construtor de Relatorios</span>
            <span className="sm:hidden">Relatorio</span>
          </Button>

          <Button
            type="button"
            variant={activeTab === "saved" ? "secondary" : "ghost"}
            size="sm"
            className="h-6 gap-1.5 px-2 text-xs"
            onClick={() => setActiveTab("saved")}
          >
            <ListFilter className="size-3" />
            <span className="hidden sm:inline">Automações Salvas</span>
            <span className="sm:hidden">Salvas</span>
          </Button>
        </div>

        <div className="ml-auto flex items-center gap-2">
          {activeTab === "builder" && (
            <Button
              type="button"
              variant={showCustomDax ? "secondary" : "ghost"}
              size="sm"
              className="h-7 gap-1.5 px-2 text-xs"
              onClick={() => setShowCustomDax((prev) => !prev)}
              title="Colar query do Power BI Performance Analyzer"
            >
              <Code2 className="size-3" />
              <span className="hidden sm:inline">Query DAX</span>
            </Button>
          )}

          {activeTab === "builder" && stats?.n8nConfigured === false && (
            <span className="rounded-md border border-destructive/40 bg-destructive/10 px-2 py-1 text-xs text-destructive">
              Webhook N8N nao configurado para este cliente
            </span>
          )}

          {activeTab === "builder" && (
            <>
              <DispatchDialog
                contacts={contacts}
                showContacts={canShowContacts}
                daxQuery={effectiveDaxQuery}
                datasetId={selectedDataset}
                executionDatasetId={selectedExecutionDataset || selectedDataset}
                disabled={!hasQuery}
                excelExportEnabled={excelExportEnabled}
              />

              <SaveAutomationDialog
                botInstances={botInstances}
                onSave={handleSave}
                disabled={!hasQuery}
                editingAutomation={editingAutomation}
                onCancelEdit={clearEditingState}
                excelExportEnabled={excelExportEnabled}
              />
            </>
          )}
        </div>
      </div>

      {activeTab === "builder" && showCustomDax && (
        <div className="border-b border-border bg-muted/20 px-3 py-2 sm:px-4">
          <div className="flex items-center justify-between pb-1.5">
            <span className="flex items-center gap-1.5 text-xs font-medium text-muted-foreground">
              <Code2 className="size-3" />
              Query DAX personalizada
              {customDaxQuery.trim() && (
                <span className="rounded-full bg-primary/15 px-1.5 py-0.5 text-[10px] text-primary">ativa</span>
              )}
            </span>
            <Button
              type="button"
              variant="ghost"
              size="sm"
              className="h-5 w-5 p-0"
              onClick={() => { setCustomDaxQuery(""); setShowCustomDax(false) }}
              title="Fechar"
            >
              <X className="size-3" />
            </Button>
          </div>
          <Textarea
            className="h-28 resize-none font-mono text-xs"
            placeholder={"Cole aqui a query copiada do Power BI Performance Analyzer...\n\nEsta query substitui a gerada automaticamente pelo construtor."}
            value={customDaxQuery}
            onChange={(e) => {
              setCustomDaxQuery(e.target.value)
              lastExecutedSignatureRef.current = ""
              setResult(null)
              setReportHtml(null)
            }}
          />
        </div>
      )}

      {activeTab === "builder" && (
        <>
          <div className="flex flex-wrap items-center gap-2 border-b border-border bg-muted/30 px-3 py-2 sm:px-4">
            <Select value={selectedWorkspace} onValueChange={handleWorkspaceChange}>
              <SelectTrigger className="h-8 w-full text-xs sm:w-48">
                <SelectValue placeholder="Selecione um workspace" />
              </SelectTrigger>

              <SelectContent>
                {workspaces.map((ws) => (
                  <SelectItem key={ws.id} value={ws.id}>
                    {ws.name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>

            <Select
              value={selectedDataset}
              onValueChange={handleDatasetChange}
              disabled={!selectedWorkspace || loadingDatasets}
            >
              <SelectTrigger className="h-8 w-full text-xs sm:w-56">
                {loadingDatasets ? (
                  <Loader2 className="mr-2 size-3 animate-spin" />
                ) : (
                  <Database className="mr-2 size-3" />
                )}

                <SelectValue placeholder="Selecione um dataset" />
              </SelectTrigger>

              <SelectContent>
                {datasets.map((ds: { id: string; name: string }) => (
                  <SelectItem key={ds.id} value={ds.id}>
                    {ds.name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>

            <Select
              value={selectedExecutionDataset}
              onValueChange={(value) => {
                void handleExecutionDatasetChange(value)
              }}
              disabled={!selectedDataset || loadingDatasets || savingExecutionDataset}
            >
              <SelectTrigger className="h-8 w-full text-xs sm:w-64">
                {savingExecutionDataset ? (
                  <Loader2 className="mr-2 size-3 animate-spin" />
                ) : (
                  <Database className="mr-2 size-3" />
                )}

                <SelectValue placeholder="Dataset de execucao" />
              </SelectTrigger>

              <SelectContent>
                {datasets.map((ds: { id: string; name: string }) => (
                  <SelectItem key={`execution-${ds.id}`} value={ds.id}>
                    {ds.name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>

            {isLoadingSchema && (
              <div className="flex items-center gap-1.5 text-xs text-muted-foreground">
                <Loader2 className="size-3 animate-spin" />
                Atualizando metadados direto do Power BI...
              </div>
            )}

            {selectedDataset &&
              selectedExecutionDataset &&
              selectedExecutionDataset !== selectedDataset && (
                <span className="rounded-md border border-primary/30 bg-primary/10 px-2 py-1 text-xs text-primary">
                  Executando no dataset auxiliar
                </span>
              )}

            {(stats?.canSyncAllPowerBi ||
              selectedDataset ||
              (selectedWorkspace && stats?.canImportWorkspaceCatalogInBulk)) && (
              <div className="ml-auto flex flex-wrap items-center gap-2">
                {stats?.canSyncAllPowerBi && (
                  <Button
                    variant="outline"
                    size="sm"
                    className="h-8 gap-1.5 text-xs"
                    onClick={importAllFromPowerBi}
                    disabled={importingAllPowerBi}
                  >
                    {importingAllPowerBi ? (
                      <Loader2 className="size-3 animate-spin" />
                    ) : (
                      <Database className="size-3" />
                    )}
                    Importar Tudo do Power BI
                  </Button>
                )}

                {selectedDataset && (
                  <Button
                    variant="outline"
                    size="sm"
                    className="h-8 gap-1.5 text-xs"
                    onClick={importCatalogFromScanner}
                    disabled={importingScannerCatalog}
                  >
                    {importingScannerCatalog ? (
                      <Loader2 className="size-3 animate-spin" />
                    ) : (
                      <Database className="size-3" />
                    )}
                    Importar Scanner API
                  </Button>
                )}

                {selectedWorkspace && stats?.canImportWorkspaceCatalogInBulk && (
                  <Button
                    variant="outline"
                    size="sm"
                    className="h-8 gap-1.5 text-xs"
                    onClick={importWorkspaceCatalogsFromScanner}
                    disabled={importingWorkspaceScannerCatalog}
                  >
                    {importingWorkspaceScannerCatalog ? (
                      <Loader2 className="size-3 animate-spin" />
                    ) : (
                      <Database className="size-3" />
                    )}
                    Importar Todos do Workspace
                  </Button>
                )}
              </div>
            )}
          </div>

          {!selectedDataset ? (
            <div className="flex flex-1 flex-col items-center justify-center gap-3 text-muted-foreground">
              <Database className="size-12 opacity-20" />
              <p className="text-sm font-medium">Selecione um workspace e dataset para comecar</p>
              <p className="text-xs">
                Monte seu relatorio escolhendo tabelas, medidas e filtros.
              </p>
            </div>
          ) : datasetsError ? (
            <div className="flex flex-1 flex-col items-center justify-center text-muted-foreground">
              <AlertCircle className="mb-3 size-12 opacity-30" />
              <p className="text-sm font-medium">Erro ao carregar datasets</p>
              <p className="text-xs">{datasetsError.message}</p>
            </div>
          ) : isLoadingSchema ? (
            <div className="flex flex-1 items-center justify-center">
              <Loader2 className="size-8 animate-spin text-primary" />
            </div>
          ) : schemaError ? (
            <div className="flex flex-1 flex-col items-center justify-center text-muted-foreground">
              <AlertCircle className="mb-3 size-12 opacity-30" />
              <p className="text-sm font-medium">Erro ao carregar metadados do dataset</p>
              <p className="text-xs">{schemaError.message}</p>
            </div>
          ) : !tables.length && !columns.length ? (
            <div className="flex flex-1 flex-col items-center justify-center text-muted-foreground">
              <AlertCircle className="mb-3 size-12 opacity-30" />
              <p className="text-sm font-medium">Nenhum metadado encontrado</p>
            </div>
          ) : (
            <>
              <div className="flex flex-1 flex-col gap-3 overflow-y-auto p-3 md:hidden">
                <TablesPanel
                  tables={tables}
                  columns={columns}
                  selectedColumns={selectedColumns}
                  filters={filters}
                  activeTableName={activeTableName}
                  onToggleColumn={toggleColumn}
                  onAddFilter={addFilter}
                  onActivateTable={activateTable}
                  showHidden={showHidden}
                  onToggleHidden={() => setShowHidden((prev) => !prev)}
                />

                <MeasuresPanel
                  measures={measures}
                  selectedMeasures={selectedMeasures}
                  linkedTableNames={linkedTableNames}
                  onToggleMeasure={toggleMeasure}
                />

                <FiltersPanel
                  quickFilters={quickFilters}
                  onAddQuickFilter={addQuickFilter}
                  filters={filters}
                  datasetId={selectedDataset}
                  executionDatasetId={selectedExecutionDataset || selectedDataset}
                  executionWorkspaceId={pbiWorkspaceId || null}
                  autoOpenFilterSignal={autoOpenFilterSignal}
                  onUpdateFilter={updateFilter}
                  onRemoveFilter={removeFilter}
                  onLockFilter={lockFilter}
                  onReorderFilters={reorderFilters}
                  onClearAll={() => {
                    setFilters((prev) => prev.filter((f) => f.locked))
                    setAutoOpenFilterSignal(null)
                  }}
                />

                <ResultsPanel
                  selectedColumns={selectedColumns}
                  selectedMeasures={selectedMeasures}
                  daxQuery={effectiveDaxQuery}
                  result={result}
                  reportHtml={reportHtml}
                  isExecuting={isExecuting}
                  onExecute={executeQuery}
                  onPreviewHtml={handlePreviewHtml}
                  onGeneratePdf={handleGeneratePdf}
                  isGeneratingPdf={isGeneratingPdf}
                  onRemoveColumn={toggleColumn}
                  onRemoveMeasure={toggleMeasure}
                  onReorder={(cols, msrs) => {
                    setSelectedColumns(cols)
                    setSelectedMeasures(msrs)
                  }}
                  onClearAll={() => { setSelectedColumns([]); setSelectedMeasures([]) }}
                />
              </div>

              <ResizablePanelGroup direction="horizontal" className="hidden flex-1 md:flex">
                <ResizablePanel defaultSize={22} minSize={15}>
                  <TablesPanel
                    tables={tables}
                    columns={columns}
                    selectedColumns={selectedColumns}
                    filters={filters}
                    activeTableName={activeTableName}
                    onToggleColumn={toggleColumn}
                    onAddFilter={addFilter}
                    onActivateTable={activateTable}
                    showHidden={showHidden}
                    onToggleHidden={() => setShowHidden((prev) => !prev)}
                  />
                </ResizablePanel>

                <ResizableHandle />

                <ResizablePanel defaultSize={20} minSize={12}>
                  <MeasuresPanel
                    measures={measures}
                    selectedMeasures={selectedMeasures}
                    linkedTableNames={linkedTableNames}
                    onToggleMeasure={toggleMeasure}
                  />
                </ResizablePanel>

                <ResizableHandle />

                <ResizablePanel defaultSize={20} minSize={12}>
                  <FiltersPanel
                    quickFilters={quickFilters}
                    onAddQuickFilter={addQuickFilter}
                    filters={filters}
                    datasetId={selectedDataset}
                    executionDatasetId={selectedExecutionDataset || selectedDataset}
                    executionWorkspaceId={pbiWorkspaceId || null}
                    autoOpenFilterSignal={autoOpenFilterSignal}
                    onUpdateFilter={updateFilter}
                    onRemoveFilter={removeFilter}
                    onLockFilter={lockFilter}
                    onReorderFilters={reorderFilters}
                    onClearAll={() => {
                      setFilters((prev) => prev.filter((f) => f.locked))
                      setAutoOpenFilterSignal(null)
                    }}
                  />
                </ResizablePanel>

                <ResizableHandle />

                <ResizablePanel defaultSize={38} minSize={25}>
                  <ResultsPanel
                    selectedColumns={selectedColumns}
                    selectedMeasures={selectedMeasures}
                    daxQuery={effectiveDaxQuery}
                    result={result}
                    reportHtml={reportHtml}
                    isExecuting={isExecuting}
                    onExecute={executeQuery}
                    onPreviewHtml={handlePreviewHtml}
                    onGeneratePdf={handleGeneratePdf}
                    isGeneratingPdf={isGeneratingPdf}
                    onRemoveColumn={toggleColumn}
                    onRemoveMeasure={toggleMeasure}
                    onReorder={(cols, msrs) => {
                      setSelectedColumns(cols)
                      setSelectedMeasures(msrs)
                    }}
                    onClearAll={() => { setSelectedColumns([]); setSelectedMeasures([]) }}
                  />
                </ResizablePanel>
              </ResizablePanelGroup>
            </>
          )}
        </>
      )}

      {activeTab === "saved" && (
        <div className="flex-1 overflow-y-auto p-4 sm:p-6">
          <SavedAutomationsList onEdit={handleEditFromList} />
        </div>
      )}
    </div>
  )
}
