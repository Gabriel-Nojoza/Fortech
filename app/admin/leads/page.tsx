"use client"

import { useMemo, useState } from "react"
import useSWR from "swr"
import {
  Download,
  ExternalLink,
  Loader2,
  MapPin,
  MessageCircle,
  Phone,
  Save,
  Search,
  Send,
  Star,
  Trash2,
} from "lucide-react"
import { toast } from "sonner"
import { PageHeader } from "@/components/dashboard/page-header"
import { Button } from "@/components/ui/button"
import { Badge } from "@/components/ui/badge"
import { Card, CardContent } from "@/components/ui/card"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Select, SelectContent, SelectItem, SelectLabel, SelectGroup, SelectTrigger, SelectValue } from "@/components/ui/select"
import { Skeleton } from "@/components/ui/skeleton"
import { Textarea } from "@/components/ui/textarea"
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog"
import { cn } from "@/lib/utils"
import {
  applyLeadMessageTemplate,
  GENERIC_LEAD_MESSAGE_TEMPLATES,
  LEAD_MESSAGE_TEMPLATES,
  LEAD_STATUSES,
  type LeadListItem,
  type LeadMessageTemplate,
} from "@/lib/leads"
import type { LeadClassification } from "@/lib/google-places"

function buildDefaultMessage(lead: LeadListItem) {
  return applyLeadMessageTemplate(LEAD_MESSAGE_TEMPLATES[lead.classificacao][0].content, lead.nome)
}

function buildWhatsAppUrl(telefone: string, message: string) {
  const digits = telefone.replace(/\D/g, "")
  const withCountryCode = digits.startsWith("55") ? digits : `55${digits}`
  return `https://wa.me/${withCountryCode}?text=${encodeURIComponent(message)}`
}

const fetcher = async (url: string) => {
  const response = await fetch(url)
  const data = await response.json().catch(() => null)

  if (!response.ok) {
    throw new Error(data?.error || "Erro ao buscar leads")
  }

  return data
}

type ClassificationFilter = "TODOS" | LeadClassification

const CLASSIFICATION_META: Record<
  LeadClassification,
  { label: string; badgeClass: string; chipActiveClass: string }
> = {
  "SEM SITE": {
    label: "Sem site",
    badgeClass: "border-transparent bg-red-500/15 text-red-600 dark:text-red-400",
    chipActiveClass: "border-red-500 bg-red-500/15 text-red-600 dark:text-red-400",
  },
  "SO REDE SOCIAL": {
    label: "So rede social",
    badgeClass: "border-transparent bg-amber-500/15 text-amber-600 dark:text-amber-400",
    chipActiveClass: "border-amber-500 bg-amber-500/15 text-amber-600 dark:text-amber-400",
  },
  "TEM SITE": {
    label: "Tem site",
    badgeClass: "border-transparent bg-emerald-500/15 text-emerald-600 dark:text-emerald-400",
    chipActiveClass: "border-emerald-500 bg-emerald-500/15 text-emerald-600 dark:text-emerald-400",
  },
}

function escapeCsvCell(value: unknown) {
  return `"${String(value ?? "").replace(/"/g, '""')}"`
}

function buildLeadsCsv(leads: LeadListItem[]) {
  const headers = [
    "Nome",
    "Classificacao",
    "Telefone",
    "Endereco",
    "Avaliacao",
    "Num. avaliacoes",
    "Site",
    "Link Maps",
    "Status",
  ]

  const rows = leads.map((lead) =>
    [
      lead.nome,
      CLASSIFICATION_META[lead.classificacao].label,
      lead.telefone ?? "",
      lead.endereco ?? "",
      lead.avaliacao ?? "",
      lead.num_avaliacoes ?? "",
      lead.site ?? "",
      lead.link_maps ?? "",
      lead.status,
    ]
      .map(escapeCsvCell)
      .join(",")
  )

  return [headers.map(escapeCsvCell).join(","), ...rows].join("\n")
}

function downloadCsv(csv: string, fileName: string) {
  const blob = new Blob([`﻿${csv}`], { type: "text/csv;charset=utf-8;" })
  const url = URL.createObjectURL(blob)
  const link = document.createElement("a")
  link.href = url
  link.download = fileName
  document.body.appendChild(link)
  link.click()
  document.body.removeChild(link)
  URL.revokeObjectURL(url)
}

export default function AdminLeadsPage() {
  const [nichoInput, setNichoInput] = useState("")
  const [cidadeInput, setCidadeInput] = useState("")
  const [maxInput, setMaxInput] = useState("60")
  const [submittedQuery, setSubmittedQuery] = useState<{ nicho: string; cidade: string; max: string } | null>(null)
  const [classificationFilter, setClassificationFilter] = useState<ClassificationFilter>("TODOS")
  const [updatingId, setUpdatingId] = useState<string | null>(null)
  const [messageLead, setMessageLead] = useState<LeadListItem | null>(null)
  const [messageText, setMessageText] = useState("")
  const [templateValue, setTemplateValue] = useState("")
  const [newTemplateLabel, setNewTemplateLabel] = useState("")
  const [savingTemplate, setSavingTemplate] = useState(false)

  const {
    data: customTemplates,
    mutate: mutateTemplates,
  } = useSWR<LeadMessageTemplate[]>("/api/leads/message-templates", fetcher)
  const customTemplateList = Array.isArray(customTemplates) ? customTemplates : []

  const swrKey = submittedQuery
    ? `/api/leads?nicho=${encodeURIComponent(submittedQuery.nicho)}&cidade=${encodeURIComponent(submittedQuery.cidade)}&max=${encodeURIComponent(submittedQuery.max)}`
    : null

  const { data, isLoading, error, mutate } = useSWR<LeadListItem[]>(swrKey, fetcher)
  const leads = Array.isArray(data) ? data : []

  const counts = useMemo(() => {
    return leads.reduce(
      (acc, lead) => {
        acc[lead.classificacao] += 1
        return acc
      },
      { "SEM SITE": 0, "SO REDE SOCIAL": 0, "TEM SITE": 0 } as Record<LeadClassification, number>
    )
  }, [leads])

  const filteredLeads = useMemo(() => {
    if (classificationFilter === "TODOS") return leads
    return leads.filter((lead) => lead.classificacao === classificationFilter)
  }, [leads, classificationFilter])

  function handleSearch(event: React.FormEvent) {
    event.preventDefault()

    const nicho = nichoInput.trim()
    const cidade = cidadeInput.trim()

    if (!nicho || !cidade) {
      toast.error("Informe o nicho e a cidade para buscar.")
      return
    }

    setClassificationFilter("TODOS")
    setSubmittedQuery({ nicho, cidade, max: maxInput.trim() || "60" })
  }

  async function handleStatusChange(lead: LeadListItem, status: string) {
    setUpdatingId(lead.id)
    const previousLeads = leads

    // Atualizacao otimista para o dropdown responder na hora.
    mutate(
      previousLeads.map((item) => (item.id === lead.id ? { ...item, status } : item)),
      { revalidate: false }
    )

    try {
      const response = await fetch("/api/leads", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ id: lead.id, status }),
      })
      const result = await response.json().catch(() => null)

      if (!response.ok) {
        throw new Error(result?.error || "Erro ao atualizar status")
      }

      toast.success("Status atualizado.")
    } catch (statusError) {
      mutate(previousLeads, { revalidate: false })
      toast.error(statusError instanceof Error ? statusError.message : "Erro ao atualizar status")
    } finally {
      setUpdatingId(null)
    }
  }

  function openMessageDialog(lead: LeadListItem) {
    setMessageLead(lead)
    setMessageText(buildDefaultMessage(lead))
    setTemplateValue(`builtin:${LEAD_MESSAGE_TEMPLATES[lead.classificacao][0].id}`)
    setNewTemplateLabel("")
  }

  function handleSelectTemplate(value: string) {
    if (!messageLead) return
    setTemplateValue(value)

    const [kind, id] = value.split(":")
    const template =
      kind === "custom"
        ? customTemplateList.find((item) => item.id === id)
        : [...LEAD_MESSAGE_TEMPLATES[messageLead.classificacao], ...GENERIC_LEAD_MESSAGE_TEMPLATES].find(
            (item) => item.id === id
          )

    if (template) {
      setMessageText(applyLeadMessageTemplate(template.content, messageLead.nome))
    }
  }

  async function handleSaveTemplate() {
    const label = newTemplateLabel.trim()
    const content = messageText.trim()

    if (!label || !content) {
      toast.error("Informe um nome e uma mensagem para salvar o modelo.")
      return
    }

    setSavingTemplate(true)
    try {
      const response = await fetch("/api/leads/message-templates", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ label, content }),
      })
      const result = await response.json().catch(() => null)

      if (!response.ok) {
        throw new Error(result?.error || "Erro ao salvar modelo")
      }

      await mutateTemplates()
      setTemplateValue(`custom:${result.id}`)
      setNewTemplateLabel("")
      toast.success("Modelo salvo.")
    } catch (saveError) {
      toast.error(saveError instanceof Error ? saveError.message : "Erro ao salvar modelo")
    } finally {
      setSavingTemplate(false)
    }
  }

  async function handleDeleteTemplate(id: string) {
    try {
      const response = await fetch(`/api/leads/message-templates?id=${encodeURIComponent(id)}`, {
        method: "DELETE",
      })
      const result = await response.json().catch(() => null)

      if (!response.ok) {
        throw new Error(result?.error || "Erro ao remover modelo")
      }

      await mutateTemplates()
      if (templateValue === `custom:${id}`) {
        setTemplateValue("")
      }
      toast.success("Modelo removido.")
    } catch (deleteError) {
      toast.error(deleteError instanceof Error ? deleteError.message : "Erro ao remover modelo")
    }
  }

  function handleSendMessage() {
    if (!messageLead?.telefone) return

    window.open(buildWhatsAppUrl(messageLead.telefone, messageText), "_blank", "noopener,noreferrer")

    if (messageLead.status === "Novo") {
      handleStatusChange(messageLead, "Contatado")
    }

    setMessageLead(null)
  }

  function handleExportCsv() {
    if (filteredLeads.length === 0) {
      toast.error("Nao ha leads para exportar.")
      return
    }

    const csv = buildLeadsCsv(filteredLeads)
    const fileName = `leads-${submittedQuery?.nicho ?? "busca"}-${submittedQuery?.cidade ?? ""}`
      .toLowerCase()
      .replace(/\s+/g, "-")
    downloadCsv(csv, `${fileName}.csv`)
  }

  return (
    <div className="flex flex-1 flex-col">
      <PageHeader
        title="Leads"
        description="Prospecte empresas em potencial pelo Google Places e priorize quem mais precisa de um site."
      >
        <Button variant="outline" size="sm" onClick={handleExportCsv} disabled={filteredLeads.length === 0}>
          <Download className="mr-2 size-4" />
          Exportar CSV
        </Button>
      </PageHeader>

      <div className="flex flex-col gap-4 p-4 sm:p-6">
        <Card>
          <CardContent className="pt-6">
            <form onSubmit={handleSearch} className="grid gap-4 sm:grid-cols-[1fr_1fr_120px_auto] sm:items-end">
              <div className="grid gap-2">
                <Label htmlFor="lead-nicho">Nicho</Label>
                <Input
                  id="lead-nicho"
                  placeholder="Ex: restaurante, salao de beleza"
                  value={nichoInput}
                  onChange={(event) => setNichoInput(event.target.value)}
                />
              </div>

              <div className="grid gap-2">
                <Label htmlFor="lead-cidade">Cidade</Label>
                <Input
                  id="lead-cidade"
                  placeholder="Ex: Porto Alegre"
                  value={cidadeInput}
                  onChange={(event) => setCidadeInput(event.target.value)}
                />
              </div>

              <div className="grid gap-2">
                <Label htmlFor="lead-max">Max.</Label>
                <Input
                  id="lead-max"
                  type="number"
                  min={1}
                  max={60}
                  value={maxInput}
                  onChange={(event) => setMaxInput(event.target.value)}
                />
              </div>

              <Button type="submit" disabled={isLoading}>
                {isLoading ? (
                  <Loader2 className="mr-2 size-4 animate-spin" />
                ) : (
                  <Search className="mr-2 size-4" />
                )}
                Buscar
              </Button>
            </form>
          </CardContent>
        </Card>

        {submittedQuery ? (
          <div className="flex flex-wrap gap-2">
            <button
              type="button"
              onClick={() => setClassificationFilter("TODOS")}
              className={cn(
                "rounded-full border px-3 py-1 text-xs font-medium transition-colors",
                classificationFilter === "TODOS"
                  ? "border-foreground bg-foreground/10 text-foreground"
                  : "border-border text-muted-foreground hover:bg-muted/40"
              )}
            >
              Todos ({leads.length})
            </button>
            {(Object.keys(CLASSIFICATION_META) as LeadClassification[]).map((classificacao) => (
              <button
                key={classificacao}
                type="button"
                onClick={() => setClassificationFilter(classificacao)}
                className={cn(
                  "rounded-full border px-3 py-1 text-xs font-medium transition-colors",
                  classificationFilter === classificacao
                    ? CLASSIFICATION_META[classificacao].chipActiveClass
                    : "border-border text-muted-foreground hover:bg-muted/40"
                )}
              >
                {CLASSIFICATION_META[classificacao].label} ({counts[classificacao]})
              </button>
            ))}
          </div>
        ) : null}

        <Card>
          <CardContent className="p-0">
            {!submittedQuery ? (
              <div className="p-10 text-center text-sm text-muted-foreground">
                Informe um nicho e uma cidade acima para comecar a prospeccao.
              </div>
            ) : isLoading ? (
              <div className="space-y-3 p-6">
                {Array.from({ length: 6 }).map((_, index) => (
                  <Skeleton key={index} className="h-14 rounded-lg" />
                ))}
              </div>
            ) : error ? (
              <div className="p-6 text-sm text-muted-foreground">
                {error instanceof Error ? error.message : "Erro ao carregar leads."}
              </div>
            ) : filteredLeads.length === 0 ? (
              <div className="p-10 text-center text-sm text-muted-foreground">
                Nenhum lead encontrado para essa busca.
              </div>
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="border-b bg-muted/30 text-left">
                      <th className="px-4 py-3 font-medium text-muted-foreground">Empresa</th>
                      <th className="px-4 py-3 font-medium text-muted-foreground">Classificacao</th>
                      <th className="px-4 py-3 font-medium text-muted-foreground">Contato</th>
                      <th className="px-4 py-3 font-medium text-muted-foreground">Avaliacao</th>
                      <th className="px-4 py-3 font-medium text-muted-foreground">Links</th>
                      <th className="px-4 py-3 font-medium text-muted-foreground">Status</th>
                      <th className="px-4 py-3 font-medium text-muted-foreground">Acao</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-border/60">
                    {filteredLeads.map((lead) => (
                      <tr key={lead.id} className="hover:bg-muted/20 transition-colors">
                        <td className="px-4 py-3 align-top">
                          <p className="font-medium">{lead.nome}</p>
                          {lead.endereco ? (
                            <p className="mt-1 flex items-start gap-1 text-xs text-muted-foreground">
                              <MapPin className="mt-0.5 size-3 shrink-0" />
                              {lead.endereco}
                            </p>
                          ) : null}
                        </td>
                        <td className="px-4 py-3 align-top">
                          <Badge className={CLASSIFICATION_META[lead.classificacao].badgeClass}>
                            {CLASSIFICATION_META[lead.classificacao].label}
                          </Badge>
                        </td>
                        <td className="px-4 py-3 align-top">
                          {lead.telefone ? (
                            <p className="flex items-center gap-1 text-xs">
                              <Phone className="size-3" />
                              {lead.telefone}
                            </p>
                          ) : (
                            <p className="text-xs text-muted-foreground">-</p>
                          )}
                        </td>
                        <td className="px-4 py-3 align-top">
                          {lead.avaliacao ? (
                            <p className="flex items-center gap-1 text-xs">
                              <Star className="size-3 fill-amber-400 text-amber-400" />
                              {lead.avaliacao.toFixed(1)}
                              <span className="text-muted-foreground">
                                ({lead.num_avaliacoes ?? 0})
                              </span>
                            </p>
                          ) : (
                            <p className="text-xs text-muted-foreground">-</p>
                          )}
                        </td>
                        <td className="px-4 py-3 align-top">
                          <div className="flex flex-col gap-1 text-xs">
                            {lead.site ? (
                              <a
                                href={lead.site}
                                target="_blank"
                                rel="noopener noreferrer"
                                className="flex items-center gap-1 text-primary hover:underline"
                              >
                                <ExternalLink className="size-3" />
                                Site
                              </a>
                            ) : null}
                            {lead.link_maps ? (
                              <a
                                href={lead.link_maps}
                                target="_blank"
                                rel="noopener noreferrer"
                                className="flex items-center gap-1 text-primary hover:underline"
                              >
                                <MapPin className="size-3" />
                                Maps
                              </a>
                            ) : null}
                          </div>
                        </td>
                        <td className="px-4 py-3 align-top">
                          <Select
                            value={lead.status}
                            onValueChange={(value) => handleStatusChange(lead, value)}
                            disabled={updatingId === lead.id}
                          >
                            <SelectTrigger className="h-8 w-[150px]">
                              <SelectValue />
                            </SelectTrigger>
                            <SelectContent>
                              {LEAD_STATUSES.map((status) => (
                                <SelectItem key={status} value={status}>
                                  {status}
                                </SelectItem>
                              ))}
                            </SelectContent>
                          </Select>
                        </td>
                        <td className="px-4 py-3 align-top">
                          <Button
                            variant="outline"
                            size="sm"
                            disabled={!lead.telefone}
                            onClick={() => openMessageDialog(lead)}
                          >
                            <MessageCircle className="mr-2 size-4" />
                            Mensagem
                          </Button>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </CardContent>
        </Card>
      </div>

      <Dialog open={!!messageLead} onOpenChange={(open) => !open && setMessageLead(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Enviar mensagem no WhatsApp</DialogTitle>
          </DialogHeader>
          {messageLead ? (
            <div className="flex flex-col gap-4">
              <div>
                <p className="font-medium">{messageLead.nome}</p>
                {messageLead.telefone ? (
                  <p className="flex items-center gap-1 text-xs text-muted-foreground">
                    <Phone className="size-3" />
                    {messageLead.telefone}
                  </p>
                ) : null}
              </div>

              <div className="grid gap-2">
                <Label>Modelo de abordagem</Label>
                <Select value={templateValue} onValueChange={handleSelectTemplate}>
                  <SelectTrigger>
                    <SelectValue placeholder="Escolha um modelo" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectGroup>
                      <SelectLabel>
                        Sugestoes para &quot;{CLASSIFICATION_META[messageLead.classificacao].label}&quot;
                      </SelectLabel>
                      {LEAD_MESSAGE_TEMPLATES[messageLead.classificacao].map((template) => (
                        <SelectItem key={template.id} value={`builtin:${template.id}`}>
                          {template.label}
                        </SelectItem>
                      ))}
                    </SelectGroup>
                    <SelectGroup>
                      <SelectLabel>Genericos</SelectLabel>
                      {GENERIC_LEAD_MESSAGE_TEMPLATES.map((template) => (
                        <SelectItem key={template.id} value={`builtin:${template.id}`}>
                          {template.label}
                        </SelectItem>
                      ))}
                    </SelectGroup>
                    {customTemplateList.length > 0 ? (
                      <SelectGroup>
                        <SelectLabel>Meus modelos</SelectLabel>
                        {customTemplateList.map((template) => (
                          <SelectItem key={template.id} value={`custom:${template.id}`}>
                            {template.label}
                          </SelectItem>
                        ))}
                      </SelectGroup>
                    ) : null}
                  </SelectContent>
                </Select>
              </div>

              <div className="grid gap-2">
                <Label htmlFor="lead-message">Mensagem</Label>
                <Textarea
                  id="lead-message"
                  rows={5}
                  value={messageText}
                  onChange={(event) => setMessageText(event.target.value)}
                />
              </div>

              <div className="flex items-end gap-2">
                <div className="grid flex-1 gap-2">
                  <Label htmlFor="lead-template-label">Salvar mensagem atual como modelo</Label>
                  <Input
                    id="lead-template-label"
                    placeholder="Nome do modelo"
                    value={newTemplateLabel}
                    onChange={(event) => setNewTemplateLabel(event.target.value)}
                  />
                </div>
                <Button
                  type="button"
                  variant="outline"
                  onClick={handleSaveTemplate}
                  disabled={savingTemplate || !newTemplateLabel.trim() || !messageText.trim()}
                >
                  {savingTemplate ? (
                    <Loader2 className="mr-2 size-4 animate-spin" />
                  ) : (
                    <Save className="mr-2 size-4" />
                  )}
                  Salvar modelo
                </Button>
              </div>

              {customTemplateList.length > 0 ? (
                <div className="flex flex-wrap gap-2">
                  {customTemplateList.map((template) => (
                    <span
                      key={template.id}
                      className="flex items-center gap-1 rounded-full border border-border px-2 py-1 text-xs text-muted-foreground"
                    >
                      {template.label}
                      <button
                        type="button"
                        onClick={() => handleDeleteTemplate(template.id)}
                        className="text-muted-foreground hover:text-destructive"
                        aria-label={`Remover modelo ${template.label}`}
                      >
                        <Trash2 className="size-3" />
                      </button>
                    </span>
                  ))}
                </div>
              ) : null}

              <p className="text-xs text-muted-foreground">
                Ao clicar em enviar, o WhatsApp sera aberto com a mensagem pronta. O status do
                lead muda automaticamente para &quot;Contatado&quot;.
              </p>

              <div className="flex justify-end gap-2">
                <Button variant="outline" onClick={() => setMessageLead(null)}>
                  Cancelar
                </Button>
                <Button onClick={handleSendMessage} disabled={!messageText.trim()}>
                  <Send className="mr-2 size-4" />
                  Enviar
                </Button>
              </div>
            </div>
          ) : null}
        </DialogContent>
      </Dialog>
    </div>
  )
}
