"use client"

import { useState } from "react"
import useSWR, { mutate } from "swr"
import { Loader2, Pencil, Plus, Tags, Trash2 } from "lucide-react"
import { toast } from "sonner"
import { PageHeader } from "@/components/dashboard/page-header"
import { Button } from "@/components/ui/button"
import { Badge } from "@/components/ui/badge"
import { Card, CardContent } from "@/components/ui/card"
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Switch } from "@/components/ui/switch"
import { Textarea } from "@/components/ui/textarea"
import { Skeleton } from "@/components/ui/skeleton"

type BotKeyword = {
  id: string
  trigger: string
  response: string
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

export default function BotKeywordsPage() {
  const listKey = "/api/bot/keywords"
  const { data, isLoading, error } = useSWR<BotKeyword[]>(listKey, fetcher)
  const keywords = Array.isArray(data) ? data : []

  const [dialogOpen, setDialogOpen] = useState(false)
  const [editingKeyword, setEditingKeyword] = useState<BotKeyword | null>(null)
  const [formTrigger, setFormTrigger] = useState("")
  const [formResponse, setFormResponse] = useState("")
  const [formIsActive, setFormIsActive] = useState(true)
  const [saving, setSaving] = useState(false)
  const [deletingId, setDeletingId] = useState<string | null>(null)

  function openCreate() {
    setEditingKeyword(null)
    setFormTrigger("")
    setFormResponse("")
    setFormIsActive(true)
    setDialogOpen(true)
  }

  function openEdit(keyword: BotKeyword) {
    setEditingKeyword(keyword)
    setFormTrigger(keyword.trigger)
    setFormResponse(keyword.response)
    setFormIsActive(keyword.is_active)
    setDialogOpen(true)
  }

  async function handleSave() {
    setSaving(true)
    try {
      const payload = {
        trigger: formTrigger,
        response: formResponse,
        is_active: formIsActive,
      }

      const response = await fetch(
        editingKeyword ? `${listKey}/${editingKeyword.id}` : listKey,
        {
          method: editingKeyword ? "PUT" : "POST",
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
              : "Erro ao salvar palavra-chave"
        throw new Error(message)
      }

      setDialogOpen(false)
      await mutate(listKey)
      toast.success(editingKeyword ? "Palavra-chave atualizada." : "Palavra-chave criada.")
    } catch (saveError) {
      toast.error(saveError instanceof Error ? saveError.message : "Erro ao salvar palavra-chave")
    } finally {
      setSaving(false)
    }
  }

  async function handleDelete(keyword: BotKeyword) {
    setDeletingId(keyword.id)
    try {
      const response = await fetch(`${listKey}/${keyword.id}`, { method: "DELETE" })
      const result = await response.json().catch(() => null)

      if (!response.ok) {
        throw new Error(result?.error || "Erro ao remover palavra-chave")
      }

      await mutate(listKey)
      toast.success("Palavra-chave removida.")
    } catch (deleteError) {
      toast.error(deleteError instanceof Error ? deleteError.message : "Erro ao remover palavra-chave")
    } finally {
      setDeletingId(null)
    }
  }

  return (
    <div className="flex flex-1 flex-col">
      <PageHeader
        title="Palavras-chave"
        description="Crie gatilhos: se o cliente escrever algo, o bot responde automaticamente."
      >
        <Button onClick={openCreate} size="sm">
          <Plus className="mr-2 size-4" />
          Nova palavra-chave
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
                {error instanceof Error ? error.message : "Erro ao carregar palavras-chave."}
              </div>
            ) : keywords.length === 0 ? (
              <div className="p-10 text-center text-sm text-muted-foreground">
                Nenhuma palavra-chave cadastrada ainda.
              </div>
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="border-b bg-muted/30 text-left">
                      <th className="px-4 py-3 font-medium text-muted-foreground">Gatilho</th>
                      <th className="px-4 py-3 font-medium text-muted-foreground">Resposta</th>
                      <th className="px-4 py-3 font-medium text-muted-foreground">Status</th>
                      <th className="px-4 py-3 text-right font-medium text-muted-foreground">Acoes</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-border/60">
                    {keywords.map((keyword) => (
                      <tr key={keyword.id} className="transition-colors hover:bg-muted/20">
                        <td className="px-4 py-3 align-top">
                          <div className="flex items-start gap-3">
                            <div className="rounded-lg border bg-muted/20 p-2">
                              <Tags className="size-4" />
                            </div>
                            <p className="font-medium">{keyword.trigger}</p>
                          </div>
                        </td>
                        <td className="px-4 py-3 align-top">
                          <p className="max-w-md truncate text-muted-foreground">{keyword.response}</p>
                        </td>
                        <td className="px-4 py-3 align-top">
                          <Badge variant={keyword.is_active ? "default" : "secondary"}>
                            {keyword.is_active ? "Ativo" : "Inativo"}
                          </Badge>
                        </td>
                        <td className="px-4 py-3 align-top">
                          <div className="flex justify-end gap-2">
                            <Button variant="outline" size="sm" onClick={() => openEdit(keyword)}>
                              <Pencil className="mr-2 size-4" />
                              Editar
                            </Button>
                            <Button
                              variant="outline"
                              size="sm"
                              onClick={() => handleDelete(keyword)}
                              disabled={deletingId === keyword.id}
                            >
                              {deletingId === keyword.id ? (
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
            <DialogTitle>{editingKeyword ? "Editar palavra-chave" : "Nova palavra-chave"}</DialogTitle>
          </DialogHeader>

          <div className="grid gap-4 py-2">
            <div className="grid gap-2">
              <Label htmlFor="keyword-trigger">Se o cliente escrever</Label>
              <Input
                id="keyword-trigger"
                value={formTrigger}
                onChange={(event) => setFormTrigger(event.target.value)}
                placeholder="preco"
              />
            </div>

            <div className="grid gap-2">
              <Label htmlFor="keyword-response">Responder automaticamente</Label>
              <Textarea
                id="keyword-response"
                value={formResponse}
                onChange={(event) => setFormResponse(event.target.value)}
                rows={4}
                placeholder="Tabela de precos: ..."
              />
            </div>

            <div className="flex items-center gap-3">
              <Switch checked={formIsActive} onCheckedChange={setFormIsActive} />
              <span className="text-sm">{formIsActive ? "Gatilho ativo" : "Gatilho inativo"}</span>
            </div>
          </div>

          <DialogFooter>
            <Button variant="outline" onClick={() => setDialogOpen(false)} disabled={saving}>
              Cancelar
            </Button>
            <Button
              onClick={handleSave}
              disabled={saving || !formTrigger.trim() || !formResponse.trim()}
            >
              {saving ? <Loader2 className="mr-2 size-4 animate-spin" /> : null}
              {editingKeyword ? "Salvar" : "Criar"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  )
}
