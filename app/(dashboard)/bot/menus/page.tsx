"use client"

import { useState } from "react"
import Link from "next/link"
import useSWR, { mutate } from "swr"
import { ListTree, Loader2, Pencil, Plus, Trash2 } from "lucide-react"
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

type BotMenu = {
  id: string
  name: string
  prompt_text: string
  is_root: boolean
  is_active: boolean
  bot_menu_options: { count: number }[]
}

const fetcher = async (url: string) => {
  const response = await fetch(url)
  const data = await response.json()

  if (!response.ok) {
    throw new Error(data?.error || "Erro ao carregar dados")
  }

  return data
}

export default function BotMenusPage() {
  const listKey = "/api/bot/menus"
  const { data, isLoading, error } = useSWR<BotMenu[]>(listKey, fetcher)
  const menus = Array.isArray(data) ? data : []

  const [dialogOpen, setDialogOpen] = useState(false)
  const [formName, setFormName] = useState("")
  const [formPromptText, setFormPromptText] = useState("")
  const [formIsRoot, setFormIsRoot] = useState(false)
  const [saving, setSaving] = useState(false)
  const [deletingId, setDeletingId] = useState<string | null>(null)

  function openCreate() {
    setFormName("")
    setFormPromptText("")
    setFormIsRoot(menus.length === 0)
    setDialogOpen(true)
  }

  async function handleSave() {
    setSaving(true)
    try {
      const response = await fetch(listKey, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          name: formName,
          prompt_text: formPromptText,
          is_root: formIsRoot,
        }),
      })
      const result = await response.json().catch(() => null)

      if (!response.ok) {
        const message =
          typeof result?.error === "string"
            ? result.error
            : result?.error
              ? JSON.stringify(result.error)
              : "Erro ao criar menu"
        throw new Error(message)
      }

      setDialogOpen(false)
      await mutate(listKey)
      toast.success("Menu criado.")
    } catch (saveError) {
      toast.error(saveError instanceof Error ? saveError.message : "Erro ao criar menu")
    } finally {
      setSaving(false)
    }
  }

  async function handleDelete(menu: BotMenu) {
    setDeletingId(menu.id)
    try {
      const response = await fetch(`${listKey}/${menu.id}`, { method: "DELETE" })
      const result = await response.json().catch(() => null)

      if (!response.ok) {
        throw new Error(result?.error || "Erro ao remover menu")
      }

      await mutate(listKey)
      toast.success("Menu removido.")
    } catch (deleteError) {
      toast.error(deleteError instanceof Error ? deleteError.message : "Erro ao remover menu")
    } finally {
      setDeletingId(null)
    }
  }

  return (
    <div className="flex flex-1 flex-col">
      <PageHeader
        title="Menus"
        description="Crie menus e submenus ilimitados para guiar a conversa do cliente."
      >
        <Button onClick={openCreate} size="sm">
          <Plus className="mr-2 size-4" />
          Novo menu
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
                {error instanceof Error ? error.message : "Erro ao carregar menus."}
              </div>
            ) : menus.length === 0 ? (
              <div className="p-10 text-center text-sm text-muted-foreground">
                Nenhum menu cadastrado ainda. Crie o primeiro e marque como "inicial".
              </div>
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="border-b bg-muted/30 text-left">
                      <th className="px-4 py-3 font-medium text-muted-foreground">Menu</th>
                      <th className="px-4 py-3 font-medium text-muted-foreground">Opcoes</th>
                      <th className="px-4 py-3 font-medium text-muted-foreground">Status</th>
                      <th className="px-4 py-3 text-right font-medium text-muted-foreground">Acoes</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-border/60">
                    {menus.map((menu) => (
                      <tr key={menu.id} className="transition-colors hover:bg-muted/20">
                        <td className="px-4 py-3 align-top">
                          <div className="flex items-start gap-3">
                            <div className="rounded-lg border bg-muted/20 p-2">
                              <ListTree className="size-4" />
                            </div>
                            <div>
                              <p className="font-medium">{menu.name}</p>
                              {menu.is_root ? (
                                <Badge variant="default" className="mt-1 text-xs">
                                  Menu inicial
                                </Badge>
                              ) : null}
                            </div>
                          </div>
                        </td>
                        <td className="px-4 py-3 align-top">
                          {menu.bot_menu_options?.[0]?.count ?? 0}
                        </td>
                        <td className="px-4 py-3 align-top">
                          <Badge variant={menu.is_active ? "default" : "secondary"}>
                            {menu.is_active ? "Ativo" : "Inativo"}
                          </Badge>
                        </td>
                        <td className="px-4 py-3 align-top">
                          <div className="flex justify-end gap-2">
                            <Button variant="outline" size="sm" asChild>
                              <Link href={`/bot/menus/${menu.id}`}>
                                <Pencil className="mr-2 size-4" />
                                Editar
                              </Link>
                            </Button>
                            <Button
                              variant="outline"
                              size="sm"
                              onClick={() => handleDelete(menu)}
                              disabled={deletingId === menu.id}
                            >
                              {deletingId === menu.id ? (
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
            <DialogTitle>Novo menu</DialogTitle>
          </DialogHeader>

          <div className="grid gap-4 py-2">
            <div className="grid gap-2">
              <Label htmlFor="menu-name">Nome</Label>
              <Input
                id="menu-name"
                value={formName}
                onChange={(event) => setFormName(event.target.value)}
                placeholder="Ex: Menu Principal, Produtos, Pizza"
              />
            </div>

            <div className="grid gap-2">
              <Label htmlFor="menu-prompt">Texto de introducao</Label>
              <Textarea
                id="menu-prompt"
                value={formPromptText}
                onChange={(event) => setFormPromptText(event.target.value)}
                rows={3}
                placeholder="Escolha uma opcao:"
              />
              <p className="text-xs text-muted-foreground">
                As opcoes numeradas sao adicionadas depois de criar o menu.
              </p>
            </div>

            <div className="flex items-center gap-3">
              <Switch checked={formIsRoot} onCheckedChange={setFormIsRoot} />
              <span className="text-sm">
                {formIsRoot
                  ? "Este e o menu inicial (enviado logo apos a mensagem de boas-vindas)"
                  : "Menu comum (aberto a partir de outro menu)"}
              </span>
            </div>
          </div>

          <DialogFooter>
            <Button variant="outline" onClick={() => setDialogOpen(false)} disabled={saving}>
              Cancelar
            </Button>
            <Button onClick={handleSave} disabled={saving || !formName.trim()}>
              {saving ? <Loader2 className="mr-2 size-4 animate-spin" /> : null}
              Criar
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  )
}
