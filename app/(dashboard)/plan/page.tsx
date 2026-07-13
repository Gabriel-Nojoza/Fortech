"use client"

import useSWR, { mutate } from "swr"
import { ArrowUpCircle } from "lucide-react"
import { toast } from "sonner"
import { PageHeader } from "@/components/dashboard/page-header"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Skeleton } from "@/components/ui/skeleton"
import type { CompanyPlanInfo } from "@/lib/types"

const fetcher = async (url: string) => {
  const response = await fetch(url)
  const data = await response.json()

  if (!response.ok) {
    throw new Error(data?.error || "Erro ao carregar plano")
  }

  return data
}

function formatDate(value: string | null) {
  if (!value) return "Nao definido"

  return new Date(`${value}T12:00:00`).toLocaleDateString("pt-BR", {
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
  })
}

export default function PlanPage() {
  const { data, isLoading, error } = useSWR<CompanyPlanInfo>("/api/plan", fetcher)
  const requestingUpgrade =
    data?.requestedUpgradePlan &&
    data.nextPlanCode === data.requestedUpgradePlan

  async function handleRequestUpgrade() {
    try {
      const response = await fetch("/api/plan", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "request_upgrade" }),
      })
      const payload = await response.json().catch(() => null)

      if (!response.ok) {
        throw new Error(payload?.error || "Erro ao solicitar upgrade")
      }

      await mutate("/api/plan", payload, false)
      toast.success("Solicitacao de upgrade enviada ao administrador.")
    } catch (requestError) {
      toast.error(
        requestError instanceof Error
          ? requestError.message
          : "Erro ao solicitar upgrade"
      )
    }
  }

  if (isLoading) {
    return (
      <div className="flex flex-1 flex-col">
        <PageHeader title="Meu Plano" description="Acompanhe sua assinatura." />
        <div className="grid gap-4 p-4 sm:p-6 lg:grid-cols-[1.1fr_0.9fr]">
          <Skeleton className="h-72 rounded-xl" />
          <Skeleton className="h-72 rounded-xl" />
        </div>
      </div>
    )
  }

  if (error || !data) {
    return (
      <div className="flex flex-1 flex-col">
        <PageHeader title="Meu Plano" description="Acompanhe sua assinatura." />
        <div className="p-4 sm:p-6">
          <Card>
            <CardContent className="py-10 text-sm text-muted-foreground">
              {error instanceof Error ? error.message : "Nao foi possivel carregar seu plano."}
            </CardContent>
          </Card>
        </div>
      </div>
    )
  }

  return (
    <div className="flex flex-1 flex-col">
      <PageHeader title="Meu Plano" description="Acompanhe seu plano e a situacao da assinatura." />

      <div className="grid gap-4 p-4 sm:p-6 lg:grid-cols-[1.1fr_0.9fr]">
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center justify-between gap-3">
              <span>{data.planName}</span>
              <Badge variant={data.status === "active" ? "default" : "secondary"}>
                {data.statusLabel}
              </Badge>
            </CardTitle>
            <CardDescription>{data.companyName}</CardDescription>
          </CardHeader>
          <CardContent className="space-y-5">
            <div className="grid gap-3 sm:grid-cols-3">
              <div className="rounded-xl border bg-muted/20 p-4">
                <p className="text-xs text-muted-foreground">Valor mensal</p>
                <p className="mt-1 text-lg font-semibold">{data.monthlyPriceLabel}</p>
              </div>
              <div className="rounded-xl border bg-muted/20 p-4">
                <p className="text-xs text-muted-foreground">Status</p>
                <p className="mt-1 text-lg font-semibold">{data.statusLabel}</p>
              </div>
              <div className="rounded-xl border bg-muted/20 p-4">
                <p className="text-xs text-muted-foreground">Proximo vencimento</p>
                <p className="mt-1 text-lg font-semibold">{formatDate(data.nextDueDate)}</p>
              </div>
            </div>

            <div className="space-y-3">
              <p className="text-sm font-medium">Recursos disponiveis no plano</p>
              <div className="grid gap-2 sm:grid-cols-2">
                {data.resources.map((resource) => (
                  <div
                    key={resource}
                    className="rounded-lg border bg-background px-3 py-2 text-sm"
                  >
                    {resource}
                  </div>
                ))}
              </div>
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Upgrade</CardTitle>
            <CardDescription>
              Envie uma solicitacao para o administrador da plataforma.
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="rounded-xl border bg-muted/20 p-4 text-sm text-muted-foreground">
              {data.nextPlanCode ? (
                <p>
                  Proximo plano disponivel: <span className="font-medium text-foreground">{data.nextPlanCode}</span>
                </p>
              ) : (
                <p>Seu plano atual ja esta no nivel maximo.</p>
              )}

              {data.requestedUpgradeAt ? (
                <p className="mt-2">
                  Ultima solicitacao enviada em{" "}
                  <span className="font-medium text-foreground">
                    {new Date(data.requestedUpgradeAt).toLocaleString("pt-BR")}
                  </span>
                  {data.requestedUpgradePlan ? ` para ${data.requestedUpgradePlan}` : ""}.
                </p>
              ) : null}
            </div>

            <Button
              onClick={handleRequestUpgrade}
              disabled={!data.nextPlanCode || Boolean(requestingUpgrade)}
              className="w-full"
            >
              {requestingUpgrade ? (
                "Upgrade solicitado"
              ) : (
                <>
                  <ArrowUpCircle className="mr-2 size-4" />
                  Solicitar Upgrade
                </>
              )}
            </Button>
          </CardContent>
        </Card>
      </div>
    </div>
  )
}
