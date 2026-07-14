"use client"

import { useEffect, useState } from "react"
import useSWR, { mutate } from "swr"
import { Headset, Loader2, Pencil, Plus, Trash2 } from "lucide-react"
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
import {
  BOT_AGENT_DISTRIBUTION_STRATEGIES,
  getBotAgentDistributionLabel,
  type BotAgentDistributionStrategy,
  type BotAgentsConfig,
} from "@/lib/bot"

type BotAgent = {
  id: string
  name: string
  phone: string
  department: string | null
  priority: number
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

export default function BotAgentsPage() {
  const listKey = "/api/bot/agents"
  const configKey = "/api/bot/agents-config"
  const { data, isLoading, error } = useSWR<BotAgent[]>(listKey, fetcher)
  const { data: config } = useSWR<BotAgentsConfig>(configKey, fetcher)
  const agents = Array.isArray(data) ? data : []

  const [distribution, setDistribution] = useState<BotAgentDistributionStrategy>("round_robin")
  const [savingDistribution, setSavingDistribution] = useState(false)

  useEffect(() => {
    if (config) {
      setDistribution(config.distribution)
    }
  }, [config])

  const [dialogOpen, setDialogOpen] = useState(false)
  const [editingAgent, setEditingAgent] = useState<BotAgent | null>(null)
  const [formName, setFormName] = useState("")
  const [formPhone, setFormPhone] = useState("")
  const [formDepartment, setFormDepartment] = useState("")
  const [formPriority, setFormPriority] = useState("0")
  const [formIsActive, setFormIsActive] = useState(true)
  const [saving, setSaving] = useState(false)
  const [deletingId, setDeletingId] = useState<string | null>(null)

  async function handleDistributionChange(value: BotAgentDistributionStrategy) {
    setDistribution(value)
    setSavingDistribution(true)
    try {
      const response = await fetch(configKey, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ distribution: value }),
      })
      if (!response.ok) {
        const result = await response.json().catch(() => null)
        throw new Error(result?.error || "Erro ao salvar distribuicao")
      }
      await mutate(configKey)
      toast.success("Distribuicao atualizada.")
    } catch (saveError) {
      toast.error(saveError instanceof Error ? saveError.message : "Erro ao salvar distribuicao")
    } finally {
      setSavingDistribution(false)
    }
  }

  function openCreate() {
    setEditingAgent(null)
    setFormName("")
    setFormPhone("")
    setFormDepartment("")
    setFormPriority("0")
    setFormIsActive(true)
    setDialogOpen(true)
  }

  function openEdit(agent: BotAgent) {
    setEditingAgent(agent)
    setFormName(agent.name)
    setFormPhone(agent.phone)
    setFormDepartment(agent.department ?? "")
    setFormPriority(String(agent.priority))
    setFormIsActive(agent.is_active)
    setDialogOpen(true)
  }

  async function handleSave() {
    setSaving(true)
    try {
      const priority = Number(formPriority)
      if (!Number.isInteger(priority)) {
        throw new Error("Prioridade invalida")
      }

      const payload = {
        name: formName,
        phone: formPhone,
        department: formDepartment || null,
        priority,
        is_active: formIsActive,
      }

      const response = await fetch(
        editingAgent ? `${listKey}/${editingAgent.id}` : listKey,
        {
          method: editingAgent ? "PUT" : "POST",
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
              : "Erro ao salvar atendente"
        throw new Error(message)
      }

      setDialogOpen(false)
      await mutate(listKey)
      toast.success(editingAgent ? "Atendente atualizado." : "Atendente criado.")
    } catch (saveError) {
      toast.error(saveError instanceof Error ? saveError.message : "Erro ao salvar atendente")
    } finally {
      setSaving(false)
    }
  }

  async function handleDelete(agent: BotAgent) {
    setDeletingId(agent.id)
    try {
      const response = await fetch(`${listKey}/${agent.id}`, { method: "DELETE" })
      const result = await response.json().catch(() => null)

      if (!response.ok) {
        throw new Error(result?.error || "Erro ao remover atendente")
      }

      await mutate(listKey)
      toast.success("Atendente removido.")
    } catch (deleteError) {
      toast.error(deleteError instanceof Error ? deleteError.message : "Erro ao remover atendente")
    } finally {
      setDeletingId(null)
    }
  }

  return (
    <div className="flex flex-1 flex-col">
      <PageHeader title="Atendentes" description="Cadastre os atendentes humanos e como as conversas sao distribuidas.">
        <Button onClick={openCreate} size="sm">
          <Plus className="mr-2 size-4" />
          Novo atendente
        </Button>
      </PageHeader>

      <div className="space-y-4 p-4 sm:p-6">
        <Card>
          <CardContent className="flex flex-wrap items-center justify-between gap-3 py-4">
            <div>
              <p className="text-sm font-medium">Distribuicao das conversas</p>
              <p className="text-xs text-muted-foreground">
                Como o bot escolhe qual atendente recebe cada conversa.
              </p>
            </div>
            <Select
              value={distribution}
              onValueChange={(value) => handleDistributionChange(value as BotAgentDistributionStrategy)}
              disabled={savingDistribution}
            >
              <SelectTrigger className="w-48">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {BOT_AGENT_DISTRIBUTION_STRATEGIES.map((strategy) => (
                  <SelectItem key={strategy} value={strategy}>
                    {getBotAgentDistributionLabel(strategy)}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </CardContent>
        </Card>

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
                {error instanceof Error ? error.message : "Erro ao carregar atendentes."}
              </div>
            ) : agents.length === 0 ? (
              <div className="p-10 text-center text-sm text-muted-foreground">
                Nenhum atendente cadastrado ainda.
              </div>
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="border-b bg-muted/30 text-left">
                      <th className="px-4 py-3 font-medium text-muted-foreground">Atendente</th>
                      <th className="px-4 py-3 font-medium text-muted-foreground">Departamento</th>
                      <th className="px-4 py-3 font-medium text-muted-foreground">Prioridade</th>
                      <th className="px-4 py-3 font-medium text-muted-foreground">Status</th>
                      <th className="px-4 py-3 text-right font-medium text-muted-foreground">Acoes</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-border/60">
                    {agents.map((agent) => (
                      <tr key={agent.id} className="transition-colors hover:bg-muted/20">
                        <td className="px-4 py-3 align-top">
                          <div className="flex items-start gap-3">
                            <div className="rounded-lg border bg-muted/20 p-2">
                              <Headset className="size-4" />
                            </div>
                            <div>
                              <p className="font-medium">{agent.name}</p>
                              <p className="text-xs text-muted-foreground">{agent.phone}</p>
                            </div>
                          </div>
                        </td>
                        <td className="px-4 py-3 align-top">{agent.department || "-"}</td>
                        <td className="px-4 py-3 align-top">{agent.priority}</td>
                        <td className="px-4 py-3 align-top">
                          <Badge variant={agent.is_active ? "default" : "secondary"}>
                            {agent.is_active ? "Ativo" : "Inativo"}
                          </Badge>
                        </td>
                        <td className="px-4 py-3 align-top">
                          <div className="flex justify-end gap-2">
                            <Button variant="outline" size="sm" onClick={() => openEdit(agent)}>
                              <Pencil className="mr-2 size-4" />
                              Editar
                            </Button>
                            <Button
                              variant="outline"
                              size="sm"
                              onClick={() => handleDelete(agent)}
                              disabled={deletingId === agent.id}
                            >
                              {deletingId === agent.id ? (
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
            <DialogTitle>{editingAgent ? "Editar atendente" : "Novo atendente"}</DialogTitle>
          </DialogHeader>

          <div className="grid gap-4 py-2">
            <div className="grid gap-2">
              <Label htmlFor="agent-name">Nome</Label>
              <Input id="agent-name" value={formName} onChange={(event) => setFormName(event.target.value)} />
            </div>

            <div className="grid gap-4 sm:grid-cols-2">
              <div className="grid gap-2">
                <Label htmlFor="agent-phone">Telefone</Label>
                <Input
                  id="agent-phone"
                  value={formPhone}
                  onChange={(event) => setFormPhone(event.target.value)}
                  placeholder="5511999999999"
                />
              </div>

              <div className="grid gap-2">
                <Label htmlFor="agent-department">Departamento</Label>
                <Input
                  id="agent-department"
                  value={formDepartment}
                  onChange={(event) => setFormDepartment(event.target.value)}
                  placeholder="Comercial"
                />
              </div>
            </div>

            <div className="grid gap-4 sm:grid-cols-2">
              <div className="grid gap-2">
                <Label htmlFor="agent-priority">Prioridade</Label>
                <Input
                  id="agent-priority"
                  type="number"
                  step="1"
                  value={formPriority}
                  onChange={(event) => setFormPriority(event.target.value)}
                />
              </div>

              <div className="flex items-center gap-3 pt-6">
                <Switch checked={formIsActive} onCheckedChange={setFormIsActive} />
                <span className="text-sm">{formIsActive ? "Atendente ativo" : "Atendente inativo"}</span>
              </div>
            </div>
          </div>

          <DialogFooter>
            <Button variant="outline" onClick={() => setDialogOpen(false)} disabled={saving}>
              Cancelar
            </Button>
            <Button
              onClick={handleSave}
              disabled={saving || !formName.trim() || !formPhone.trim()}
            >
              {saving ? <Loader2 className="mr-2 size-4 animate-spin" /> : null}
              {editingAgent ? "Salvar" : "Criar"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  )
}
