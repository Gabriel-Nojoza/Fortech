"use client"

import { useEffect, useRef, useState } from "react"
import useSWR, { mutate } from "swr"
import {
  Megaphone,
  Plus,
  Trash2,
  Pencil,
  Play,
  Loader2,
  ImageIcon,
  X,
  Clock,
} from "lucide-react"
import { toast } from "sonner"
import { PageHeader } from "@/components/dashboard/page-header"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Badge } from "@/components/ui/badge"
import { Switch } from "@/components/ui/switch"
import { Textarea } from "@/components/ui/textarea"
import { Card, CardContent } from "@/components/ui/card"
import { Skeleton } from "@/components/ui/skeleton"
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog"
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog"
import {
  Select,
  SelectContent,
  SelectGroup,
  SelectItem,
  SelectLabel,
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
import { CampaignDispatchDialog } from "@/components/campaigns/dispatch-dialog"
import { ColumnSelect } from "@/components/campaigns/column-select"
import type { Campaign, Workspace, WhatsAppBotInstance, DatasetTable, DatasetColumn } from "@/lib/types"

async function fetchApi(url: string, init?: RequestInit) {
  const response = await fetch(url, init)
  let data: unknown = null
  try { data = await response.json() } catch { data = null }
  return { response, data }
}

function extractError(data: unknown): string {
  if (!data || typeof data !== "object") return ""
  const err = (data as { error?: unknown }).error
  return typeof err === "string" ? err : ""
}

const fetcher = async <T,>(url: string): Promise<T> => {
  const { response, data } = await fetchApi(url)
  if (!response.ok) throw new Error(extractError(data) || "Erro ao carregar")
  return data as T
}

const DATE_TYPES = ["DateTime", "Date", "DateTimeZone", "datetime", "date"]

const DAYS_OPTIONS = [
  { label: "30 dias", value: 30 },
  { label: "60 dias", value: 60 },
  { label: "90 dias", value: 90 },
  { label: "120 dias", value: 120 },
  { label: "Personalizado", value: 0 },
]

const EMPTY_FORM = {
  name: "",
  description: "",
  dataset_id: "",
  workspace_id: "",
  customer_table: "",
  date_column: "",
  days_inactive: 30 as number,
  days_custom: "" as string,
  phone_column: "",
  name_column: "",
  message_template: "Ola {{nome}}, faz muito tempo que nao te vemos! Venha nos visitar.",
  image_url: "",
  bot_instance_id: "",
  is_active: true,
}

type FormState = typeof EMPTY_FORM

function formatDate(iso: string | null) {
  if (!iso) return "—"
  return new Date(iso).toLocaleString("pt-BR", {
    day: "2-digit", month: "2-digit", year: "2-digit",
    hour: "2-digit", minute: "2-digit",
  })
}

function getDaysValue(form: FormState): number | null {
  if (form.days_inactive === 0) {
    const custom = parseInt(form.days_custom, 10)
    return isNaN(custom) || custom <= 0 ? null : custom
  }
  return form.days_inactive
}

export default function CampaignsPage() {
  const { data: campaigns, isLoading } = useSWR<Campaign[]>("/api/campaigns", fetcher)
  const { data: workspaces } = useSWR<Workspace[]>("/api/workspaces", fetcher)
  const { data: botInstances } = useSWR<WhatsAppBotInstance[]>("/api/bot/instances", fetcher)

  const campaignList = Array.isArray(campaigns) ? campaigns : []
  const workspaceList = Array.isArray(workspaces) ? workspaces : []
  const instanceList = Array.isArray(botInstances) ? botInstances : []

  const [dialogOpen, setDialogOpen] = useState(false)
  const [editId, setEditId] = useState<string | null>(null)
  const [deleteId, setDeleteId] = useState<string | null>(null)
  const [dispatchCampaign, setDispatchCampaign] = useState<Campaign | null>(null)
  const [saving, setSaving] = useState(false)
  const [form, setForm] = useState<FormState>(EMPTY_FORM)
  const [formErrors, setFormErrors] = useState<Record<string, string>>({})

  const [datasets, setDatasets] = useState<{ id: string; name: string }[]>([])
  const [loadingDatasets, setLoadingDatasets] = useState(false)

  const [tables, setTables] = useState<DatasetTable[]>([])
  const [columns, setColumns] = useState<DatasetColumn[]>([])
  const [loadingMeta, setLoadingMeta] = useState(false)

  const [uploadingImage, setUploadingImage] = useState(false)
  const fileInputRef = useRef<HTMLInputElement>(null)

  // Load datasets when workspace changes
  useEffect(() => {
    if (!form.workspace_id) { setDatasets([]); return }
    setLoadingDatasets(true)
    fetch(`/api/powerbi/datasets?workspaceId=${form.workspace_id}`)
      .then((r) => r.json())
      .then((data) => setDatasets(Array.isArray(data) ? data : []))
      .catch(() => setDatasets([]))
      .finally(() => setLoadingDatasets(false))
  }, [form.workspace_id])

  // Load metadata (tables + columns) when dataset changes
  useEffect(() => {
    if (!form.dataset_id || !form.workspace_id) { setTables([]); setColumns([]); return }
    setLoadingMeta(true)
    fetch(`/api/powerbi/metadata?datasetId=${form.dataset_id}&workspaceId=${form.workspace_id}`)
      .then((r) => r.json())
      .then((data) => {
        setTables(Array.isArray(data?.tables) ? data.tables : [])
        setColumns(Array.isArray(data?.columns) ? data.columns : [])
      })
      .catch(() => { setTables([]); setColumns([]) })
      .finally(() => setLoadingMeta(false))
  }, [form.dataset_id, form.workspace_id])

  const tableOptions = tables.filter((t) => !t.isHidden)

  const columnsForTable = (tableName: string) =>
    columns.filter((c) => c.tableName === tableName && !c.isHidden)

  const dateColumnsForTable = (tableName: string) =>
    columnsForTable(tableName).filter((c) => DATE_TYPES.includes(c.dataType))

  const allColumnsForTable = (tableName: string) => columnsForTable(tableName)

  function openCreate() {
    setEditId(null)
    setForm(EMPTY_FORM)
    setFormErrors({})
    setDialogOpen(true)
  }

  function openEdit(campaign: Campaign) {
    setEditId(campaign.id)
    const daysValue = campaign.days_inactive
    const isPreset = DAYS_OPTIONS.some((o) => o.value === daysValue && o.value !== 0)
    setForm({
      name: campaign.name,
      description: campaign.description ?? "",
      dataset_id: campaign.dataset_id,
      workspace_id: campaign.workspace_id ?? "",
      customer_table: campaign.customer_table ?? "",
      date_column: campaign.date_column ?? "",
      days_inactive: isPreset ? (daysValue ?? 30) : 0,
      days_custom: !isPreset && daysValue ? String(daysValue) : "",
      phone_column: campaign.phone_column ?? "",
      name_column: campaign.name_column ?? "",
      message_template: campaign.message_template,
      image_url: campaign.image_url ?? "",
      bot_instance_id: campaign.bot_instance_id ?? "",
      is_active: campaign.is_active,
    })
    setFormErrors({})
    setDialogOpen(true)
  }

  function setField<K extends keyof FormState>(key: K, value: FormState[K]) {
    setForm((prev) => ({ ...prev, [key]: value }))
    setFormErrors((prev) => ({ ...prev, [key]: "" }))
  }

  function validate() {
    const errors: Record<string, string> = {}
    if (!form.name.trim()) errors.name = "Nome obrigatorio"
    if (!form.bot_instance_id) errors.bot_instance_id = "Selecione o WhatsApp de envio"
    if (!form.dataset_id.trim()) errors.dataset_id = "Selecione um dataset"
    if (!form.customer_table.trim()) errors.customer_table = "Selecione a tabela de clientes"
    if (!form.date_column.trim()) errors.date_column = "Selecione a coluna de data"
    if (!form.phone_column.trim()) errors.phone_column = "Selecione a coluna de telefone"
    if (!form.name_column.trim()) errors.name_column = "Selecione a coluna de nome"
    if (!form.message_template.trim()) errors.message_template = "Template de mensagem obrigatorio"
    const days = getDaysValue(form)
    if (!days) errors.days = "Informe quantos dias de inatividade"
    setFormErrors(errors)
    return Object.keys(errors).length === 0
  }

  async function handleImageUpload(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0]
    if (!file) return
    setUploadingImage(true)
    try {
      const formData = new FormData()
      formData.append("file", file)
      const { response, data } = await fetchApi("/api/campaigns/image", { method: "POST", body: formData })
      if (!response.ok) throw new Error(extractError(data) || "Erro no upload")
      const url = (data as { url?: string })?.url ?? ""
      setField("image_url", url)
      toast.success("Imagem enviada!")
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Erro ao enviar imagem")
    } finally {
      setUploadingImage(false)
      if (fileInputRef.current) fileInputRef.current.value = ""
    }
  }

  async function handleSave() {
    if (!validate()) return
    setSaving(true)
    try {
      const days = getDaysValue(form)
      const payload = {
        ...(editId ? { id: editId } : {}),
        name: form.name.trim(),
        description: form.description.trim() || null,
        dataset_id: form.dataset_id.trim(),
        workspace_id: form.workspace_id.trim() || null,
        customer_table: form.customer_table.trim() || null,
        date_column: form.date_column.trim() || null,
        days_inactive: days,
        phone_column: form.phone_column.trim() || null,
        name_column: form.name_column.trim() || null,
        message_template: form.message_template.trim(),
        image_url: form.image_url.trim() || null,
        bot_instance_id: form.bot_instance_id || null,
        is_active: form.is_active,
      }
      const { response, data } = await fetchApi("/api/campaigns", {
        method: editId ? "PUT" : "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      })
      if (!response.ok) throw new Error(extractError(data) || "Erro ao salvar")
      toast.success(editId ? "Campanha atualizada!" : "Campanha criada!")
      setDialogOpen(false)
      void mutate("/api/campaigns")
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Erro ao salvar campanha")
    } finally {
      setSaving(false)
    }
  }

  async function handleDelete() {
    if (!deleteId) return
    try {
      const { response, data } = await fetchApi(`/api/campaigns?id=${deleteId}`, { method: "DELETE" })
      if (!response.ok) throw new Error(extractError(data) || "Erro ao excluir")
      toast.success("Campanha excluida!")
      void mutate("/api/campaigns")
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Erro ao excluir")
    } finally {
      setDeleteId(null)
    }
  }

  async function handleToggle(campaign: Campaign) {
    try {
      const { response, data } = await fetchApi("/api/campaigns", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ id: campaign.id, is_active: !campaign.is_active }),
      })
      if (!response.ok) throw new Error(extractError(data) || "Erro ao atualizar")
      void mutate("/api/campaigns")
    } catch {
      void mutate("/api/campaigns")
    }
  }

  function describeCampaign(campaign: Campaign): string {
    const days = campaign.days_inactive
    if (!days) return campaign.description ?? ""
    return `Clientes sem compra ha ${days} dias`
  }

  return (
    <div className="flex flex-1 flex-col">
      <PageHeader title="Campanhas" description="Disparo de mensagens para clientes inativos">
        <Button onClick={openCreate} size="sm">
          <Plus className="mr-1 size-4" />
          Nova Campanha
        </Button>
      </PageHeader>

      <div className="flex flex-1 flex-col gap-4 p-4 sm:p-6">
        <Card>
          <CardContent className="p-0">
            {isLoading ? (
              <div className="space-y-3 p-6">
                {Array.from({ length: 3 }).map((_, i) => (
                  <Skeleton key={i} className="h-12 rounded" />
                ))}
              </div>
            ) : campaignList.length === 0 ? (
              <div className="flex flex-col items-center gap-4 py-12">
                <Megaphone className="size-12 text-muted-foreground" />
                <div className="text-center">
                  <p className="font-medium">Nenhuma campanha criada</p>
                  <p className="text-sm text-muted-foreground">
                    Crie uma campanha para enviar mensagens a clientes inativos.
                  </p>
                </div>
                <Button onClick={openCreate} size="sm">
                  <Plus className="mr-1 size-4" /> Nova Campanha
                </Button>
              </div>
            ) : (
              <div className="overflow-x-auto">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Campanha</TableHead>
                      <TableHead className="hidden sm:table-cell">Filtro</TableHead>
                      <TableHead className="hidden md:table-cell">Ultimo disparo</TableHead>
                      <TableHead>Ativo</TableHead>
                      <TableHead className="text-right">Acoes</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {campaignList.map((campaign) => (
                      <TableRow key={campaign.id}>
                        <TableCell>
                          <div className="flex items-center gap-2">
                            {campaign.image_url && (
                              <img
                                src={campaign.image_url}
                                alt=""
                                className="size-8 shrink-0 rounded object-cover"
                              />
                            )}
                            <div>
                              <p className="font-medium">{campaign.name}</p>
                              <p className="text-xs text-muted-foreground">{describeCampaign(campaign)}</p>
                            </div>
                          </div>
                        </TableCell>
                        <TableCell className="hidden sm:table-cell">
                          {campaign.days_inactive ? (
                            <Badge variant="secondary" className="gap-1">
                              <Clock className="size-3" />
                              {campaign.days_inactive} dias
                            </Badge>
                          ) : (
                            <span className="text-xs text-muted-foreground">—</span>
                          )}
                        </TableCell>
                        <TableCell className="hidden md:table-cell text-sm text-muted-foreground">
                          {formatDate(campaign.last_run_at)}
                        </TableCell>
                        <TableCell>
                          <Switch checked={campaign.is_active} onCheckedChange={() => handleToggle(campaign)} />
                        </TableCell>
                        <TableCell className="text-right">
                          <div className="flex items-center justify-end gap-1">
                            <Button
                              variant="ghost"
                              size="icon"
                              onClick={() => setDispatchCampaign(campaign)}
                              title="Disparar"
                            >
                              <Play className="size-4" />
                              <span className="sr-only">Disparar</span>
                            </Button>
                            <Button variant="ghost" size="icon" onClick={() => openEdit(campaign)} title="Editar">
                              <Pencil className="size-4" />
                              <span className="sr-only">Editar</span>
                            </Button>
                            <Button variant="ghost" size="icon" onClick={() => setDeleteId(campaign.id)} title="Excluir">
                              <Trash2 className="size-4 text-destructive" />
                              <span className="sr-only">Excluir</span>
                            </Button>
                          </div>
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </div>
            )}
          </CardContent>
        </Card>
      </div>

      {/* Dialog criar/editar */}
      <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
        <DialogContent className="max-h-[90vh] overflow-y-auto sm:max-w-xl">
          <DialogHeader>
            <DialogTitle>{editId ? "Editar Campanha" : "Nova Campanha"}</DialogTitle>
            <DialogDescription>
              Configure quais clientes receberao a mensagem e o que sera enviado.
            </DialogDescription>
          </DialogHeader>

          <div className="flex flex-col gap-5 pt-2">

            {/* Nome */}
            <div className="flex flex-col gap-2">
              <Label>Nome da Campanha</Label>
              <Input
                value={form.name}
                onChange={(e) => setField("name", e.target.value)}
                placeholder="Ex: Reativacao 30 dias"
                className={formErrors.name ? "border-destructive" : ""}
              />
              {formErrors.name && <p className="text-xs text-destructive">{formErrors.name}</p>}
            </div>

            {/* WhatsApp */}
            <div className="flex flex-col gap-2">
              <Label>WhatsApp de Envio</Label>
              <Select value={form.bot_instance_id} onValueChange={(v) => setField("bot_instance_id", v)}>
                <SelectTrigger className={formErrors.bot_instance_id ? "border-destructive" : ""}>
                  <SelectValue placeholder="Selecionar numero de WhatsApp" />
                </SelectTrigger>
                <SelectContent>
                  <SelectGroup>
                    <SelectLabel>WhatsApps conectados</SelectLabel>
                    {instanceList.map((inst) => (
                      <SelectItem key={inst.id} value={inst.id}>{inst.name}</SelectItem>
                    ))}
                  </SelectGroup>
                </SelectContent>
              </Select>
              {formErrors.bot_instance_id && <p className="text-xs text-destructive">{formErrors.bot_instance_id}</p>}
            </div>

            {/* Separador visual */}
            <div className="rounded-lg border p-4 flex flex-col gap-4">
              <p className="text-sm font-semibold">Quais clientes vao receber?</p>

              {/* Workspace */}
              <div className="flex flex-col gap-2">
                <Label>Workspace</Label>
                <Select
                  value={form.workspace_id}
                  onValueChange={(v) => {
                    setField("workspace_id", v)
                    setField("dataset_id", "")
                    setField("customer_table", "")
                    setField("date_column", "")
                    setField("phone_column", "")
                    setField("name_column", "")
                  }}
                >
                  <SelectTrigger>
                    <SelectValue placeholder="Selecionar workspace" />
                  </SelectTrigger>
                  <SelectContent>
                    {workspaceList.map((ws) => (
                      <SelectItem key={ws.id} value={ws.pbi_workspace_id}>{ws.name}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>

              {/* Dataset */}
              <div className="flex flex-col gap-2">
                <Label>Dataset</Label>
                <Select
                  value={form.dataset_id}
                  onValueChange={(v) => {
                    setField("dataset_id", v)
                    setField("customer_table", "")
                    setField("date_column", "")
                    setField("phone_column", "")
                    setField("name_column", "")
                  }}
                  disabled={!form.workspace_id || loadingDatasets}
                >
                  <SelectTrigger className={formErrors.dataset_id ? "border-destructive" : ""}>
                    <SelectValue placeholder={loadingDatasets ? "Carregando datasets..." : "Selecionar dataset"} />
                  </SelectTrigger>
                  <SelectContent>
                    {datasets.map((ds) => (
                      <SelectItem key={ds.id} value={ds.id}>{ds.name}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
                {formErrors.dataset_id && <p className="text-xs text-destructive">{formErrors.dataset_id}</p>}
              </div>

              {/* Tabela de clientes */}
              <div className="flex flex-col gap-2">
                <Label>Tabela de clientes</Label>
                <ColumnSelect
                  columns={tableOptions.map((t) => t.name)}
                  value={form.customer_table}
                  onChange={(v) => {
                    setField("customer_table", v)
                    setField("date_column", "")
                    setField("phone_column", "")
                    setField("name_column", "")
                  }}
                  placeholder={loadingMeta ? "Carregando tabelas..." : "Buscar tabela..."}
                  disabled={!form.dataset_id || loadingMeta}
                  error={!!formErrors.customer_table}
                />
                {formErrors.customer_table && <p className="text-xs text-destructive">{formErrors.customer_table}</p>}
              </div>

              {/* Coluna de data da ultima compra */}
              <div className="flex flex-col gap-2">
                <Label>Coluna da ultima compra</Label>
                <ColumnSelect
                  columns={(dateColumnsForTable(form.customer_table).length > 0
                    ? dateColumnsForTable(form.customer_table)
                    : allColumnsForTable(form.customer_table)
                  ).map((c) => c.columnName)}
                  value={form.date_column}
                  onChange={(v) => setField("date_column", v)}
                  placeholder="Buscar coluna de data..."
                  disabled={!form.customer_table}
                  error={!!formErrors.date_column}
                />
                {formErrors.date_column && <p className="text-xs text-destructive">{formErrors.date_column}</p>}
              </div>

              {/* Dias de inatividade */}
              <div className="flex flex-col gap-2">
                <Label>Clientes sem compra ha quantos dias?</Label>
                <div className="flex flex-wrap gap-2">
                  {DAYS_OPTIONS.map((opt) => (
                    <button
                      key={opt.value}
                      type="button"
                      onClick={() => setField("days_inactive", opt.value)}
                      className={`rounded-full border px-4 py-1.5 text-sm font-medium transition-colors ${
                        form.days_inactive === opt.value
                          ? "border-primary bg-primary text-primary-foreground"
                          : "border-border bg-background hover:bg-accent"
                      }`}
                    >
                      {opt.label}
                    </button>
                  ))}
                </div>
                {form.days_inactive === 0 && (
                  <Input
                    type="number"
                    min={1}
                    value={form.days_custom}
                    onChange={(e) => setField("days_custom", e.target.value)}
                    placeholder="Ex: 45"
                    className="w-32"
                  />
                )}
                {formErrors.days && <p className="text-xs text-destructive">{formErrors.days}</p>}
              </div>

              {/* Colunas de nome e telefone */}
              <div className="flex flex-col gap-3">
                <div className="flex flex-col gap-2">
                  <Label>Coluna de Nome</Label>
                  <ColumnSelect
                    columns={allColumnsForTable(form.customer_table).map((c) => c.columnName)}
                    value={form.name_column}
                    onChange={(v) => setField("name_column", v)}
                    placeholder="Buscar coluna de nome..."
                    disabled={!form.customer_table}
                    error={!!formErrors.name_column}
                  />
                  {formErrors.name_column && <p className="text-xs text-destructive">{formErrors.name_column}</p>}
                </div>

                <div className="flex flex-col gap-2">
                  <Label>Coluna de Telefone</Label>
                  <ColumnSelect
                    columns={allColumnsForTable(form.customer_table).map((c) => c.columnName)}
                    value={form.phone_column}
                    onChange={(v) => setField("phone_column", v)}
                    placeholder="Buscar coluna de telefone..."
                    disabled={!form.customer_table}
                    error={!!formErrors.phone_column}
                  />
                  {formErrors.phone_column && <p className="text-xs text-destructive">{formErrors.phone_column}</p>}
                </div>
              </div>
            </div>

            {/* Template de mensagem */}
            <div className="flex flex-col gap-2">
              <Label>Mensagem</Label>
              <Textarea
                value={form.message_template}
                onChange={(e) => setField("message_template", e.target.value)}
                placeholder="Use {{NomeColuna}} para inserir valores. Ex: Ola {{NomeCliente}}!"
                rows={4}
                className={formErrors.message_template ? "border-destructive" : ""}
              />
              {formErrors.message_template ? (
                <p className="text-xs text-destructive">{formErrors.message_template}</p>
              ) : (
                <p className="text-xs text-muted-foreground">
                  Use {"{{NomeColuna}}"} para valores dinamicos. Ex: {"{{" + (form.name_column || "NomeCliente") + "}}"}
                </p>
              )}
            </div>

            {/* Upload de imagem */}
            <div className="flex flex-col gap-2">
              <Label>
                Imagem <span className="text-xs text-muted-foreground">(opcional — enviada com a mensagem)</span>
              </Label>
              {form.image_url ? (
                <div className="flex items-start gap-3 rounded-lg border p-3">
                  <img src={form.image_url} alt="Preview" className="h-20 w-20 shrink-0 rounded object-cover" />
                  <div className="flex flex-1 flex-col gap-2">
                    <p className="text-xs text-muted-foreground">Imagem sera enviada junto com a mensagem.</p>
                    <Button
                      type="button"
                      variant="outline"
                      size="sm"
                      className="w-fit gap-1.5 text-xs text-destructive hover:text-destructive"
                      onClick={() => setField("image_url", "")}
                    >
                      <X className="size-3.5" /> Remover
                    </Button>
                  </div>
                </div>
              ) : (
                <div
                  className="flex cursor-pointer flex-col items-center gap-2 rounded-lg border border-dashed p-6 transition-colors hover:bg-muted/50"
                  onClick={() => fileInputRef.current?.click()}
                >
                  {uploadingImage
                    ? <Loader2 className="size-8 animate-spin text-muted-foreground" />
                    : <ImageIcon className="size-8 text-muted-foreground" />}
                  <p className="text-sm text-muted-foreground">
                    {uploadingImage ? "Enviando..." : "Clique para selecionar uma imagem"}
                  </p>
                  <p className="text-xs text-muted-foreground">JPG, PNG, WEBP — max 10MB</p>
                </div>
              )}
              <input
                ref={fileInputRef}
                type="file"
                accept="image/jpeg,image/jpg,image/png,image/webp,image/gif"
                className="hidden"
                onChange={handleImageUpload}
                disabled={uploadingImage}
              />
            </div>

            {/* Ativo */}
            <div className="flex items-center gap-3">
              <Switch checked={form.is_active} onCheckedChange={(v) => setField("is_active", v)} id="campaign-active" />
              <Label htmlFor="campaign-active">Campanha ativa</Label>
            </div>

            <Button onClick={handleSave} disabled={saving || uploadingImage}>
              {saving ? "Salvando..." : editId ? "Salvar alteracoes" : "Criar Campanha"}
            </Button>
          </div>
        </DialogContent>
      </Dialog>

      {/* Dialog de disparo com lista de clientes */}
      <CampaignDispatchDialog
        campaign={dispatchCampaign}
        open={!!dispatchCampaign}
        onOpenChange={(open) => { if (!open) setDispatchCampaign(null) }}
        onSuccess={() => void mutate("/api/campaigns")}
      />

      <AlertDialog open={!!deleteId} onOpenChange={() => setDeleteId(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Excluir campanha?</AlertDialogTitle>
            <AlertDialogDescription>
              Esta acao nao pode ser desfeita.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancelar</AlertDialogCancel>
            <AlertDialogAction onClick={handleDelete}>Excluir</AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  )
}
