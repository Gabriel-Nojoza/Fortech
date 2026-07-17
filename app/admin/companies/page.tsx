"use client"

import { useState } from "react"
import useSWR, { mutate } from "swr"
import { Building2, Loader2, Pencil, Plus, RefreshCcw, Trash2 } from "lucide-react"
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
import type { WhatsAppProvider } from "@/lib/whatsapp-provider"

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
  whatsapp_provider: WhatsAppProvider
  whatsapp_provider_label: string
  bot_module_enabled: boolean
  waha: {
    exists: boolean
    session_name: string
    status: string
    phone_number: string | null
    connected_name: string | null
    last_connection_at: string | null
    last_seen_at: string | null
    last_error: string | null
  }
}

const WHATSAPP_PROVIDER_OPTIONS: WhatsAppProvider[] = ["bot", "waha"]

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

function formatDateTime(value: string | null) {
  if (!value) return "-"
  return new Date(value).toLocaleString("pt-BR")
}

function getWahaStatusLabel(status: string) {
  switch (status) {
    case "WORKING":
      return "Conectado"
    case "SCAN_QR_CODE":
      return "Aguardando QR"
    case "STARTING":
      return "Iniciando"
    case "FAILED":
      return "Falha"
    case "STOPPED":
      return "Desconectado"
    default:
      return "Nao criado"
  }
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
  const [formWhatsAppProvider, setFormWhatsAppProvider] = useState<WhatsAppProvider>("bot")
  const [formNextDueDate, setFormNextDueDate] = useState("")
  const [formIsActive, setFormIsActive] = useState(true)
  const [formBotModuleEnabled, setFormBotModuleEnabled] = useState(true)
  const [formUserEmail, setFormUserEmail] = useState("")
  const [formUserPassword, setFormUserPassword] = useState("")
  const [formUserName, setFormUserName] = useState("")
  const [saving, setSaving] = useState(false)
  const [sessionActionFor, setSessionActionFor] = useState<string | null>(null)

  function openCreate() {
    setEditingCompany(null)
    setFormName("")
    setFormPlanCode(planOptions[0]?.code ?? "START")
    setFormWhatsAppProvider("bot")
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
    setFormWhatsAppProvider(company.whatsapp_provider)
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
            whatsapp_provider: formWhatsAppProvider,
            next_due_date: formNextDueDate || null,
            is_active: formIsActive,
            bot_module_enabled: formBotModuleEnabled,
          }
        : {
            name: formName,
            plan_code: formPlanCode,
            whatsapp_provider: formWhatsAppProvider,
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

  async function handleWahaAction(companyId: string, action: "restart" | "remove") {
    setSessionActionFor(`${companyId}:${action}`)
    try {
      const response = await fetch("/api/admin/waha/sessions", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ companyId, action }),
      })
      const payload = await response.json().catch(() => null)

      if (!response.ok) {
        throw new Error(payload?.error || "Erro ao controlar sessao WAHA")
      }

      await mutate("/api/admin/companies")
      toast.success(action === "restart" ? "Conexao WAHA reiniciada." : "Sessao WAHA removida.")
    } catch (sessionError) {
      toast.error(
        sessionError instanceof Error
          ? sessionError.message
          : "Erro ao controlar sessao WAHA"
      )
    } finally {
      setSessionActionFor(null)
    }
  }

  return (
    <div className="flex flex-1 flex-col">
      <PageHeader title="Empresas" description="Gerencie plano, assinatura e o canal WhatsApp por empresa.">
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
                      <th className="px-4 py-3 font-medium text-muted-foreground">Canal</th>
                      <th className="px-4 py-3 font-medium text-muted-foreground">WAHA</th>
                      <th className="px-4 py-3 font-medium text-muted-foreground">Conectado</th>
                      <th className="px-4 py-3 font-medium text-muted-foreground text-right">Acoes</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-border/60">
                    {companies.map((company) => {
                      const restarting = sessionActionFor === `${company.id}:restart`
                      const removing = sessionActionFor === `${company.id}:remove`

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
                            <Badge variant={company.whatsapp_provider === "waha" ? "default" : "secondary"}>
                              {company.whatsapp_provider_label}
                            </Badge>
                            <p className="mt-2 text-xs text-muted-foreground">
                              Bot WhatsApp: {company.bot_module_enabled ? "Habilitado" : "Desabilitado"}
                            </p>
                          </td>
                          <td className="px-4 py-3 align-top">
                            {company.whatsapp_provider === "waha" ? (
                              <>
                                <Badge
                                  variant={
                                    company.waha.status === "WORKING"
                                      ? "default"
                                      : company.waha.status === "FAILED"
                                        ? "destructive"
                                        : "secondary"
                                  }
                                >
                                  {getWahaStatusLabel(company.waha.status)}
                                </Badge>
                                <p className="mt-2 text-xs text-muted-foreground break-all">
                                  {company.waha.session_name}
                                </p>
                                <p className="text-xs text-muted-foreground">
                                  Ultima conexao: {formatDateTime(company.waha.last_connection_at)}
                                </p>
                              </>
                            ) : (
                              <p className="text-xs text-muted-foreground">
                                WAHA desativado para esta empresa.
                              </p>
                            )}
                          </td>
                          <td className="px-4 py-3 align-top">
                            {company.whatsapp_provider === "waha" ? (
                              <>
                                <p className="font-medium">{company.waha.phone_number || "-"}</p>
                                <p className="text-xs text-muted-foreground">
                                  {company.waha.connected_name || "-"}
                                </p>
                              </>
                            ) : (
                              <p className="text-xs text-muted-foreground">Usando bot atual.</p>
                            )}
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
                              <Button
                                variant="outline"
                                size="sm"
                                onClick={() => handleWahaAction(company.id, "restart")}
                                disabled={
                                  restarting ||
                                  !canManageCompanies ||
                                  company.whatsapp_provider !== "waha"
                                }
                              >
                                {restarting ? (
                                  <Loader2 className="size-4 animate-spin" />
                                ) : (
                                  <RefreshCcw className="size-4" />
                                )}
                              </Button>
                              <Button
                                variant="outline"
                                size="sm"
                                onClick={() => handleWahaAction(company.id, "remove")}
                                disabled={
                                  removing ||
                                  !canManageCompanies ||
                                  company.whatsapp_provider !== "waha"
                                }
                              >
                                {removing ? (
                                  <Loader2 className="size-4 animate-spin" />
                                ) : (
                                  <Trash2 className="size-4 text-destructive" />
                                )}
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

            <div className="grid gap-4 sm:grid-cols-2 sm:gap-x-6">
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

              <div className="grid gap-2">
                <Label>Canal WhatsApp</Label>
                <Select
                  value={formWhatsAppProvider}
                  onValueChange={(value) => setFormWhatsAppProvider(value as WhatsAppProvider)}
                >
                  <SelectTrigger className="w-full">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {WHATSAPP_PROVIDER_OPTIONS.filter(
                      (provider) =>
                        provider !== "waha" || editingCompany?.whatsapp_provider === "waha"
                    ).map((provider) => (
                      <SelectItem key={provider} value={provider}>
                        {provider === "waha" ? "WAHA" : "WhatsApp Relatorios"}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
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
