"use client"

import { useState } from "react"
import useSWR, { mutate } from "swr"
import { Loader2, Pencil, Plus, Reply, Trash2 } from "lucide-react"
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

type BotQuickReply = {
  id: string
  name: string
  message: string | null
  buttons: string[]
  list_items: string[]
  file_url: string | null
  image_url: string | null
  audio_url: string | null
  video_url: string | null
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

function linesToArray(value: string) {
  return value
    .split("\n")
    .map((line) => line.trim())
    .filter(Boolean)
}

export default function BotQuickRepliesPage() {
  const listKey = "/api/bot/quick-replies"
  const { data, isLoading, error } = useSWR<BotQuickReply[]>(listKey, fetcher)
  const replies = Array.isArray(data) ? data : []

  const [dialogOpen, setDialogOpen] = useState(false)
  const [editingReply, setEditingReply] = useState<BotQuickReply | null>(null)
  const [formName, setFormName] = useState("")
  const [formMessage, setFormMessage] = useState("")
  const [formButtons, setFormButtons] = useState("")
  const [formListItems, setFormListItems] = useState("")
  const [formFileUrl, setFormFileUrl] = useState("")
  const [formImageUrl, setFormImageUrl] = useState("")
  const [formAudioUrl, setFormAudioUrl] = useState("")
  const [formVideoUrl, setFormVideoUrl] = useState("")
  const [formIsActive, setFormIsActive] = useState(true)
  const [saving, setSaving] = useState(false)
  const [deletingId, setDeletingId] = useState<string | null>(null)

  function openCreate() {
    setEditingReply(null)
    setFormName("")
    setFormMessage("")
    setFormButtons("")
    setFormListItems("")
    setFormFileUrl("")
    setFormImageUrl("")
    setFormAudioUrl("")
    setFormVideoUrl("")
    setFormIsActive(true)
    setDialogOpen(true)
  }

  function openEdit(reply: BotQuickReply) {
    setEditingReply(reply)
    setFormName(reply.name)
    setFormMessage(reply.message ?? "")
    setFormButtons(reply.buttons.join("\n"))
    setFormListItems(reply.list_items.join("\n"))
    setFormFileUrl(reply.file_url ?? "")
    setFormImageUrl(reply.image_url ?? "")
    setFormAudioUrl(reply.audio_url ?? "")
    setFormVideoUrl(reply.video_url ?? "")
    setFormIsActive(reply.is_active)
    setDialogOpen(true)
  }

  async function handleSave() {
    setSaving(true)
    try {
      const payload = {
        name: formName,
        message: formMessage || null,
        buttons: linesToArray(formButtons),
        list_items: linesToArray(formListItems),
        file_url: formFileUrl || null,
        image_url: formImageUrl || null,
        audio_url: formAudioUrl || null,
        video_url: formVideoUrl || null,
        is_active: formIsActive,
      }

      const response = await fetch(
        editingReply ? `${listKey}/${editingReply.id}` : listKey,
        {
          method: editingReply ? "PUT" : "POST",
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
              : "Erro ao salvar resposta"
        throw new Error(message)
      }

      setDialogOpen(false)
      await mutate(listKey)
      toast.success(editingReply ? "Resposta atualizada." : "Resposta criada.")
    } catch (saveError) {
      toast.error(saveError instanceof Error ? saveError.message : "Erro ao salvar resposta")
    } finally {
      setSaving(false)
    }
  }

  async function handleDelete(reply: BotQuickReply) {
    setDeletingId(reply.id)
    try {
      const response = await fetch(`${listKey}/${reply.id}`, { method: "DELETE" })
      const result = await response.json().catch(() => null)

      if (!response.ok) {
        throw new Error(result?.error || "Erro ao remover resposta")
      }

      await mutate(listKey)
      toast.success("Resposta removida.")
    } catch (deleteError) {
      toast.error(deleteError instanceof Error ? deleteError.message : "Erro ao remover resposta")
    } finally {
      setDeletingId(null)
    }
  }

  return (
    <div className="flex flex-1 flex-col">
      <PageHeader title="Respostas" description="Cadastre respostas rapidas com texto, botoes, lista ou midia.">
        <Button onClick={openCreate} size="sm">
          <Plus className="mr-2 size-4" />
          Nova resposta
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
                {error instanceof Error ? error.message : "Erro ao carregar respostas."}
              </div>
            ) : replies.length === 0 ? (
              <div className="p-10 text-center text-sm text-muted-foreground">
                Nenhuma resposta cadastrada ainda.
              </div>
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="border-b bg-muted/30 text-left">
                      <th className="px-4 py-3 font-medium text-muted-foreground">Nome</th>
                      <th className="px-4 py-3 font-medium text-muted-foreground">Conteudo</th>
                      <th className="px-4 py-3 font-medium text-muted-foreground">Status</th>
                      <th className="px-4 py-3 text-right font-medium text-muted-foreground">Acoes</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-border/60">
                    {replies.map((reply) => (
                      <tr key={reply.id} className="transition-colors hover:bg-muted/20">
                        <td className="px-4 py-3 align-top">
                          <div className="flex items-start gap-3">
                            <div className="rounded-lg border bg-muted/20 p-2">
                              <Reply className="size-4" />
                            </div>
                            <p className="font-medium">{reply.name}</p>
                          </div>
                        </td>
                        <td className="px-4 py-3 align-top">
                          <div className="flex flex-wrap gap-1">
                            {reply.message ? (
                              <Badge variant="secondary" className="text-xs">Texto</Badge>
                            ) : null}
                            {reply.buttons.length > 0 ? (
                              <Badge variant="secondary" className="text-xs">
                                {reply.buttons.length} botoes
                              </Badge>
                            ) : null}
                            {reply.list_items.length > 0 ? (
                              <Badge variant="secondary" className="text-xs">Lista</Badge>
                            ) : null}
                            {reply.image_url ? (
                              <Badge variant="secondary" className="text-xs">Imagem</Badge>
                            ) : null}
                            {reply.audio_url ? (
                              <Badge variant="secondary" className="text-xs">Audio</Badge>
                            ) : null}
                            {reply.video_url ? (
                              <Badge variant="secondary" className="text-xs">Video</Badge>
                            ) : null}
                            {reply.file_url ? (
                              <Badge variant="secondary" className="text-xs">Arquivo</Badge>
                            ) : null}
                          </div>
                        </td>
                        <td className="px-4 py-3 align-top">
                          <Badge variant={reply.is_active ? "default" : "secondary"}>
                            {reply.is_active ? "Ativo" : "Inativo"}
                          </Badge>
                        </td>
                        <td className="px-4 py-3 align-top">
                          <div className="flex justify-end gap-2">
                            <Button variant="outline" size="sm" onClick={() => openEdit(reply)}>
                              <Pencil className="mr-2 size-4" />
                              Editar
                            </Button>
                            <Button
                              variant="outline"
                              size="sm"
                              onClick={() => handleDelete(reply)}
                              disabled={deletingId === reply.id}
                            >
                              {deletingId === reply.id ? (
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
            <DialogTitle>{editingReply ? "Editar resposta" : "Nova resposta"}</DialogTitle>
          </DialogHeader>

          <div className="grid max-h-[70vh] gap-4 overflow-y-auto py-2 pr-1">
            <div className="grid gap-2">
              <Label htmlFor="reply-name">Nome</Label>
              <Input id="reply-name" value={formName} onChange={(event) => setFormName(event.target.value)} />
            </div>

            <div className="grid gap-2">
              <Label htmlFor="reply-message">Mensagem</Label>
              <Textarea
                id="reply-message"
                value={formMessage}
                onChange={(event) => setFormMessage(event.target.value)}
                rows={4}
              />
            </div>

            <div className="grid gap-4 sm:grid-cols-2">
              <div className="grid gap-2">
                <Label htmlFor="reply-buttons">Botoes (um por linha)</Label>
                <Textarea
                  id="reply-buttons"
                  value={formButtons}
                  onChange={(event) => setFormButtons(event.target.value)}
                  rows={3}
                  placeholder={"Sim\nNao"}
                />
              </div>

              <div className="grid gap-2">
                <Label htmlFor="reply-list">Itens de lista (um por linha)</Label>
                <Textarea
                  id="reply-list"
                  value={formListItems}
                  onChange={(event) => setFormListItems(event.target.value)}
                  rows={3}
                />
              </div>
            </div>

            <div className="grid gap-4 sm:grid-cols-2">
              <div className="grid gap-2">
                <Label htmlFor="reply-image">URL da imagem</Label>
                <Input id="reply-image" value={formImageUrl} onChange={(event) => setFormImageUrl(event.target.value)} />
              </div>
              <div className="grid gap-2">
                <Label htmlFor="reply-audio">URL do audio</Label>
                <Input id="reply-audio" value={formAudioUrl} onChange={(event) => setFormAudioUrl(event.target.value)} />
              </div>
              <div className="grid gap-2">
                <Label htmlFor="reply-video">URL do video</Label>
                <Input id="reply-video" value={formVideoUrl} onChange={(event) => setFormVideoUrl(event.target.value)} />
              </div>
              <div className="grid gap-2">
                <Label htmlFor="reply-file">URL do arquivo</Label>
                <Input id="reply-file" value={formFileUrl} onChange={(event) => setFormFileUrl(event.target.value)} />
              </div>
            </div>

            <div className="flex items-center gap-3">
              <Switch checked={formIsActive} onCheckedChange={setFormIsActive} />
              <span className="text-sm">{formIsActive ? "Resposta ativa" : "Resposta inativa"}</span>
            </div>
          </div>

          <DialogFooter>
            <Button variant="outline" onClick={() => setDialogOpen(false)} disabled={saving}>
              Cancelar
            </Button>
            <Button onClick={handleSave} disabled={saving || !formName.trim()}>
              {saving ? <Loader2 className="mr-2 size-4 animate-spin" /> : null}
              {editingReply ? "Salvar" : "Criar"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  )
}
