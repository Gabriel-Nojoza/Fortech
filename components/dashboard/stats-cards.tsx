"use client"

import {
  FileBarChart2,
  Users,
  Send,
  CheckCircle,
  Zap,
  Link2,
  Loader2,
} from "lucide-react"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Badge } from "@/components/ui/badge"

interface StatsData {
  totalReports: number
  activeContacts: number
  whatsappConnected?: boolean
  whatsappBotStatus?: string
  whatsappConnectedAt?: string | null
  connectedWhatsAppInstances?: number
  totalWhatsAppInstances?: number
  dispatchesToday: number
  successRate: number | null
  completed30d?: number
  delivered30d?: number
  failed30d?: number
  ongoing30d?: number
  pbiConfigured?: boolean
  n8nConfigured?: boolean
}

function getWhatsAppStatusBadge(status?: string) {
  switch (status) {
    case "connected":
      return { label: "Conectado", ok: true as const, pending: false }
    case "reconnecting":
      return { label: "Reconectando...", ok: false as const, pending: true }
    case "starting":
      return { label: "Iniciando...", ok: false as const, pending: true }
    case "awaiting_qr":
      return { label: "Aguardando QR", ok: false as const, pending: false }
    case "error":
      return { label: "Erro na conexao", ok: false as const, pending: false }
    case "offline":
      return { label: "Offline", ok: false as const, pending: false }
    default:
      return { label: "Aguardando QR", ok: false as const, pending: false }
  }
}

function formatConnectedAt(connectedAt?: string | null) {
  if (!connectedAt) return null
  try {
    return new Date(connectedAt).toLocaleTimeString("pt-BR", { hour: "2-digit", minute: "2-digit" })
  } catch {
    return null
  }
}

function formatMetricValue(value: number | string) {
  if (typeof value === "number") {
    return new Intl.NumberFormat("pt-BR").format(value)
  }

  return value
}

export function StatsCards({ data }: { data: StatsData }) {
  const completed30d = data.completed30d ?? 0
  const delivered30d = data.delivered30d ?? 0
  const failed30d = data.failed30d ?? 0
  const ongoing30d = data.ongoing30d ?? 0
  const connectedWhatsAppInstances = data.connectedWhatsAppInstances ?? 0
  const totalWhatsAppInstances = data.totalWhatsAppInstances ?? 0

  const stats = [
    {
      title: "Relatorios",
      value: data.totalReports,
      icon: FileBarChart2,
      description:
        data.totalReports === 1
          ? "1 relatorio ativo visivel"
          : `${formatMetricValue(data.totalReports)} relatorios ativos visiveis`,
      status: data.pbiConfigured
        ? { label: "Conectado", ok: true }
        : { label: "Desconectado", ok: false },
    },
    {
      title: "Contatos Ativos",
      value: data.activeContacts,
      icon: Users,
      description: (() => {
        const connectedAt = formatConnectedAt(data.whatsappConnectedAt)
        if (totalWhatsAppInstances > 0) {
          if (connectedWhatsAppInstances > 0) {
            const base = `${formatMetricValue(connectedWhatsAppInstances)} WhatsApp(s) conectado(s)`
            return connectedAt ? `${base} desde ${connectedAt}` : base
          }
          return `Nenhum dos ${formatMetricValue(totalWhatsAppInstances)} WhatsApp(s) esta conectado`
        }
        return "Nenhum WhatsApp configurado"
      })(),
      status: getWhatsAppStatusBadge(data.whatsappBotStatus),
    },
    {
      title: "Disparos Hoje",
      value: data.dispatchesToday,
      icon: Send,
      description: "Envios realizados",
      status: data.n8nConfigured
        ? { label: "N8N ok", ok: true }
        : { label: "N8N pendente", ok: false },
    },
    {
      title: "Taxa de Sucesso",
      value: data.successRate === null ? "--" : `${data.successRate}%`,
      icon: CheckCircle,
      description:
        data.successRate === null
          ? ongoing30d > 0
            ? `${formatMetricValue(ongoing30d)} envio(s) ainda em andamento`
            : "Sem envios finalizados este mes"
          : `${formatMetricValue(delivered30d)} enviados, ${formatMetricValue(failed30d)} com erro e ${formatMetricValue(ongoing30d)} em andamento`,
      footnote:
        data.successRate === null
          ? "Base: enviados finalizados"
          : `${formatMetricValue(completed30d)} finalizado(s) entram no calculo`,
      status: null,
    },
  ]

  return (
    <div className="grid gap-4 grid-cols-2 lg:grid-cols-4">
      {stats.map((stat) => (
        <Card key={stat.title}>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium text-muted-foreground">
              {stat.title}
            </CardTitle>
            <stat.icon className="size-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{formatMetricValue(stat.value)}</div>
            <div className="flex items-center justify-between gap-2 pt-1">
              <p className="text-xs text-muted-foreground">
                {stat.description}
              </p>
              {stat.status && (
                <Badge
                  variant={stat.status.ok ? "outline" : "secondary"}
                  className={`gap-1 text-[10px] leading-tight ${
                    stat.status.ok
                      ? "border-emerald-500/30 text-emerald-500"
                      : "pending" in stat.status && stat.status.pending
                        ? "border-amber-500/30 text-amber-500"
                        : "text-muted-foreground"
                  }`}
                >
                  {"pending" in stat.status && stat.status.pending ? (
                    <Loader2 className="size-2.5 animate-spin" />
                  ) : stat.status.ok ? (
                    <Link2 className="size-2.5" />
                  ) : (
                    <Zap className="size-2.5" />
                  )}
                  {stat.status.label}
                </Badge>
              )}
            </div>
            {"footnote" in stat && stat.footnote ? (
              <p className="pt-2 text-[11px] text-muted-foreground/80">
                {stat.footnote}
              </p>
            ) : null}
          </CardContent>
        </Card>
      ))}
    </div>
  )
}
