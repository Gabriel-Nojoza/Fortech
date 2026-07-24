"use client"

import { useState } from "react"
import useSWR, { mutate } from "swr"
import { Building2, Loader2, Pencil, Plus } from "lucide-react"
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
import type { CompanyPlanCode, CompanyPlanDefinition } from "@/lib/company-plan"

type AdminCompany = {
  id: string
  name: string
  slug: string | null
  is_active: boolean
  created_at: string | null
  updated_at: string | null
  plan_code: CompanyPlanCode
  plan_name: string
  monthly_price: number
  monthly_price_label: string
  subscription_status: "active" | "suspended" | "past_due"
  subscription_status_label: string
  next_due_date: string | null
  requested_upgrade_plan: CompanyPlanCode | null
  requested_upgrade_at: string | null
  bot_module_enabled: boolean
}

const fetcher = async (url: string) => {
  const response = await fetch(url)
  const data = await response.json()

  if (!response.ok) {
    throw new Error(data?.error || "Erro ao carregar empresas")
  }

  return data
}

function formatDate(value: string | null) {
  if (!value) return "-"
  return new Date(`${value}T12:00:00`).toLocaleDateString("pt-BR")
}

export default function AdminCompaniesPage() {
  const { data, isLoading, error } = useSWR<AdminCompany[]>("/api/admin/companies", fetcher)
  const { data: authData } = useSWR<{
    isPlatformAdmin?: boolean
  }>("/api/auth/me", fetcher)
  const { data: plansData } = useSWR<CompanyPlanDefinition[]>("/api/admin/plans", fetcher)
  const companies = Array.isArray(data) ? data : []
  const canManageCompanies = authData?.isPlatformAdmin === true
  const planOptions = Array.isArray(plansData) ? plansData.filter((plan) => plan.isActive) : []

  const [dialogOpen, setDialogOpen] = useState(false)
  const [editingCompany, setEditingCompany] = useState<AdminCompany | null>(null)
  const [formName, setFormName] = useState("")
  const [formPlanCode, setFormPlanCode] = useState<CompanyPlanCode>("START")
  const [formNextDueDate, setFormNextDueDate] = useState("")
  const [formIsActive, setFormIsActive] = useState(true)
  const [formBotModuleEnabled, setFormBotModuleEnabled] = useState(true)
  const [formUserEmail, setFormUserEmail] = useState("")
  const [formUserPassword, setFormUserPassword] = useState("")
  const [formUserName, setFormUserName] = useState("")
  const [saving, setSaving] = useState(false)

  function openCreate() {
    setEditingCompany(null)
    setFormName("")
    setFormPlanCode(planOptions[0]?.code ?? "START")
    setFormNextDueDate("")
    setFormIsActive(true)
    setFormBotModuleEnabled(true)
    setFormUserEmail("")
    setFormUserPassword("")
    setFormUserName("")
    setDialogOpen(true)
  }

  function openEdit(company: AdminCompany) {
    setEditingCompany(company)
    setFormName(company.name)
    setFormPlanCode(company.plan_code)
    setFormNextDueDate(company.next_due_date ?? "")
    setFormIsActive(company.is_active)
    setFormBotModuleEnabled(company.bot_module_enabled)
    setFormUserEmail("")
    setFormUserPassword("")
    setFormUserName("")
    setDialogOpen(true)
  }

  async function handleSave() {
    setSaving(true)
    try {
      const payload = editingCompany
        ? {
            id: editingCompany.id,
            name: formName,
            plan_code: formPlanCode,
            next_due_date: formNextDueDate || null,
            is_active: formIsActive,
            bot_module_enabled: formBotModuleEnabled,
          }
        : {
            name: formName,
            plan_code: formPlanCode,
            next_due_date: formNextDueDate || null,
            is_active: formIsActive,
            bot_module_enabled: formBotModuleEnabled,
            user_email: formUserEmail || null,
            user_password: formUserPassword || null,
            user_name: formUserName || null,
          }

      const response = await fetch("/api/admin/companies", {
        method: editingCompany ? "PUT" : "POST",
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
              : "Erro ao salvar empresa"
        throw new Error(message)
      }

      setDialogOpen(false)
      await mutate("/api/admin/companies")
      toast.success(editingCompany ? "Empresa atualizada." : "Empresa criada.")
    } catch (saveError) {
      toast.error(saveError instanceof Error ? saveError.message : "Erro ao salvar empresa")
    } finally {
      setSaving(false)
    }
  }

  return (
    <div className="flex flex-1 flex-col">
      <PageHeader title="Empresas" description="Gerencie plano e assinatura por empresa.">
        {canManageCompanies ? (
          <Button onClick={openCreate} size="sm">
            <Plus className="mr-2 size-4" />
            Nova empresa
          </Button>
        ) : null}
      </PageHeader>

      <div className="p-4 sm:p-6">
        <Card>
          <CardContent className="p-0">
            {isLoading ? (
              <div className="space-y-3 p-6">
                {Array.from({ length: 5 }).map((_, index) => (
                  <Skeleton key={index} className="h-14 rounded-lg" />
                ))}
              </div>
            ) : error ? (
              <div className="p-6 text-sm text-muted-foreground">
                {error instanceof Error ? error.message : "Erro ao carregar empresas."}
              </div>
            ) : companies.length === 0 ? (
              <div className="p-10 text-center text-sm text-muted-foreground">
                Nenhuma empresa cadastrada ainda.
              </div>
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="border-b bg-muted/30 text-left">
                      <th className="px-4 py-3 font-medium text-muted-foreground">Empresa</th>
                      <th className="px-4 py-3 font-medium text-muted-foreground">Plano</th>
                      <th className="px-4 py-3 font-medium text-muted-foreground">Assinatura</th>
                      <th className="px-4 py-3 font-medium text-muted-foreground">Bot WhatsApp</th>
                      <th className="px-4 py-3 font-medium text-muted-foreground text-right">Acoes</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-border/60">
                    {companies.map((company) => {
                      return (
                        <tr key={company.id} className="hover:bg-muted/20 transition-colors">
                          <td className="px-4 py-3 align-top">
                            <div className="flex items-start gap-3">
                              <div className="rounded-lg border bg-muted/20 p-2">
                                <Building2 className="size-4" />
                              </div>
                              <div>
                                <p className="font-medium">{company.name}</p>
                                <p className="text-xs text-muted-foreground">
                                  {company.slug || company.id}
                                </p>
                                {company.requested_upgrade_plan ? (
                                  <Badge variant="secondary" className="mt-2 text-xs">
                                    Upgrade solicitado para {company.requested_upgrade_plan}
                                  </Badge>
                                ) : null}
                              </div>
                            </div>
                          </td>
                          <td className="px-4 py-3 align-top">
                            <p className="font-medium">{company.plan_name}</p>
                            <p className="text-xs text-muted-foreground">{company.monthly_price_label}</p>
                          </td>
                          <td className="px-4 py-3 align-top">
                            <Badge
                              variant={
                                company.subscription_status === "active"
                                  ? "default"
                                  : company.subscription_status === "past_due"
                                    ? "destructive"
                                    : "secondary"
                              }
                            >
                              {company.subscription_status_label}
                            </Badge>
                            <p className="mt-2 text-xs text-muted-foreground">
                              Vencimento: {formatDate(company.next_due_date)}
                            </p>
                            <p className="text-xs text-muted-foreground">
                              Empresa: {company.is_active ? "Ativa" : "Suspensa"}
                            </p>
                          </td>
                          <td className="px-4 py-3 align-top">
                            <Badge variant={company.bot_module_enabled ? "default" : "secondary"}>
                              {company.bot_module_enabled ? "Habilitado" : "Desabilitado"}
                            </Badge>
                          </td>
                          <td className="px-4 py-3 align-top">
                            <div className="flex justify-end gap-2">
                              <Button
                                variant="outline"
                                size="sm"
                                onClick={() => openEdit(company)}
                                disabled={!canManageCompanies}
                              >
                                <Pencil className="mr-2 size-4" />
                                Editar
                              </Button>
                            </div>
                          </td>
                        </tr>
                      )
                    })}
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
            <DialogTitle>{editingCompany ? "Editar empresa" : "Nova empresa"}</DialogTitle>
          </DialogHeader>

          <div className="grid gap-4 py-2">
            <div className="grid gap-2">
              <Label htmlFor="company-name">Nome da empresa</Label>
              <Input
                id="company-name"
                value={formName}
                onChange={(event) => setFormName(event.target.value)}
                placeholder="Nome da empresa"
              />
            </div>

            <div className="grid gap-2">
              <Label>Plano</Label>
              <Select
                value={formPlanCode}
                onValueChange={(value) => setFormPlanCode(value as CompanyPlanCode)}
              >
                <SelectTrigger className="w-full">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {planOptions.map((plan) => (
                    <SelectItem key={plan.code} value={plan.code}>
                      {plan.name}
                    </SelectItem>
                  ))}
                  {editingCompany &&
                  !planOptions.some((plan) => plan.code === editingCompany.plan_code) ? (
                    <SelectItem value={editingCompany.plan_code}>
                      {editingCompany.plan_code} (inativo)
                    </SelectItem>
                  ) : null}
                </SelectContent>
              </Select>
            </div>

            <div className="grid gap-2 sm:max-w-[240px]">
              <Label htmlFor="company-due-date">Proximo vencimento</Label>
              <Input
                id="company-due-date"
                type="date"
                value={formNextDueDate}
                onChange={(event) => setFormNextDueDate(event.target.value)}
              />
            </div>

            <div className="flex items-center gap-3">
              <Switch checked={formIsActive} onCheckedChange={setFormIsActive} />
              <span className="text-sm">
                {formIsActive ? "Empresa ativa" : "Empresa suspensa"}
              </span>
            </div>

            <div className="flex items-center gap-3">
              <Switch checked={formBotModuleEnabled} onCheckedChange={setFormBotModuleEnabled} />
              <span className="text-sm">
                {formBotModuleEnabled ? "Bot WhatsApp habilitado" : "Bot WhatsApp desabilitado"}
              </span>
            </div>

            {!editingCompany ? (
              <div className="grid gap-4 rounded-xl border bg-muted/20 p-4">
                <div>
                  <p className="text-sm font-medium">Login inicial do cliente</p>
                  <p className="text-xs text-muted-foreground">
                    Opcional. Se preencher, a empresa ja sai com um acesso cliente criado.
                  </p>
                </div>

                <div className="grid gap-2">
                  <Label htmlFor="user-name">Nome do usuario</Label>
                  <Input
                    id="user-name"
                    value={formUserName}
                    onChange={(event) => setFormUserName(event.target.value)}
                    placeholder="Nome do responsavel"
                  />
                </div>

                <div className="grid gap-4 sm:grid-cols-2">
                  <div className="grid gap-2">
                    <Label htmlFor="user-email">Email</Label>
                    <Input
                      id="user-email"
                      type="email"
                      value={formUserEmail}
                      onChange={(event) => setFormUserEmail(event.target.value)}
                      placeholder="cliente@empresa.com"
                    />
                  </div>

                  <div className="grid gap-2">
                    <Label htmlFor="user-password">Senha</Label>
                    <Input
                      id="user-password"
                      type="password"
                      value={formUserPassword}
                      onChange={(event) => setFormUserPassword(event.target.value)}
                      placeholder="Minimo 6 caracteres"
                    />
                  </div>
                </div>
              </div>
            ) : null}
          </div>

          <DialogFooter>
            <Button variant="outline" onClick={() => setDialogOpen(false)} disabled={saving}>
              Cancelar
            </Button>
            <Button onClick={handleSave} disabled={saving || !formName.trim()}>
              {saving ? <Loader2 className="mr-2 size-4 animate-spin" /> : null}
              {editingCompany ? "Salvar" : "Criar"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  )
}
