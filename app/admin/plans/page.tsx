"use client"

import { useState } from "react"
import useSWR, { mutate } from "swr"
import { Diamond, Gem, Loader2, Pencil, Plus, Rocket, Star } from "lucide-react"
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
import { cn } from "@/lib/utils"
import {
  PLATFORM_FEATURE_REGISTRY,
  type CompanyPlanAppFeatures,
  type CompanyPlanDefinition,
} from "@/lib/company-plan"

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

function emptyFeatures(): CompanyPlanAppFeatures {
  return {
    reportBuilder: false,
    campaigns: false,
    excelExport: false,
    campaignClientPreview: false,
    schedules: false,
    operationalSummary: false,
    logs: false,
  }
}

const TIER_ICONS = [Rocket, Star, Gem]

function getTierIcon(index: number) {
  return TIER_ICONS[index] ?? Diamond
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
  const [formFeatures, setFormFeatures] = useState<CompanyPlanAppFeatures>(emptyFeatures())
  const [formIsActive, setFormIsActive] = useState(true)
  const [saving, setSaving] = useState(false)
  const [togglingId, setTogglingId] = useState<string | null>(null)

  function openCreate() {
    setEditingPlan(null)
    setFormCode("")
    setFormName("")
    setFormMonthlyPrice("")
    setFormResources("")
    setFormFeatures(emptyFeatures())
    setFormIsActive(true)
    setDialogOpen(true)
  }

  function openEdit(plan: CompanyPlanDefinition) {
    setEditingPlan(plan)
    setFormCode(plan.code)
    setFormName(plan.name)
    setFormMonthlyPrice(String(plan.monthlyPrice))
    setFormResources(resourcesToText(plan.resources))
    setFormFeatures({ ...plan.appFeatures })
    setFormIsActive(plan.isActive)
    setDialogOpen(true)
  }

  function buildFeaturesPayload() {
    const payload: Record<string, boolean> = {}
    for (const feature of PLATFORM_FEATURE_REGISTRY) {
      payload[feature.column] = formFeatures[feature.key]
    }
    return payload
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
            ...buildFeaturesPayload(),
            is_active: formIsActive,
          }
        : {
            code: formCode,
            name: formName,
            monthly_price: monthlyPrice,
            resources: textToResources(formResources),
            ...buildFeaturesPayload(),
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
        {isLoading ? (
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
            {Array.from({ length: 3 }).map((_, index) => (
              <Skeleton key={index} className="h-96 rounded-2xl" />
            ))}
          </div>
        ) : error ? (
          <Card>
            <CardContent className="p-6 text-sm text-muted-foreground">
              {error instanceof Error ? error.message : "Erro ao carregar planos."}
            </CardContent>
          </Card>
        ) : plans.length === 0 ? (
          <Card>
            <CardContent className="p-10 text-center text-sm text-muted-foreground">
              Nenhum plano cadastrado ainda.
            </CardContent>
          </Card>
        ) : (
          <div className="grid gap-5 sm:grid-cols-2 lg:grid-cols-3">
            {plans.map((plan, index) => {
              const toggling = togglingId === plan.id
              const TierIcon = getTierIcon(index)
              const enabledFeatures = PLATFORM_FEATURE_REGISTRY.filter(
                (feature) => plan.appFeatures[feature.key]
              )

              return (
                <div
                  key={plan.id ?? plan.code}
                  className={cn(
                    "relative flex flex-col overflow-hidden rounded-2xl border p-6 text-slate-100 shadow-lg",
                    "bg-gradient-to-b from-[#0b1430] via-[#0d1b3d] to-[#0a1330]",
                    plan.isActive ? "border-blue-500/40" : "border-slate-700/60 opacity-70"
                  )}
                >
                  <div className="pointer-events-none absolute inset-0 bg-[radial-gradient(circle_at_top,rgba(59,130,246,0.18),transparent_55%)]" />

                  <div className="relative flex items-start justify-between">
                    <div>
                      <h3 className="text-xl font-bold tracking-tight text-white">{plan.name}</h3>
                      <p className="mt-1 text-xs text-slate-400">{plan.code}</p>
                    </div>
                    <div className="rounded-xl border border-blue-400/30 bg-blue-500/10 p-2 text-blue-300">
                      <TierIcon className="size-5" />
                    </div>
                  </div>

                  <div className="relative mt-4 flex items-baseline gap-1">
                    <span className="text-xs font-medium text-blue-300">R$</span>
                    <span className="text-3xl font-extrabold text-white">
                      {plan.monthlyPrice.toLocaleString("pt-BR")}
                    </span>
                    <span className="text-sm text-slate-400">/mes</span>
                  </div>

                  <div className="relative mt-3">
                    <Badge className="border-blue-400/30 bg-blue-500/15 text-blue-300">
                      {plan.resources.length} recurso{plan.resources.length === 1 ? "" : "s"}
                    </Badge>
                  </div>

                  <div className="relative my-4 border-t border-slate-700/60" />

                  <ul className="relative flex-1 space-y-2 text-sm text-slate-200">
                    {plan.resources.length === 0 ? (
                      <li className="text-slate-500">Nenhum recurso cadastrado.</li>
                    ) : (
                      plan.resources.map((resource, resourceIndex) => (
                        <li key={resourceIndex} className="flex items-start gap-2">
                          <span className="mt-0.5 text-blue-400">✓</span>
                          <span>{resource}</span>
                        </li>
                      ))
                    )}
                  </ul>

                  {enabledFeatures.length > 0 ? (
                    <div className="relative mt-4 flex flex-wrap gap-1.5">
                      {enabledFeatures.map((feature) => (
                        <Badge
                          key={feature.key}
                          variant="secondary"
                          className="border-transparent bg-slate-700/60 text-xs text-slate-200"
                        >
                          {feature.label}
                        </Badge>
                      ))}
                    </div>
                  ) : null}

                  <div className="relative mt-5 flex items-center justify-between">
                    <Badge variant={plan.isActive ? "default" : "secondary"}>
                      {plan.isActive ? "Ativo" : "Inativo"}
                    </Badge>
                  </div>

                  <div className="relative mt-4 flex gap-2">
                    <Button
                      variant="outline"
                      size="sm"
                      className="flex-1 border-slate-600 bg-slate-800/60 text-slate-100 hover:bg-slate-700/60 hover:text-white"
                      onClick={() => openEdit(plan)}
                      disabled={!canManagePlans}
                    >
                      <Pencil className="mr-2 size-4" />
                      Editar
                    </Button>
                    <Button
                      size="sm"
                      className="flex-1"
                      variant={plan.isActive ? "outline" : "default"}
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
                </div>
              )
            })}
          </div>
        )}
      </div>

      <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
        <DialogContent className="sm:max-w-lg max-h-[85vh] overflow-y-auto">
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
              <p className="text-sm font-medium">Funcoes da plataforma liberadas neste plano</p>

              {PLATFORM_FEATURE_REGISTRY.map((feature) => (
                <div key={feature.key} className="flex items-center justify-between gap-4">
                  <div>
                    <p className="text-sm">{feature.label}</p>
                    <p className="text-xs text-muted-foreground">{feature.description}</p>
                  </div>
                  <Switch
                    checked={formFeatures[feature.key]}
                    onCheckedChange={(checked) =>
                      setFormFeatures((prev) => ({ ...prev, [feature.key]: checked }))
                    }
                  />
                </div>
              ))}
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
