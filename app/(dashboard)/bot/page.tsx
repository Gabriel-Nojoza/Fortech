"use client"

import useSWR from "swr"
import { Activity, Bot, Clock3, MessagesSquare } from "lucide-react"
import { PageHeader } from "@/components/dashboard/page-header"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Badge } from "@/components/ui/badge"
import { Skeleton } from "@/components/ui/skeleton"

type BotDashboardData = {
  is_enabled: boolean
  messages_today: number
  attendances_today: number
  avg_response_time_ms: number | null
  last_activity_at: string | null
}

const fetcher = async (url: string) => {
  const response = await fetch(url)
  const data = await response.json()

  if (!response.ok) {
    throw new Error(data?.error || "Erro ao carregar dados")
  }

  return data
}

function formatResponseTime(ms: number | null) {
  if (ms === null) return "-"
  if (ms < 1000) return `${ms}ms`
  return `${(ms / 1000).toFixed(1)}s`
}

function formatDateTime(value: string | null) {
  if (!value) return "Sem atividade registrada ainda"
  return new Date(value).toLocaleString("pt-BR")
}

export default function BotDashboardPage() {
  const { data, isLoading, error } = useSWR<BotDashboardData>("/api/bot/dashboard", fetcher, {
    refreshInterval: 15000,
  })

  return (
    <div className="flex flex-1 flex-col">
      <PageHeader title="Dashboard do Bot" description="Visao geral do atendimento automatico via WhatsApp." />

      <div className="grid gap-4 p-4 sm:p-6 lg:grid-cols-4">
        {isLoading ? (
          Array.from({ length: 4 }).map((_, index) => (
            <Skeleton key={index} className="h-32 rounded-xl" />
          ))
        ) : error ? (
          <div className="col-span-full p-6 text-sm text-muted-foreground">
            {error instanceof Error ? error.message : "Erro ao carregar dashboard do bot."}
          </div>
        ) : (
          <>
            <Card>
              <CardHeader className="pb-2">
                <CardTitle className="flex items-center justify-between text-sm font-medium text-muted-foreground">
                  <span className="flex items-center gap-2">
                    <Bot className="size-4" />
                    Status do bot
                  </span>
                </CardTitle>
              </CardHeader>
              <CardContent>
                <Badge variant={data?.is_enabled ? "default" : "secondary"} className="text-sm">
                  {data?.is_enabled ? "Ligado" : "Desligado"}
                </Badge>
              </CardContent>
            </Card>

            <Card>
              <CardHeader className="pb-2">
                <CardTitle className="flex items-center gap-2 text-sm font-medium text-muted-foreground">
                  <MessagesSquare className="size-4" />
                  Mensagens hoje
                </CardTitle>
              </CardHeader>
              <CardContent>
                <p className="text-2xl font-semibold">{data?.messages_today ?? 0}</p>
              </CardContent>
            </Card>

            <Card>
              <CardHeader className="pb-2">
                <CardTitle className="flex items-center gap-2 text-sm font-medium text-muted-foreground">
                  <Activity className="size-4" />
                  Atendimentos hoje
                </CardTitle>
              </CardHeader>
              <CardContent>
                <p className="text-2xl font-semibold">{data?.attendances_today ?? 0}</p>
              </CardContent>
            </Card>

            <Card>
              <CardHeader className="pb-2">
                <CardTitle className="flex items-center gap-2 text-sm font-medium text-muted-foreground">
                  <Clock3 className="size-4" />
                  Tempo medio de resposta
                </CardTitle>
              </CardHeader>
              <CardContent>
                <p className="text-2xl font-semibold">
                  {formatResponseTime(data?.avg_response_time_ms ?? null)}
                </p>
              </CardContent>
            </Card>
          </>
        )}
      </div>

      {!isLoading && !error ? (
        <div className="px-4 sm:px-6">
          <Card>
            <CardContent className="py-4 text-sm text-muted-foreground">
              Ultima atividade: {formatDateTime(data?.last_activity_at ?? null)}
            </CardContent>
          </Card>
        </div>
      ) : null}
    </div>
  )
}
