"use client"

import { useEffect, useState } from "react"
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Checkbox } from "@/components/ui/checkbox"
import { Badge } from "@/components/ui/badge"
import { Loader2, Search, Users, Send, PhoneOff } from "lucide-react"
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
  if (phone.length === 11) return `(${phone.slice(0, 2)}) ${phone.slice(2, 7)}-${phone.slice(7)}`
  if (phone.length === 10) return `(${phone.slice(0, 2)}) ${phone.slice(2, 6)}-${phone.slice(6)}`
  return phone
}

export function CampaignDispatchDialog({ campaign, open, onOpenChange, onSuccess }: Props) {
  const [loading, setLoading] = useState(false)
  const [loadError, setLoadError] = useState("")
  const [clients, setClients] = useState<CampaignClient[]>([])
  const [selectedIndexes, setSelectedIndexes] = useState<Set<number>>(new Set())
  const [search, setSearch] = useState("")
  const [sending, setSending] = useState(false)

  useEffect(() => {
    if (!open || !campaign) return
    setLoading(true)
    setLoadError("")
    setClients([])
    setSelectedIndexes(new Set())
    setSearch("")

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
        const result = data as { clients?: CampaignClient[] }
        const list = result.clients ?? []
        setClients(list)
        // auto-select all with phone
        const withPhone = new Set(
          list.flatMap((c, i) => (c.phone ? [i] : []))
        )
        setSelectedIndexes(withPhone)
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

  const clientsWithPhone = clients.filter((c) => c.phone)
  const allWithPhoneSelected =
    clientsWithPhone.length > 0 &&
    clientsWithPhone.every((_, i) => {
      const orig = clients.findIndex((c) => c === clientsWithPhone[i])
      return selectedIndexes.has(orig)
    })

  function toggleIndex(i: number) {
    setSelectedIndexes((prev) => {
      const next = new Set(prev)
      if (next.has(i)) next.delete(i)
      else next.add(i)
      return next
    })
  }

  function selectAll() {
    const withPhone = new Set(clients.flatMap((c, i) => (c.phone ? [i] : [])))
    setSelectedIndexes(withPhone)
  }

  function deselectAll() {
    setSelectedIndexes(new Set())
  }

  async function handleSend() {
    if (!campaign) return
    const selected = clients.filter((_, i) => selectedIndexes.has(i))
    if (selected.length === 0) {
      toast.error("Selecione ao menos um cliente para enviar")
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

  const selectedCount = selectedIndexes.size

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="flex max-h-[90vh] flex-col sm:max-w-xl">
        <DialogHeader className="shrink-0">
          <DialogTitle>Disparar — {campaign.name}</DialogTitle>
          <DialogDescription>
            Selecione os clientes que vao receber a mensagem.
          </DialogDescription>
        </DialogHeader>

        {/* Imagem + mensagem preview */}
        {(campaign.image_url || campaign.message_template) && (
          <div className="shrink-0 rounded-lg border bg-muted/30 p-3 text-sm">
            {campaign.image_url && (
              <img
                src={campaign.image_url}
                alt="Imagem da campanha"
                className="mb-2 max-h-32 w-auto rounded object-contain"
              />
            )}
            <p className="whitespace-pre-wrap text-muted-foreground">{campaign.message_template}</p>
          </div>
        )}

        {loading && (
          <div className="flex flex-1 items-center justify-center gap-2 py-8">
            <Loader2 className="size-5 animate-spin text-muted-foreground" />
            <span className="text-sm text-muted-foreground">Buscando clientes...</span>
          </div>
        )}

        {loadError && !loading && (
          <p className="rounded-md border border-destructive/30 bg-destructive/10 px-3 py-2 text-sm text-destructive">
            {loadError}
          </p>
        )}

        {!loading && !loadError && clients.length > 0 && (
          <>
            {/* Controles de selecao */}
            <div className="shrink-0 flex items-center justify-between gap-3">
              <div className="flex items-center gap-2">
                <Users className="size-4 text-muted-foreground" />
                <span className="text-sm text-muted-foreground">
                  {clients.length} cliente{clients.length !== 1 ? "s" : ""}
                  {" · "}
                  <span className="font-medium text-foreground">{selectedCount} selecionado{selectedCount !== 1 ? "s" : ""}</span>
                </span>
              </div>
              <div className="flex gap-2">
                {allWithPhoneSelected ? (
                  <Button type="button" variant="outline" size="sm" className="h-8 text-xs" onClick={deselectAll}>
                    Desmarcar todos
                  </Button>
                ) : (
                  <Button type="button" variant="outline" size="sm" className="h-8 text-xs" onClick={selectAll}>
                    Selecionar com telefone ({clientsWithPhone.length})
                  </Button>
                )}
              </div>
            </div>

            {/* Busca */}
            <div className="shrink-0 relative">
              <Search className="absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
              <Input
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                placeholder="Buscar por nome ou telefone..."
                className="pl-9"
              />
            </div>

            {/* Lista de clientes */}
            <div className="min-h-0 flex-1 overflow-y-auto rounded-lg border">
              {filtered.length === 0 ? (
                <p className="px-4 py-6 text-center text-sm text-muted-foreground">
                  Nenhum cliente encontrado
                </p>
              ) : (
                <div className="divide-y">
                  {filtered.map((client) => {
                    const hasPhone = !!client.phone
                    const checked = selectedIndexes.has(client.originalIndex)

                    return (
                      <label
                        key={client.originalIndex}
                        className={`flex cursor-pointer items-center gap-3 px-4 py-3 transition-colors ${
                          hasPhone ? "hover:bg-accent" : "cursor-default opacity-50"
                        }`}
                      >
                        <Checkbox
                          checked={checked}
                          disabled={!hasPhone}
                          onCheckedChange={() => hasPhone && toggleIndex(client.originalIndex)}
                        />
                        <div className="min-w-0 flex-1">
                          <p className="truncate text-sm font-medium">
                            {client.name || "—"}
                          </p>
                          {hasPhone ? (
                            <p className="text-xs text-muted-foreground">
                              {formatPhone(client.phone)}
                            </p>
                          ) : (
                            <p className="flex items-center gap-1 text-xs text-muted-foreground">
                              <PhoneOff className="size-3" />
                              Sem telefone
                            </p>
                          )}
                        </div>
                        {hasPhone && (
                          <Badge variant={checked ? "default" : "outline"} className="shrink-0 text-xs">
                            {checked ? "Selecionado" : "Ignorar"}
                          </Badge>
                        )}
                      </label>
                    )
                  })}
                </div>
              )}
            </div>
          </>
        )}

        {!loading && !loadError && clients.length === 0 && (
          <div className="flex flex-1 flex-col items-center justify-center gap-2 py-8">
            <Users className="size-10 text-muted-foreground" />
            <p className="text-sm text-muted-foreground">Nenhum cliente retornado pela consulta</p>
          </div>
        )}

        {/* Rodape */}
        {!loading && !loadError && clients.length > 0 && (
          <div className="shrink-0 flex items-center justify-between gap-3 border-t pt-4">
            <p className="text-xs text-muted-foreground">
              {selectedCount} de {clients.length} cliente{clients.length !== 1 ? "s" : ""} selecionado{selectedCount !== 1 ? "s" : ""}
            </p>
            <Button onClick={handleSend} disabled={sending || selectedCount === 0}>
              {sending ? (
                <>
                  <Loader2 className="mr-2 size-4 animate-spin" />
                  Enviando...
                </>
              ) : (
                <>
                  <Send className="mr-2 size-4" />
                  Enviar para {selectedCount} cliente{selectedCount !== 1 ? "s" : ""}
                </>
              )}
            </Button>
          </div>
        )}
      </DialogContent>
    </Dialog>
  )
}
