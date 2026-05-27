"use client"

import { useEffect, useRef, useState } from "react"
import {
  Dialog,
  DialogContent,
} from "@/components/ui/dialog"
import { Input } from "@/components/ui/input"
import { Loader2, Users, Send, PhoneOff, Trash2, ImageIcon, MessageSquare, Clock, X } from "lucide-react"
import { toast } from "sonner"
import type { Campaign, CampaignClient } from "@/lib/types"

type Props = {
  campaign: Campaign | null
  open: boolean
  onOpenChange: (open: boolean) => void
  onSuccess: () => void
}

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

function formatPhone(phone: string | null): string {
  if (!phone) return ""
  const digits = phone.replace(/\D/g, "")
  if (digits.length === 13) return `+${digits.slice(0, 2)} ${digits.slice(2, 4)} ${digits.slice(4, 9)}-${digits.slice(9)}`
  if (digits.length === 11) return `+55 ${digits.slice(0, 2)} ${digits.slice(2, 7)}-${digits.slice(7)}`
  if (digits.length === 10) return `+55 ${digits.slice(0, 2)} ${digits.slice(2, 6)}-${digits.slice(6)}`
  return phone
}

type DispatchHistoryItem = {
  id: string
  sent_at: string
  sent_count: number
  status: string
}

export function CampaignDispatchDialog({ campaign, open, onOpenChange, onSuccess }: Props) {
  const [loading, setLoading] = useState(false)
  const [loadError, setLoadError] = useState("")
  const [clients, setClients] = useState<CampaignClient[]>([])
  const [removedIndexes, setRemovedIndexes] = useState<Set<number>>(new Set())
  const [search, setSearch] = useState("")
  const [sending, setSending] = useState(false)
  const [activeTab, setActiveTab] = useState<"mensagem" | "imagem">("mensagem")
  const [history, setHistory] = useState<DispatchHistoryItem[]>([])

  useEffect(() => {
    if (!open || !campaign) return
    setLoading(true)
    setLoadError("")
    setClients([])
    setRemovedIndexes(new Set())
    setSearch("")
    setHistory([])

    fetchApi("/api/campaigns/clients", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ campaign_id: campaign.id }),
    })
      .then(({ response, data }) => {
        if (!response.ok) {
          setLoadError(extractError(data) || "Erro ao carregar clientes")
          return
        }
        const result = data as { clients?: CampaignClient[]; history?: DispatchHistoryItem[] }
        setClients(result.clients ?? [])
        setHistory(result.history ?? [])
      })
      .catch(() => setLoadError("Erro ao carregar clientes"))
      .finally(() => setLoading(false))
  }, [open, campaign])

  if (!campaign) return null

  const filtered = clients
    .map((c, i) => ({ ...c, originalIndex: i }))
    .filter((c) => {
      const q = search.trim().toLowerCase()
      if (!q) return true
      return (
        (c.name?.toLowerCase().includes(q) ?? false) ||
        (c.phone?.includes(q) ?? false)
      )
    })

  const activeCount = clients.filter((c, i) => !removedIndexes.has(i) && c.phone).length
  const hasImage = !!campaign.image_url

  function toggleRemove(i: number) {
    setRemovedIndexes((prev) => {
      const next = new Set(prev)
      if (next.has(i)) next.delete(i)
      else next.add(i)
      return next
    })
  }

  function selectAll() {
    setRemovedIndexes(new Set())
  }

  async function handleSend() {
    if (!campaign) return
    const selected = clients.filter((c, i) => !removedIndexes.has(i) && c.phone)
    if (selected.length === 0) {
      toast.error("Nenhum contato selecionado para envio")
      return
    }

    setSending(true)
    try {
      const { response, data } = await fetchApi("/api/campaigns/run", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          campaign_id: campaign.id,
          selected_clients: selected,
        }),
      })

      if (!response.ok) throw new Error(extractError(data) || "Erro no disparo")

      const result = data as { sent?: number; skipped?: number; failed?: number }
      toast.success(
        `Disparo concluido! ${result.sent ?? 0} enviados` +
        (result.skipped ? `, ${result.skipped} sem telefone` : "") +
        (result.failed ? `, ${result.failed} com erro` : "")
      )
      onOpenChange(false)
      onSuccess()
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Erro ao disparar campanha")
    } finally {
      setSending(false)
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="flex h-[calc(100vh-2rem)] max-h-[calc(100vh-2rem)] w-[calc(100vw-2rem)] max-w-[calc(100vw-2rem)] flex-col gap-0 p-0 sm:rounded-xl overflow-hidden">

        {/* Header */}
        <div className="shrink-0 flex items-center justify-between px-6 py-4 border-b">
          <div>
            <h2 className="text-lg font-bold">Disparo de Mensagens</h2>
            <p className="text-sm text-muted-foreground">{campaign.name}</p>
          </div>
          <button
            type="button"
            onClick={() => onOpenChange(false)}
            className="rounded-md p-2 text-muted-foreground hover:bg-muted hover:text-foreground transition-colors"
          >
            <X className="size-5" />
          </button>
        </div>

        {/* Body */}
        <div className="flex flex-1 min-h-0 overflow-hidden">

          {/* ─── Coluna esquerda: mensagem / imagem ─── */}
          <div className="flex flex-col flex-1 min-w-0">

            {/* Tabs */}
            <div className="shrink-0 grid grid-cols-2 border-b">
              <button
                type="button"
                onClick={() => setActiveTab("mensagem")}
                className={`flex items-center justify-center gap-2 py-3.5 text-sm font-medium transition-colors ${
                  activeTab === "mensagem"
                    ? "bg-muted/50 text-foreground"
                    : "text-muted-foreground hover:text-foreground"
                }`}
              >
                <MessageSquare className="size-4" />
                Mensagem
              </button>
              <button
                type="button"
                onClick={() => setActiveTab("imagem")}
                className={`flex items-center justify-center gap-2 py-3.5 text-sm font-medium transition-colors ${
                  activeTab === "imagem"
                    ? "bg-muted/50 text-foreground"
                    : "text-muted-foreground hover:text-foreground"
                }`}
              >
                <ImageIcon className="size-4" />
                Imagem
              </button>
            </div>

            {/* Conteudo da tab */}
            <div className="flex-1 overflow-y-auto p-6">
              {activeTab === "mensagem" ? (
                <div className="rounded-xl border bg-muted/20 p-5">
                  <p className="whitespace-pre-wrap text-sm leading-relaxed">
                    {campaign.message_template || (
                      <span className="italic text-muted-foreground">Sem mensagem configurada</span>
                    )}
                  </p>
                </div>
              ) : (
                <div className="flex flex-col gap-4">
                  <div className="rounded-xl border bg-muted/20 p-4">
                    <p className="mb-2 text-sm font-medium">Upload de Imagem</p>
                    <p className="text-xs text-muted-foreground">
                      {hasImage ? "Imagem configurada na campanha" : "Nenhuma imagem configurada"}
                    </p>
                  </div>
                  {hasImage && (
                    <div className="flex items-center justify-center rounded-xl border bg-muted/10 p-4">
                      <img
                        src={campaign.image_url!}
                        alt="Imagem da campanha"
                        className="max-h-64 w-auto rounded-lg object-contain"
                      />
                    </div>
                  )}
                </div>
              )}
            </div>

            {/* Botão enviar */}
            <div className="shrink-0 px-6 py-4 border-t">
              <button
                type="button"
                onClick={handleSend}
                disabled={sending || activeCount === 0 || loading}
                className="flex w-full items-center justify-center gap-2 rounded-lg bg-emerald-600 py-3 text-sm font-semibold text-white transition-colors hover:bg-emerald-700 disabled:opacity-50 disabled:cursor-not-allowed"
              >
                {sending ? (
                  <>
                    <Loader2 className="size-4 animate-spin" />
                    Enviando...
                  </>
                ) : (
                  <>
                    <Send className="size-4" />
                    Enviar para {activeCount} contato{activeCount !== 1 ? "s" : ""}
                  </>
                )}
              </button>
            </div>
          </div>

          {/* ─── Coluna direita: contatos + histórico ─── */}
          <div className="flex w-80 shrink-0 flex-col border-l overflow-hidden">

            {/* Painel Contatos */}
            <div className="flex flex-col min-h-0 flex-1">

              {/* Header */}
              <div className="shrink-0 flex items-center justify-between px-4 py-3 border-b">
                <div>
                  <div className="flex items-center gap-2">
                    <Users className="size-4 text-muted-foreground" />
                    <span className="font-semibold text-sm">Contatos</span>
                    {!loading && clients.length > 0 && (
                      <span className="rounded-full bg-muted px-2 py-0.5 text-xs font-medium">
                        {activeCount}
                      </span>
                    )}
                  </div>
                  <p className="mt-0.5 text-xs text-muted-foreground">Selecione os destinatarios</p>
                </div>
              </div>

              {loading && (
                <div className="flex flex-1 items-center justify-center gap-2">
                  <Loader2 className="size-5 animate-spin text-muted-foreground" />
                  <span className="text-sm text-muted-foreground">Buscando clientes...</span>
                </div>
              )}

              {loadError && !loading && (
                <p className="m-4 rounded-md border border-destructive/30 bg-destructive/10 px-3 py-2 text-sm text-destructive">
                  {loadError}
                </p>
              )}

              {!loading && !loadError && clients.length === 0 && (
                <div className="flex flex-1 flex-col items-center justify-center gap-2 px-4 text-center">
                  <Users className="size-10 text-muted-foreground/30" />
                  <p className="text-sm text-muted-foreground">Nenhum cliente inativo encontrado</p>
                </div>
              )}

              {!loading && !loadError && clients.length > 0 && (
                <>
                  {/* Busca */}
                  <div className="shrink-0 px-3 pt-3 pb-2">
                    <Input
                      value={search}
                      onChange={(e) => setSearch(e.target.value)}
                      placeholder="Nome do contato"
                      className="h-9 text-sm mb-2"
                    />
                  </div>

                  {/* Selecionar Todos */}
                  <div className="shrink-0 px-3 pb-3">
                    <button
                      type="button"
                      onClick={selectAll}
                      className="w-full rounded-lg border border-border bg-muted/50 py-2 text-sm font-semibold transition-colors hover:bg-muted"
                    >
                      Selecionar Todos
                    </button>
                  </div>

                  {/* Lista de contatos */}
                  <div className="flex-1 overflow-y-auto divide-y divide-border/40">
                    {filtered.length === 0 ? (
                      <p className="px-4 py-6 text-center text-xs text-muted-foreground">
                        Nenhum cliente encontrado
                      </p>
                    ) : (
                      filtered.map((client) => {
                        const hasPhone = !!client.phone
                        const removed = removedIndexes.has(client.originalIndex)
                        return (
                          <div
                            key={client.originalIndex}
                            className={`flex items-center justify-between rounded-lg mx-2 my-1 px-3 py-2.5 transition-colors ${
                              removed
                                ? "opacity-40 bg-muted/10"
                                : "bg-muted/30 hover:bg-muted/50"
                            }`}
                          >
                            <div className="flex flex-col gap-0.5 min-w-0 flex-1">
                              <span className="text-sm font-bold leading-tight truncate">
                                {client.name || <span className="font-normal text-muted-foreground">Sem nome</span>}
                              </span>
                              {hasPhone ? (
                                <span className="text-xs text-muted-foreground">
                                  {formatPhone(client.phone)}
                                </span>
                              ) : (
                                <span className="flex items-center gap-1 text-xs text-muted-foreground">
                                  <PhoneOff className="size-3" />
                                  Sem telefone
                                </span>
                              )}
                            </div>
                            {hasPhone && (
                              <button
                                type="button"
                                onClick={() => toggleRemove(client.originalIndex)}
                                className="ml-2 shrink-0 text-muted-foreground/60 hover:text-destructive transition-colors"
                                title={removed ? "Restaurar" : "Remover"}
                              >
                                <Trash2 className="size-4" />
                              </button>
                            )}
                          </div>
                        )
                      })
                    )}
                  </div>

                  {/* Rodapé removidos */}
                  {removedIndexes.size > 0 && (
                    <div className="shrink-0 border-t px-3 py-2 flex items-center justify-between">
                      <span className="text-xs text-muted-foreground">
                        {removedIndexes.size} removido{removedIndexes.size !== 1 ? "s" : ""}
                      </span>
                      <button
                        type="button"
                        onClick={selectAll}
                        className="text-xs text-primary hover:underline"
                      >
                        Restaurar todos
                      </button>
                    </div>
                  )}
                </>
              )}
            </div>

            {/* ─── Histórico de Envios ─── */}
            <div className="shrink-0 border-t">
              <div className="px-4 py-3">
                <p className="font-semibold text-sm text-amber-400">Historico de Envios</p>
                <p className="text-xs text-muted-foreground">Ultimas mensagens enviadas</p>
              </div>
              {history.length === 0 ? (
                <div className="flex flex-col items-center gap-2 px-4 pb-4 pt-2">
                  <Clock className="size-8 text-muted-foreground/30" />
                  <p className="text-xs text-muted-foreground text-center">Nenhum envio realizado ainda</p>
                </div>
              ) : (
                <div className="max-h-32 overflow-y-auto divide-y divide-border/40 px-2 pb-2">
                  {history.slice(0, 5).map((h) => (
                    <div key={h.id} className="flex items-center justify-between px-2 py-1.5">
                      <span className="text-xs text-muted-foreground">
                        {new Date(h.sent_at).toLocaleDateString("pt-BR", { day: "2-digit", month: "2-digit", hour: "2-digit", minute: "2-digit" })}
                      </span>
                      <span className="text-xs font-medium">{h.sent_count} enviados</span>
                    </div>
                  ))}
                </div>
              )}
            </div>

          </div>
        </div>
      </DialogContent>
    </Dialog>
  )
}
