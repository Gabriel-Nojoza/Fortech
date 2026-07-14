"use client"

import { useState } from "react"
import useSWR, { mutate } from "swr"
import { Layers, Loader2, Pencil, Plus } from "lucide-react"
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
import type { CompanyPlanDefinition } from "@/lib/company-plan"

const fetcher = async (url: string) => {
  const response = await fetch(url)
  const data = await response.json()

  if (!response.ok) {
    throw new Error(data?.error || "Erro ao carregar planos")
  }

  return data
}

function resourcesToText(resources: string[]) {
  return resources.join("\n")
}

function textToResources(value: string) {
  return value
    .split("\n")
    .map((line) => line.trim())
    .filter(Boolean)
}

export default function AdminPlansPage() {
  const { data, isLoading, error } = useSWR<CompanyPlanDefinition[]>("/api/admin/plans", fetcher)
  const { data: authData } = useSWR<{ isPlatformAdmin?: boolean }>("/api/auth/me", fetcher)
  const plans = Array.isArray(data) ? data : []
  const canManagePlans = authData?.isPlatformAdmin === true

  const [dialogOpen, setDialogOpen] = useState(false)
  const [editingPlan, setEditingPlan] = useState<CompanyPlanDefinition | null>(null)
  const [formCode, setFormCode] = useState("")
  const [formName, setFormName] = useState("")
  const [formMonthlyPrice, setFormMonthlyPrice] = useState("")
  const [formResources, setFormResources] = useState("")
  const [formReportBuilder, setFormReportBuilder] = useState(false)
  const [formCampaigns, setFormCampaigns] = useState(false)
  const [formExcelExport, setFormExcelExport] = useState(false)
  const [formCampaignClientPreview, setFormCampaignClientPreview] = useState(false)
  const [formIsActive, setFormIsActive] = useState(true)
  const [saving, setSaving] = useState(false)
  const [togglingId, setTogglingId] = useState<string | null>(null)

  function openCreate() {
    setEditingPlan(null)
    setFormCode("")
    setFormName("")
    setFormMonthlyPrice("")
    setFormResources("")
    setFormReportBuilder(false)
    setFormCampaigns(false)
    setFormExcelExport(false)
    setFormCampaignClientPreview(false)
    setFormIsActive(true)
    setDialogOpen(true)
  }

  function openEdit(plan: CompanyPlanDefinition) {
    setEditingPlan(plan)
    setFormCode(plan.code)
    setFormName(plan.name)
    setFormMonthlyPrice(String(plan.monthlyPrice))
    setFormResources(resourcesToText(plan.resources))
    setFormReportBuilder(plan.appFeatures.reportBuilder)
    setFormCampaigns(plan.appFeatures.campaigns)
    setFormExcelExport(plan.appFeatures.excelExport)
    setFormCampaignClientPreview(plan.appFeatures.campaignClientPreview)
    setFormIsActive(plan.isActive)
    setDialogOpen(true)
  }

  async function handleSave() {
    setSaving(true)
    try {
      const monthlyPrice = Number(formMonthlyPrice.replace(",", "."))
      if (Number.isNaN(monthlyPrice) || monthlyPrice < 0) {
        throw new Error("Informe um valor mensal valido")
      }

      const payload = editingPlan
        ? {
            id: editingPlan.id,
            name: formName,
            monthly_price: monthlyPrice,
            resources: textToResources(formResources),
            report_builder: formReportBuilder,
            campaigns: formCampaigns,
            excel_export: formExcelExport,
            campaign_client_preview: formCampaignClientPreview,
            is_active: formIsActive,
          }
        : {
            code: formCode,
            name: formName,
            monthly_price: monthlyPrice,
            resources: textToResources(formResources),
            report_builder: formReportBuilder,
            campaigns: formCampaigns,
            excel_export: formExcelExport,
            campaign_client_preview: formCampaignClientPreview,
            is_active: formIsActive,
          }

      const response = await fetch("/api/admin/plans", {
        method: editingPlan ? "PUT" : "POST",
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
              : "Erro ao salvar plano"
        throw new Error(message)
      }

      setDialogOpen(false)
      await mutate("/api/admin/plans")
      toast.success(editingPlan ? "Plano atualizado." : "Plano criado.")
    } catch (saveError) {
      toast.error(saveError instanceof Error ? saveError.message : "Erro ao salvar plano")
    } finally {
      setSaving(false)
    }
  }

  async function handleToggleActive(plan: CompanyPlanDefinition) {
    if (!plan.id) return
    setTogglingId(plan.id)
    try {
      const response = await fetch("/api/admin/plans", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ id: plan.id, is_active: !plan.isActive }),
      })
      const result = await response.json().catch(() => null)

      if (!response.ok) {
        throw new Error(result?.error || "Erro ao atualizar plano")
      }

      await mutate("/api/admin/plans")
      toast.success(plan.isActive ? "Plano desativado." : "Plano ativado.")
    } catch (toggleError) {
      toast.error(toggleError instanceof Error ? toggleError.message : "Erro ao atualizar plano")
    } finally {
      setTogglingId(null)
    }
  }

  return (
    <div className="flex flex-1 flex-col">
      <PageHeader title="Planos" description="Crie, edite e ative ou desative os planos de assinatura.">
        {canManagePlans ? (
          <Button onClick={openCreate} size="sm">
            <Plus className="mr-2 size-4" />
            Novo plano
          </Button>
        ) : null}
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
                {error instanceof Error ? error.message : "Erro ao carregar planos."}
              </div>
            ) : plans.length === 0 ? (
              <div className="p-10 text-center text-sm text-muted-foreground">
                Nenhum plano cadastrado ainda.
              </div>
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="border-b bg-muted/30 text-left">
                      <th className="px-4 py-3 font-medium text-muted-foreground">Plano</th>
                      <th className="px-4 py-3 font-medium text-muted-foreground">Valor</th>
                      <th className="px-4 py-3 font-medium text-muted-foreground">Recursos</th>
                      <th className="px-4 py-3 font-medium text-muted-foreground">Funcionalidades</th>
                      <th className="px-4 py-3 font-medium text-muted-foreground">Status</th>
                      <th className="px-4 py-3 text-right font-medium text-muted-foreground">Acoes</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-border/60">
                    {plans.map((plan) => {
                      const toggling = togglingId === plan.id

                      return (
                        <tr key={plan.id ?? plan.code} className="transition-colors hover:bg-muted/20">
                          <td className="px-4 py-3 align-top">
                            <div className="flex items-start gap-3">
                              <div className="rounded-lg border bg-muted/20 p-2">
                                <Layers className="size-4" />
                              </div>
                              <div>
                                <p className="font-medium">{plan.name}</p>
                                <p className="text-xs text-muted-foreground">{plan.code}</p>
                              </div>
                            </div>
                          </td>
                          <td className="px-4 py-3 align-top">{plan.monthlyPriceLabel}</td>
                          <td className="px-4 py-3 align-top">
                            <p className="text-xs text-muted-foreground">
                              {plan.resources.length} recurso{plan.resources.length === 1 ? "" : "s"}
                            </p>
                          </td>
                          <td className="px-4 py-3 align-top">
                            <div className="flex flex-wrap gap-1">
                              {plan.appFeatures.reportBuilder ? (
                                <Badge variant="secondary" className="text-xs">Relatorios</Badge>
                              ) : null}
                              {plan.appFeatures.campaigns ? (
                                <Badge variant="secondary" className="text-xs">Campanhas</Badge>
                              ) : null}
                              {plan.appFeatures.excelExport ? (
                                <Badge variant="secondary" className="text-xs">Excel</Badge>
                              ) : null}
                              {plan.appFeatures.campaignClientPreview ? (
                                <Badge variant="secondary" className="text-xs">Preview cliente</Badge>
                              ) : null}
                            </div>
                          </td>
                          <td className="px-4 py-3 align-top">
                            <Badge variant={plan.isActive ? "default" : "secondary"}>
                              {plan.isActive ? "Ativo" : "Inativo"}
                            </Badge>
                          </td>
                          <td className="px-4 py-3 align-top">
                            <div className="flex justify-end gap-2">
                              <Button
                                variant="outline"
                                size="sm"
                                onClick={() => openEdit(plan)}
                                disabled={!canManagePlans}
                              >
                                <Pencil className="mr-2 size-4" />
                                Editar
                              </Button>
                              <Button
                                variant={plan.isActive ? "outline" : "default"}
                                size="sm"
                                onClick={() => handleToggleActive(plan)}
                                disabled={!canManagePlans || toggling}
                              >
                                {toggling ? (
                                  <Loader2 className="size-4 animate-spin" />
                                ) : plan.isActive ? (
                                  "Desativar"
                                ) : (
                                  "Ativar"
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
            <DialogTitle>{editingPlan ? "Editar plano" : "Novo plano"}</DialogTitle>
          </DialogHeader>

          <div className="grid gap-4 py-2">
            <div className="grid gap-4 sm:grid-cols-2">
              <div className="grid gap-2">
                <Label htmlFor="plan-code">Codigo</Label>
                <Input
                  id="plan-code"
                  value={formCode}
                  onChange={(event) => setFormCode(event.target.value)}
                  placeholder="Ex: START"
                  disabled={Boolean(editingPlan)}
                />
              </div>

              <div className="grid gap-2">
                <Label htmlFor="plan-name">Nome</Label>
                <Input
                  id="plan-name"
                  value={formName}
                  onChange={(event) => setFormName(event.target.value)}
                  placeholder="Nome exibido ao cliente"
                />
              </div>
            </div>

            <div className="grid gap-2">
              <Label htmlFor="plan-price">Valor mensal (R$)</Label>
              <Input
                id="plan-price"
                type="number"
                min="0"
                step="1"
                value={formMonthlyPrice}
                onChange={(event) => setFormMonthlyPrice(event.target.value)}
                placeholder="149"
              />
            </div>

            <div className="grid gap-2">
              <Label htmlFor="plan-resources">Recursos (um por linha)</Label>
              <Textarea
                id="plan-resources"
                value={formResources}
                onChange={(event) => setFormResources(event.target.value)}
                rows={6}
                placeholder={"1 conexao de WhatsApp\nAtendimento com IA\nSuporte basico"}
              />
            </div>

            <div className="grid gap-3 rounded-xl border bg-muted/20 p-4">
              <p className="text-sm font-medium">Funcionalidades liberadas</p>

              <div className="flex items-center justify-between">
                <span className="text-sm">Construtor de relatorios</span>
                <Switch checked={formReportBuilder} onCheckedChange={setFormReportBuilder} />
              </div>
              <div className="flex items-center justify-between">
                <span className="text-sm">Campanhas</span>
                <Switch checked={formCampaigns} onCheckedChange={setFormCampaigns} />
              </div>
              <div className="flex items-center justify-between">
                <span className="text-sm">Exportacao Excel</span>
                <Switch checked={formExcelExport} onCheckedChange={setFormExcelExport} />
              </div>
              <div className="flex items-center justify-between">
                <span className="text-sm">Preview de campanha para o cliente</span>
                <Switch checked={formCampaignClientPreview} onCheckedChange={setFormCampaignClientPreview} />
              </div>
            </div>

            <div className="flex items-center gap-3">
              <Switch checked={formIsActive} onCheckedChange={setFormIsActive} />
              <span className="text-sm">{formIsActive ? "Plano ativo" : "Plano inativo"}</span>
            </div>
          </div>

          <DialogFooter>
            <Button variant="outline" onClick={() => setDialogOpen(false)} disabled={saving}>
              Cancelar
            </Button>
            <Button
              onClick={handleSave}
              disabled={saving || !formName.trim() || (!editingPlan && !formCode.trim())}
            >
              {saving ? <Loader2 className="mr-2 size-4 animate-spin" /> : null}
              {editingPlan ? "Salvar" : "Criar"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  )
}
