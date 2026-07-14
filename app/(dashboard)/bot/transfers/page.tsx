"use client"

import { useState } from "react"
import useSWR, { mutate } from "swr"
import { ArrowLeftRight, Loader2, Pencil, Plus, Trash2 } from "lucide-react"
import { toast } from "sonner"
import { PageHeader } from "@/components/dashboard/page-header"
import { Button } from "@/components/ui/button"
import { Badge } from "@/components/ui/badge"
import { Card, CardContent } from "@/components/ui/card"
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { Switch } from "@/components/ui/switch"
import { Skeleton } from "@/components/ui/skeleton"
import { BOT_TRANSFER_TYPES, getBotTransferTypeLabel, type BotTransferType } from "@/lib/bot"

type BotTransferTarget = {
  id: string
  name: string
  type: BotTransferType
  target_value: string | null
  is_active: boolean
}

const fetcher = async (url: string) => {
  const response = await fetch(url)
  const data = await response.json()

  if (!response.ok) {
    throw new Error(data?.error || "Erro ao carregar dados")
  }

  return data
}

export default function BotTransfersPage() {
  const listKey = "/api/bot/transfers"
  const { data, isLoading, error } = useSWR<BotTransferTarget[]>(listKey, fetcher)
  const transfers = Array.isArray(data) ? data : []

  const [dialogOpen, setDialogOpen] = useState(false)
  const [editingTransfer, setEditingTransfer] = useState<BotTransferTarget | null>(null)
  const [formName, setFormName] = useState("")
  const [formType, setFormType] = useState<BotTransferType>("human")
  const [formTargetValue, setFormTargetValue] = useState("")
  const [formIsActive, setFormIsActive] = useState(true)
  const [saving, setSaving] = useState(false)
  const [deletingId, setDeletingId] = useState<string | null>(null)

  function openCreate() {
    setEditingTransfer(null)
    setFormName("")
    setFormType("human")
    setFormTargetValue("")
    setFormIsActive(true)
    setDialogOpen(true)
  }

  function openEdit(transfer: BotTransferTarget) {
    setEditingTransfer(transfer)
    setFormName(transfer.name)
    setFormType(transfer.type)
    setFormTargetValue(transfer.target_value ?? "")
    setFormIsActive(transfer.is_active)
    setDialogOpen(true)
  }

  async function handleSave() {
    setSaving(true)
    try {
      const payload = {
        name: formName,
        type: formType,
        target_value: formTargetValue || null,
        is_active: formIsActive,
      }

      const response = await fetch(
        editingTransfer ? `${listKey}/${editingTransfer.id}` : listKey,
        {
          method: editingTransfer ? "PUT" : "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(payload),
        }
      )
      const result = await response.json().catch(() => null)

      if (!response.ok) {
        const message =
          typeof result?.error === "string"
            ? result.error
            : result?.error
              ? JSON.stringify(result.error)
              : "Erro ao salvar transferencia"
        throw new Error(message)
      }

      setDialogOpen(false)
      await mutate(listKey)
      toast.success(editingTransfer ? "Transferencia atualizada." : "Transferencia criada.")
    } catch (saveError) {
      toast.error(saveError instanceof Error ? saveError.message : "Erro ao salvar transferencia")
    } finally {
      setSaving(false)
    }
  }

  async function handleDelete(transfer: BotTransferTarget) {
    setDeletingId(transfer.id)
    try {
      const response = await fetch(`${listKey}/${transfer.id}`, { method: "DELETE" })
      const result = await response.json().catch(() => null)

      if (!response.ok) {
        throw new Error(result?.error || "Erro ao remover transferencia")
      }

      await mutate(listKey)
      toast.success("Transferencia removida.")
    } catch (deleteError) {
      toast.error(deleteError instanceof Error ? deleteError.message : "Erro ao remover transferencia")
    } finally {
      setDeletingId(null)
    }
  }

  return (
    <div className="flex flex-1 flex-col">
      <PageHeader
        title="Transferencias"
        description="Configure para onde as conversas podem ser transferidas."
      >
        <Button onClick={openCreate} size="sm">
          <Plus className="mr-2 size-4" />
          Nova transferencia
        </Button>
      </PageHeader>

      <div className="p-4 sm:p-6">
        <Card>
          <CardContent className="p-0">
            {isLoading ? (
              <div className="space-y-3 p-6">
                {Array.from({ length: 3 }).map((_, index) => (
                  <Skeleton key={index} className="h-14 rounded-lg" />
                ))}
              </div>
            ) : error ? (
              <div className="p-6 text-sm text-muted-foreground">
                {error instanceof Error ? error.message : "Erro ao carregar transferencias."}
              </div>
            ) : transfers.length === 0 ? (
              <div className="p-10 text-center text-sm text-muted-foreground">
                Nenhuma transferencia cadastrada ainda.
              </div>
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="border-b bg-muted/30 text-left">
                      <th className="px-4 py-3 font-medium text-muted-foreground">Nome</th>
                      <th className="px-4 py-3 font-medium text-muted-foreground">Tipo</th>
                      <th className="px-4 py-3 font-medium text-muted-foreground">Destino</th>
                      <th className="px-4 py-3 font-medium text-muted-foreground">Status</th>
                      <th className="px-4 py-3 text-right font-medium text-muted-foreground">Acoes</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-border/60">
                    {transfers.map((transfer) => (
                      <tr key={transfer.id} className="transition-colors hover:bg-muted/20">
                        <td className="px-4 py-3 align-top">
                          <div className="flex items-start gap-3">
                            <div className="rounded-lg border bg-muted/20 p-2">
                              <ArrowLeftRight className="size-4" />
                            </div>
                            <p className="font-medium">{transfer.name}</p>
                          </div>
                        </td>
                        <td className="px-4 py-3 align-top">
                          <Badge variant="secondary">{getBotTransferTypeLabel(transfer.type)}</Badge>
                        </td>
                        <td className="px-4 py-3 align-top">{transfer.target_value || "-"}</td>
                        <td className="px-4 py-3 align-top">
                          <Badge variant={transfer.is_active ? "default" : "secondary"}>
                            {transfer.is_active ? "Ativo" : "Inativo"}
                          </Badge>
                        </td>
                        <td className="px-4 py-3 align-top">
                          <div className="flex justify-end gap-2">
                            <Button variant="outline" size="sm" onClick={() => openEdit(transfer)}>
                              <Pencil className="mr-2 size-4" />
                              Editar
                            </Button>
                            <Button
                              variant="outline"
                              size="sm"
                              onClick={() => handleDelete(transfer)}
                              disabled={deletingId === transfer.id}
                            >
                              {deletingId === transfer.id ? (
                                <Loader2 className="size-4 animate-spin" />
                              ) : (
                                <Trash2 className="size-4 text-destructive" />
                              )}
                            </Button>
                          </div>
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

      <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
        <DialogContent className="sm:max-w-lg">
          <DialogHeader>
            <DialogTitle>{editingTransfer ? "Editar transferencia" : "Nova transferencia"}</DialogTitle>
          </DialogHeader>

          <div className="grid gap-4 py-2">
            <div className="grid gap-2">
              <Label htmlFor="transfer-name">Nome</Label>
              <Input id="transfer-name" value={formName} onChange={(event) => setFormName(event.target.value)} />
            </div>

            <div className="grid gap-2">
              <Label>Tipo</Label>
              <Select value={formType} onValueChange={(value) => setFormType(value as BotTransferType)}>
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {BOT_TRANSFER_TYPES.map((type) => (
                    <SelectItem key={type} value={type}>
                      {getBotTransferTypeLabel(type)}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            <div className="grid gap-2">
              <Label htmlFor="transfer-target">Destino</Label>
              <Input
                id="transfer-target"
                value={formTargetValue}
                onChange={(event) => setFormTargetValue(event.target.value)}
                placeholder={
                  formType === "webhook"
                    ? "https://..."
                    : formType === "whatsapp"
                      ? "5511999999999"
                      : "Nome do departamento/grupo"
                }
              />
            </div>

            <div className="flex items-center gap-3">
              <Switch checked={formIsActive} onCheckedChange={setFormIsActive} />
              <span className="text-sm">{formIsActive ? "Transferencia ativa" : "Transferencia inativa"}</span>
            </div>
          </div>

          <DialogFooter>
            <Button variant="outline" onClick={() => setDialogOpen(false)} disabled={saving}>
              Cancelar
            </Button>
            <Button onClick={handleSave} disabled={saving || !formName.trim()}>
              {saving ? <Loader2 className="mr-2 size-4 animate-spin" /> : null}
              {editingTransfer ? "Salvar" : "Criar"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  )
}
