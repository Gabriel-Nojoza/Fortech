"use client"

import { useEffect, useState } from "react"
import { useParams, useRouter } from "next/navigation"
import useSWR, { mutate } from "swr"
import { ArrowLeft, Loader2, Pencil, Plus, Save, Trash2 } from "lucide-react"
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
import { Textarea } from "@/components/ui/textarea"
import { Skeleton } from "@/components/ui/skeleton"

type BotMenuOption = {
  id: string
  menu_id: string
  position: number
  label: string
  action_type: "open_menu" | "send_text" | "transfer_human" | "end_conversation"
  child_menu_id: string | null
  response_text: string | null
  is_active: boolean
}

type BotMenuDetail = {
  id: string
  name: string
  prompt_text: string
  is_root: boolean
  is_active: boolean
  options: BotMenuOption[]
}

type BotMenuSummary = { id: string; name: string }

const fetcher = async (url: string) => {
  const response = await fetch(url)
  const data = await response.json()

  if (!response.ok) {
    throw new Error(data?.error || "Erro ao carregar dados")
  }

  return data
}

const ACTION_TYPE_LABELS: Record<BotMenuOption["action_type"], string> = {
  open_menu: "Abrir submenu",
  send_text: "Responder texto",
  transfer_human: "Transferir para atendente",
  end_conversation: "Encerrar conversa",
}

export default function BotMenuDetailPage() {
  const params = useParams<{ id: string }>()
  const router = useRouter()
  const menuKey = `/api/bot/menus/${params.id}`
  const { data: menu, isLoading, error } = useSWR<BotMenuDetail>(menuKey, fetcher)
  const { data: allMenus } = useSWR<BotMenuSummary[]>("/api/bot/menus", fetcher)
  const outrosMenus = (allMenus ?? []).filter((m) => m.id !== params.id)

  const [formName, setFormName] = useState("")
  const [formPromptText, setFormPromptText] = useState("")
  const [formIsRoot, setFormIsRoot] = useState(false)
  const [formIsActive, setFormIsActive] = useState(true)
  const [savingMenu, setSavingMenu] = useState(false)

  useEffect(() => {
    if (menu) {
      setFormName(menu.name)
      setFormPromptText(menu.prompt_text)
      setFormIsRoot(menu.is_root)
      setFormIsActive(menu.is_active)
    }
  }, [menu])

  const [dialogOpen, setDialogOpen] = useState(false)
  const [editingOption, setEditingOption] = useState<BotMenuOption | null>(null)
  const [formPosition, setFormPosition] = useState("1")
  const [formLabel, setFormLabel] = useState("")
  const [formActionType, setFormActionType] = useState<BotMenuOption["action_type"]>("open_menu")
  const [formChildMenuId, setFormChildMenuId] = useState("")
  const [formResponseText, setFormResponseText] = useState("")
  const [formOptionActive, setFormOptionActive] = useState(true)
  const [savingOption, setSavingOption] = useState(false)
  const [deletingId, setDeletingId] = useState<string | null>(null)

  async function handleSaveMenu() {
    setSavingMenu(true)
    try {
      const response = await fetch(menuKey, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          name: formName,
          prompt_text: formPromptText,
          is_root: formIsRoot,
          is_active: formIsActive,
        }),
      })
      const result = await response.json().catch(() => null)

      if (!response.ok) {
        throw new Error(result?.error || "Erro ao salvar menu")
      }

      await mutate(menuKey)
      await mutate("/api/bot/menus")
      toast.success("Menu atualizado.")
    } catch (saveError) {
      toast.error(saveError instanceof Error ? saveError.message : "Erro ao salvar menu")
    } finally {
      setSavingMenu(false)
    }
  }

  function openCreateOption() {
    setEditingOption(null)
    setFormPosition(String((menu?.options.length ?? 0) + 1))
    setFormLabel("")
    setFormActionType("open_menu")
    setFormChildMenuId("")
    setFormResponseText("")
    setFormOptionActive(true)
    setDialogOpen(true)
  }

  function openEditOption(option: BotMenuOption) {
    setEditingOption(option)
    setFormPosition(String(option.position))
    setFormLabel(option.label)
    setFormActionType(option.action_type)
    setFormChildMenuId(option.child_menu_id ?? "")
    setFormResponseText(option.response_text ?? "")
    setFormOptionActive(option.is_active)
    setDialogOpen(true)
  }

  async function handleSaveOption() {
    setSavingOption(true)
    try {
      const position = Number(formPosition)
      if (!Number.isInteger(position) || position < 1) {
        throw new Error("Posicao invalida")
      }
      if (formActionType === "open_menu" && !formChildMenuId) {
        throw new Error("Selecione o submenu que essa opcao deve abrir")
      }

      const payload = {
        position,
        label: formLabel,
        action_type: formActionType,
        child_menu_id: formActionType === "open_menu" ? formChildMenuId : null,
        response_text:
          formActionType === "send_text" ||
          formActionType === "transfer_human" ||
          formActionType === "end_conversation"
            ? formResponseText || null
            : null,
        is_active: formOptionActive,
      }

      const url = editingOption
        ? `${menuKey}/options/${editingOption.id}`
        : `${menuKey}/options`

      const response = await fetch(url, {
        method: editingOption ? "PUT" : "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      })
      const result = await response.json().catch(() => null)

      if (!response.ok) {
        const message =
          typeof result?.error === "string"
            ? result.error
            : result?.error
              ? JSON.stringify(result.error)
              : "Erro ao salvar opcao"
        throw new Error(message)
      }

      setDialogOpen(false)
      await mutate(menuKey)
      toast.success(editingOption ? "Opcao atualizada." : "Opcao criada.")
    } catch (saveError) {
      toast.error(saveError instanceof Error ? saveError.message : "Erro ao salvar opcao")
    } finally {
      setSavingOption(false)
    }
  }

  async function handleDeleteOption(option: BotMenuOption) {
    setDeletingId(option.id)
    try {
      const response = await fetch(`${menuKey}/options/${option.id}`, { method: "DELETE" })
      const result = await response.json().catch(() => null)

      if (!response.ok) {
        throw new Error(result?.error || "Erro ao remover opcao")
      }

      await mutate(menuKey)
      toast.success("Opcao removida.")
    } catch (deleteError) {
      toast.error(deleteError instanceof Error ? deleteError.message : "Erro ao remover opcao")
    } finally {
      setDeletingId(null)
    }
  }

  function nomeDoMenu(id: string | null) {
    if (!id) return "-"
    return (allMenus ?? []).find((m) => m.id === id)?.name ?? "(menu removido)"
  }

  return (
    <div className="flex flex-1 flex-col">
      <PageHeader title={menu?.name || "Menu"} description="Edite o menu e suas opcoes.">
        <Button variant="outline" size="sm" onClick={() => router.push("/bot/menus")}>
          <ArrowLeft className="mr-2 size-4" />
          Voltar
        </Button>
      </PageHeader>

      <div className="space-y-4 p-4 sm:p-6">
        {isLoading ? (
          <Skeleton className="h-64 rounded-xl" />
        ) : error ? (
          <div className="text-sm text-muted-foreground">
            {error instanceof Error ? error.message : "Erro ao carregar menu."}
          </div>
        ) : (
          <>
            <Card>
              <CardContent className="space-y-4 pt-6">
                <div className="grid gap-4 sm:grid-cols-2">
                  <div className="grid gap-2">
                    <Label htmlFor="menu-name">Nome</Label>
                    <Input id="menu-name" value={formName} onChange={(e) => setFormName(e.target.value)} />
                  </div>
                  <div className="grid gap-2">
                    <Label htmlFor="menu-prompt">Texto de introducao</Label>
                    <Input
                      id="menu-prompt"
                      value={formPromptText}
                      onChange={(e) => setFormPromptText(e.target.value)}
                    />
                  </div>
                </div>

                <div className="flex flex-wrap items-center gap-6">
                  <div className="flex items-center gap-3">
                    <Switch checked={formIsRoot} onCheckedChange={setFormIsRoot} />
                    <span className="text-sm">Menu inicial</span>
                  </div>
                  <div className="flex items-center gap-3">
                    <Switch checked={formIsActive} onCheckedChange={setFormIsActive} />
                    <span className="text-sm">{formIsActive ? "Ativo" : "Inativo"}</span>
                  </div>
                </div>

                <div className="flex justify-end">
                  <Button onClick={handleSaveMenu} disabled={savingMenu || !formName.trim()}>
                    {savingMenu ? (
                      <Loader2 className="mr-2 size-4 animate-spin" />
                    ) : (
                      <Save className="mr-2 size-4" />
                    )}
                    Salvar menu
                  </Button>
                </div>
              </CardContent>
            </Card>

            <Card>
              <CardContent className="p-0">
                <div className="flex items-center justify-between border-b p-4">
                  <p className="text-sm font-medium">Opcoes deste menu</p>
                  <Button size="sm" onClick={openCreateOption}>
                    <Plus className="mr-2 size-4" />
                    Nova opcao
                  </Button>
                </div>

                {menu && menu.options.length === 0 ? (
                  <div className="p-10 text-center text-sm text-muted-foreground">
                    Nenhuma opcao cadastrada ainda.
                  </div>
                ) : (
                  <div className="overflow-x-auto">
                    <table className="w-full text-sm">
                      <thead>
                        <tr className="border-b bg-muted/30 text-left">
                          <th className="px-4 py-3 font-medium text-muted-foreground">#</th>
                          <th className="px-4 py-3 font-medium text-muted-foreground">Rotulo</th>
                          <th className="px-4 py-3 font-medium text-muted-foreground">Acao</th>
                          <th className="px-4 py-3 font-medium text-muted-foreground">Destino</th>
                          <th className="px-4 py-3 font-medium text-muted-foreground">Status</th>
                          <th className="px-4 py-3 text-right font-medium text-muted-foreground">Acoes</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-border/60">
                        {menu?.options.map((option) => (
                          <tr key={option.id} className="transition-colors hover:bg-muted/20">
                            <td className="px-4 py-3 align-top">{option.position}</td>
                            <td className="px-4 py-3 align-top font-medium">{option.label}</td>
                            <td className="px-4 py-3 align-top">
                              <Badge variant="secondary">{ACTION_TYPE_LABELS[option.action_type]}</Badge>
                            </td>
                            <td className="px-4 py-3 align-top text-muted-foreground">
                              {option.action_type === "open_menu"
                                ? nomeDoMenu(option.child_menu_id)
                                : option.response_text || "-"}
                            </td>
                            <td className="px-4 py-3 align-top">
                              <Badge variant={option.is_active ? "default" : "secondary"}>
                                {option.is_active ? "Ativo" : "Inativo"}
                              </Badge>
                            </td>
                            <td className="px-4 py-3 align-top">
                              <div className="flex justify-end gap-2">
                                <Button variant="outline" size="sm" onClick={() => openEditOption(option)}>
                                  <Pencil className="mr-2 size-4" />
                                  Editar
                                </Button>
                                <Button
                                  variant="outline"
                                  size="sm"
                                  onClick={() => handleDeleteOption(option)}
                                  disabled={deletingId === option.id}
                                >
                                  {deletingId === option.id ? (
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
          </>
        )}
      </div>

      <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
        <DialogContent className="sm:max-w-lg">
          <DialogHeader>
            <DialogTitle>{editingOption ? "Editar opcao" : "Nova opcao"}</DialogTitle>
          </DialogHeader>

          <div className="grid gap-4 py-2">
            <div className="grid gap-4 sm:grid-cols-2">
              <div className="grid gap-2">
                <Label htmlFor="option-position">Numero</Label>
                <Input
                  id="option-position"
                  type="number"
                  min="1"
                  value={formPosition}
                  onChange={(e) => setFormPosition(e.target.value)}
                />
              </div>
              <div className="grid gap-2">
                <Label htmlFor="option-label">Rotulo</Label>
                <Input
                  id="option-label"
                  value={formLabel}
                  onChange={(e) => setFormLabel(e.target.value)}
                  placeholder="Ex: Produtos, Pizza, Falar com atendente"
                />
              </div>
            </div>

            <div className="grid gap-2">
              <Label>O que acontece ao escolher essa opcao</Label>
              <Select
                value={formActionType}
                onValueChange={(value) => setFormActionType(value as BotMenuOption["action_type"])}
              >
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {(Object.keys(ACTION_TYPE_LABELS) as BotMenuOption["action_type"][]).map((type) => (
                    <SelectItem key={type} value={type}>
                      {ACTION_TYPE_LABELS[type]}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            {formActionType === "open_menu" ? (
              <div className="grid gap-2">
                <Label>Submenu a abrir</Label>
                <Select value={formChildMenuId} onValueChange={setFormChildMenuId}>
                  <SelectTrigger>
                    <SelectValue placeholder="Selecione um menu" />
                  </SelectTrigger>
                  <SelectContent>
                    {outrosMenus.map((m) => (
                      <SelectItem key={m.id} value={m.id}>
                        {m.name}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
                {outrosMenus.length === 0 ? (
                  <p className="text-xs text-muted-foreground">
                    Crie outro menu primeiro para poder aponta-lo aqui como submenu.
                  </p>
                ) : null}
              </div>
            ) : (
              <div className="grid gap-2">
                <Label htmlFor="option-response">
                  {formActionType === "transfer_human"
                    ? "Mensagem antes de transferir (opcional)"
                    : "Mensagem de resposta"}
                </Label>
                <Textarea
                  id="option-response"
                  value={formResponseText}
                  onChange={(e) => setFormResponseText(e.target.value)}
                  rows={4}
                />
              </div>
            )}

            <div className="flex items-center gap-3">
              <Switch checked={formOptionActive} onCheckedChange={setFormOptionActive} />
              <span className="text-sm">{formOptionActive ? "Opcao ativa" : "Opcao inativa"}</span>
            </div>
          </div>

          <DialogFooter>
            <Button variant="outline" onClick={() => setDialogOpen(false)} disabled={savingOption}>
              Cancelar
            </Button>
            <Button onClick={handleSaveOption} disabled={savingOption || !formLabel.trim()}>
              {savingOption ? <Loader2 className="mr-2 size-4 animate-spin" /> : null}
              {editingOption ? "Salvar" : "Criar"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  )
}
