"use client"

import { useState } from "react"
import Link from "next/link"
import { useRouter } from "next/navigation"
import useSWR, { mutate as globalMutate } from "swr"
import {
  FileBarChart2,
  ExternalLink,
  Search,
  RefreshCcw,
  Loader2,
  Eye,
  Workflow,
  Pencil,
  Play,
  Clock,
  Copy,
} from "lucide-react"
import { PageHeader } from "@/components/dashboard/page-header"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Skeleton } from "@/components/ui/skeleton"
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select"
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table"
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "@/components/ui/tooltip"
import type { Report, Workspace } from "@/lib/types"
import { describeCronValue } from "@/lib/schedule-cron"
import { toast } from "sonner"

const BUILDER_STORAGE_KEY = "report-builder-draft"

interface AutomationItem {
  id: string
  name: string
  dataset_id: string
  workspace_id: string | null
  selected_columns: { tableName: string; columnName: string }[]
  selected_measures: { tableName: string; measureName: string }[]
  filters: unknown[]
  dax_query: string | null
  cron_expression: string | null
  export_format: string
  is_active: boolean
  contacts: { id: string; name: string }[]
}

const fetcher = async (url: string) => {
  const response = await fetch(url)
  const data = await response.json()

  if (!response.ok) {
    throw new Error(data?.error || "Falha ao carregar dados")
  }

  return data
}

export default function ReportsPage() {
  const router = useRouter()

  const {
    data: reports,
    isLoading,
    mutate: mutateReports,
  } = useSWR<(Report & { workspace_name: string })[]>("/api/reports", fetcher)

  const {
    data: workspaces,
    mutate: mutateWorkspaces,
  } = useSWR<Workspace[]>("/api/workspaces", fetcher)

  const { data: automationsData, isLoading: loadingAutomations } =
    useSWR<AutomationItem[]>("/api/automations", fetcher)

  const reportList = Array.isArray(reports) ? reports : []
  const workspaceList = Array.isArray(workspaces) ? workspaces : []
  const automationList = Array.isArray(automationsData) ? automationsData : []

  const [search, setSearch] = useState("")
  const [wsFilter, setWsFilter] = useState("all")
  const [syncingPowerBi, setSyncingPowerBi] = useState(false)
  const [runningId, setRunningId] = useState<string | null>(null)
  const [previewingId, setPreviewingId] = useState<string | null>(null)

  function handleEditAutomation(auto: AutomationItem) {
    try {
      localStorage.setItem(BUILDER_STORAGE_KEY, JSON.stringify({
        selectedWorkspace: auto.workspace_id ?? "",
        selectedDataset: auto.dataset_id ?? "",
        selectedExecutionDataset: "",
        selectedColumns: auto.selected_columns ?? [],
        selectedMeasures: auto.selected_measures ?? [],
        activeTableName: null,
        filters: auto.filters ?? [],
      }))
    } catch {
      // ignore storage errors
    }
    router.push("/automations")
  }

  async function handleRunAutomation(auto: AutomationItem) {
    setRunningId(auto.id)
    try {
      const res = await fetch("/api/automations/run", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ automation_id: auto.id }),
      })
      const data = await res.json()
      if (!res.ok) throw new Error(data.error)
      toast.success(`Automacao executada: ${data.rowCount ?? 0} linhas retornadas.`)
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Erro ao executar automacao")
    } finally {
      setRunningId(null)
    }
  }

  async function handlePreviewAutomation(auto: AutomationItem) {
    // Abre a janela ANTES do fetch — navegadores permitem window.open apenas
    // em resposta síncrona a um clique do usuário.
    const win = window.open("", "_blank")
    if (!win) {
      toast.error("Navegador bloqueou o pop-up. Permita pop-ups para este site.")
      return
    }
    win.document.write("<p style='font-family:sans-serif;padding:2rem'>Gerando relatorio...</p>")

    setPreviewingId(auto.id)
    try {
      const res = await fetch("/api/automations/run", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ automation_id: auto.id, contact_ids: [] }),
      })
      const data = await res.json()
      if (!res.ok) throw new Error(data.error)
      const html = data.report?.html
      if (!html) throw new Error("Relatorio sem conteudo HTML")
      win.document.open()
      win.document.write(html)
      win.document.close()
    } catch (error) {
      const msg = error instanceof Error ? error.message : "Erro ao visualizar automacao"
      win.document.open()
      win.document.write(`<p style="font-family:sans-serif;padding:2rem;color:#dc2626"><strong>Erro ao gerar relatorio</strong><br/><br/>${msg}</p>`)
      win.document.close()
      toast.error(msg)
    } finally {
      setPreviewingId(null)
    }
  }

  async function handleDuplicateAutomation(auto: AutomationItem) {
    try {
      const res = await fetch("/api/automations", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          name: `Copia de ${auto.name}`,
          dataset_id: auto.dataset_id,
          workspace_id: auto.workspace_id,
          selected_columns: auto.selected_columns ?? [],
          selected_measures: auto.selected_measures ?? [],
          filters: auto.filters ?? [],
          dax_query: null,
          cron_expression: auto.cron_expression,
          export_format: auto.export_format,
          message_template: null,
          contact_ids: auto.contacts?.map((c) => c.id) ?? [],
        }),
      })
      const data = await res.json()
      if (!res.ok) throw new Error(data.error ?? "Erro ao duplicar")
      toast.success("Automação duplicada!")
      void globalMutate("/api/automations")
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Erro ao duplicar automação")
    }
  }

  function describeFormat(format: string) {
    if (format === "table") return "Tabela"
    return format.toUpperCase()
  }

  const filtered = reportList.filter((report) => {
    const matchSearch = report.name.toLowerCase().includes(search.toLowerCase())
    const matchWs = wsFilter === "all" || report.workspace_id === wsFilter
    return matchSearch && matchWs
  })

  async function handleSyncPowerBi() {
    try {
      setSyncingPowerBi(true)

      const response = await fetch("/api/powerbi/sync", {
        method: "POST",
      })

      const data = await response.json()

      if (!response.ok) {
        throw new Error(data?.error || "Erro ao sincronizar Power BI")
      }

      await Promise.all([mutateReports(), mutateWorkspaces()])

      const warningCount = Array.isArray(data?.warnings) ? data.warnings.length : 0
      const inactiveWorkspaceCount = Number(data?.inactive_workspaces ?? 0)
      const removedCatalogCount = Number(data?.removed_catalog_datasets ?? 0)
      const baseMessage = `Sincronizacao concluida: ${data.workspaces ?? 0} workspace(s), ${data.reports ?? 0} relatorio(s) e ${data.datasets ?? 0} dataset(s).`

      if (warningCount > 0 || inactiveWorkspaceCount > 0 || removedCatalogCount > 0) {
        const details = [
          inactiveWorkspaceCount > 0
            ? `${inactiveWorkspaceCount} workspace(s) obsoleto(s) foram desativados`
            : null,
          removedCatalogCount > 0
            ? `${removedCatalogCount} catalogo(s) de dataset obsoleto(s) foram removidos`
            : null,
          warningCount > 0 ? `${warningCount} aviso(s) ocorreram durante a atualizacao` : null,
        ]
          .filter(Boolean)
          .join(". ")

        toast.success(`${baseMessage} ${details}.`)
      } else {
        toast.success(baseMessage)
      }
    } catch (error) {
      toast.error(
        error instanceof Error ? error.message : "Erro ao sincronizar Power BI"
      )
    } finally {
      setSyncingPowerBi(false)
    }
  }

  return (
    <div className="flex flex-1 flex-col">
      <PageHeader
        title="Relatorios"
        description="Relatorios sincronizados do Power BI"
      />

      <div className="flex flex-1 flex-col gap-4 p-6">
        <div className="flex flex-col gap-3 sm:flex-row sm:items-center">
          <div className="relative flex-1">
            <Search className="absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
            <Input
              placeholder="Buscar relatorios..."
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              className="pl-9"
            />
          </div>

          <Select value={wsFilter} onValueChange={setWsFilter}>
            <SelectTrigger className="w-full sm:w-[220px]">
              <SelectValue placeholder="Workspace" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">Todos os Workspaces</SelectItem>
              {workspaceList.map((workspace) => (
                <SelectItem key={workspace.id} value={workspace.id}>
                  {workspace.name}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>

          <Button
            type="button"
            variant="outline"
            onClick={handleSyncPowerBi}
            disabled={syncingPowerBi}
            className="gap-2"
          >
            {syncingPowerBi ? (
              <Loader2 className="size-4 animate-spin" />
            ) : (
              <RefreshCcw className="size-4" />
            )}
            {syncingPowerBi ? "Sincronizando..." : "Sincronizar Power BI"}
          </Button>
        </div>

        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2 text-base">
              <FileBarChart2 className="size-4 text-primary" />
              Relatorios Power BI
            </CardTitle>
          </CardHeader>

          <CardContent className="p-0">
            {isLoading ? (
              <div className="space-y-3 p-6">
                {Array.from({ length: 5 }).map((_, index) => (
                  <Skeleton key={index} className="h-12 rounded" />
                ))}
              </div>
            ) : filtered.length === 0 ? (
              <div className="flex flex-col items-center gap-4 py-12">
                <FileBarChart2 className="size-12 text-muted-foreground" />
                <div className="text-center">
                  <p className="font-medium">Nenhum relatorio encontrado</p>
                  <p className="text-sm text-muted-foreground">
                    Clique em sincronizar para buscar os relatorios do Power BI.
                  </p>
                </div>
              </div>
            ) : (
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Nome</TableHead>
                    <TableHead>Workspace</TableHead>
                    <TableHead>Status</TableHead>
                    <TableHead className="text-right">Acoes</TableHead>
                  </TableRow>
                </TableHeader>

                <TableBody>
                  {filtered.map((report) => (
                    <TableRow key={report.id}>
                      <TableCell>
                        <div className="flex items-center gap-2">
                          <FileBarChart2 className="size-4 text-primary" />
                          {report.is_active ? (
                            <Link
                              href={`/reports/${report.id}`}
                              className="font-medium transition-colors hover:text-primary"
                            >
                              {report.name}
                            </Link>
                          ) : (
                            <span className="font-medium text-muted-foreground">{report.name}</span>
                          )}
                        </div>
                      </TableCell>

                      <TableCell>
                        <Badge variant="outline">{report.workspace_name}</Badge>
                      </TableCell>

                      <TableCell>
                        <Badge variant={report.is_active ? "default" : "secondary"}>
                          {report.is_active ? "Ativo" : "Inativo"}
                        </Badge>
                      </TableCell>

                      <TableCell className="text-right">
                        <div className="flex items-center justify-end gap-2">
                          {report.is_active ? (
                            <Button variant="outline" size="sm" asChild>
                              <Link href={`/reports/${report.id}`} className="gap-1.5">
                                <Eye className="size-4" />
                                Abrir
                              </Link>
                            </Button>
                          ) : (
                            <Button variant="outline" size="sm" disabled className="gap-1.5">
                              <Eye className="size-4" />
                              Abrir
                            </Button>
                          )}

                          {report.is_active && report.web_url && (
                            <Button variant="ghost" size="icon" asChild>
                              <a
                                href={report.web_url}
                                target="_blank"
                                rel="noopener noreferrer"
                              >
                                <ExternalLink className="size-4" />
                                <span className="sr-only">Abrir no Power BI</span>
                              </a>
                            </Button>
                          )}
                        </div>
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            )}
          </CardContent>
        </Card>

        {/* Automações criadas no Construtor */}
        <Card>
          <CardHeader>
            <div className="flex items-center justify-between">
              <CardTitle className="flex items-center gap-2 text-base">
                <Workflow className="size-4 text-primary" />
                Automações DAX ({automationList.length})
              </CardTitle>
              <Button variant="outline" size="sm" asChild className="gap-1.5 text-xs">
                <Link href="/automations">
                  <Pencil className="size-3.5" />
                  Ir para Construtor
                </Link>
              </Button>
            </div>
          </CardHeader>

          <CardContent className="p-0">
            {loadingAutomations ? (
              <div className="space-y-3 p-6">
                {Array.from({ length: 3 }).map((_, index) => (
                  <Skeleton key={index} className="h-12 rounded" />
                ))}
              </div>
            ) : automationList.length === 0 ? (
              <div className="flex flex-col items-center gap-4 py-12">
                <Workflow className="size-12 text-muted-foreground" />
                <div className="text-center">
                  <p className="font-medium">Nenhuma automacao salva</p>
                  <p className="text-sm text-muted-foreground">
                    Crie uma query no Construtor de Relatorios e salve como automacao.
                  </p>
                </div>
                <Button variant="outline" asChild>
                  <Link href="/automations">Abrir Construtor</Link>
                </Button>
              </div>
            ) : (
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Nome</TableHead>
                    <TableHead>Formato</TableHead>
                    <TableHead>Frequencia</TableHead>
                    <TableHead>Contatos</TableHead>
                    <TableHead>Status</TableHead>
                    <TableHead className="text-right">Acoes</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {automationList.map((auto) => (
                    <TableRow key={auto.id}>
                      <TableCell className="font-medium">{auto.name}</TableCell>
                      <TableCell>
                        <Badge variant="outline" className="text-xs">
                          {describeFormat(auto.export_format)}
                        </Badge>
                      </TableCell>
                      <TableCell>
                        {auto.cron_expression ? (
                          <Badge variant="outline" className="gap-1 text-xs">
                            <Clock className="size-3" />
                            {describeCronValue(auto.cron_expression).join(" | ")}
                          </Badge>
                        ) : (
                          <Badge variant="outline" className="text-xs">Sob demanda</Badge>
                        )}
                      </TableCell>
                      <TableCell>
                        <Badge variant="secondary" className="text-xs">
                          {auto.contacts?.length ?? 0} contato(s)
                        </Badge>
                      </TableCell>
                      <TableCell>
                        <Badge variant={auto.is_active ? "default" : "secondary"} className="text-xs">
                          {auto.is_active ? "Ativa" : "Inativa"}
                        </Badge>
                      </TableCell>
                      <TableCell className="text-right">
                        <div className="flex items-center justify-end gap-1">
                          <TooltipProvider>
                            <Tooltip>
                              <TooltipTrigger asChild>
                                <Button
                                  variant="outline"
                                  size="sm"
                                  className="gap-1.5"
                                  disabled={previewingId === auto.id}
                                  onClick={() => void handlePreviewAutomation(auto)}
                                >
                                  {previewingId === auto.id ? (
                                    <Loader2 className="size-3.5 animate-spin" />
                                  ) : (
                                    <Eye className="size-3.5" />
                                  )}
                                  Abrir
                                </Button>
                              </TooltipTrigger>
                              <TooltipContent>Visualizar relatorio</TooltipContent>
                            </Tooltip>
                          </TooltipProvider>
                          <TooltipProvider>
                            <Tooltip>
                              <TooltipTrigger asChild>
                                <Button
                                  variant="ghost"
                                  size="icon"
                                  className="size-8"
                                  onClick={() => handleEditAutomation(auto)}
                                >
                                  <Pencil className="size-3.5" />
                                </Button>
                              </TooltipTrigger>
                              <TooltipContent>Editar no construtor</TooltipContent>
                            </Tooltip>
                          </TooltipProvider>
                          <TooltipProvider>
                            <Tooltip>
                              <TooltipTrigger asChild>
                                <Button
                                  variant="ghost"
                                  size="icon"
                                  className="size-8"
                                  onClick={() => void handleDuplicateAutomation(auto)}
                                >
                                  <Copy className="size-3.5" />
                                </Button>
                              </TooltipTrigger>
                              <TooltipContent>Duplicar automação</TooltipContent>
                            </Tooltip>
                          </TooltipProvider>
                          <TooltipProvider>
                            <Tooltip>
                              <TooltipTrigger asChild>
                                <Button
                                  variant="ghost"
                                  size="icon"
                                  className="size-8"
                                  disabled={runningId === auto.id}
                                  onClick={() => handleRunAutomation(auto)}
                                >
                                  {runningId === auto.id ? (
                                    <Loader2 className="size-3.5 animate-spin" />
                                  ) : (
                                    <Play className="size-3.5" />
                                  )}
                                </Button>
                              </TooltipTrigger>
                              <TooltipContent>Executar agora</TooltipContent>
                            </Tooltip>
                          </TooltipProvider>
                        </div>
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            )}
          </CardContent>
        </Card>
      </div>
    </div>
  )
}
