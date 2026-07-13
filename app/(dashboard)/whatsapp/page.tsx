"use client"

import { useEffect, useRef, useState } from "react"
import useSWR, { mutate } from "swr"
import { Loader2, Power, RefreshCcw, Smartphone } from "lucide-react"
import { toast } from "sonner"
import { PageHeader } from "@/components/dashboard/page-header"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog"
import { Skeleton } from "@/components/ui/skeleton"
import { ProviderModeCard } from "@/components/dashboard/provider-mode-card"
import type { CompanyFeatures } from "@/app/api/features/route"
import type { WahaSessionInfo } from "@/lib/types"

const fetcher = async (url: string) => {
  const response = await fetch(url)
  const data = await response.json()

  if (!response.ok) {
    throw new Error(data?.error || "Erro ao carregar dados")
  }

  return data
}

function formatDateTime(value: string | null) {
  if (!value) return "-"
  return new Date(value).toLocaleString("pt-BR")
}

function getStatusLabel(status: WahaSessionInfo["status"]) {
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
      return "Nao configurado"
  }
}

export default function WhatsAppPage() {
  const [qrModalOpen, setQrModalOpen] = useState(false)
  const [actionLoading, setActionLoading] = useState<"connect" | "restart" | "disconnect" | null>(null)
  const statusRef = useRef<WahaSessionInfo["status"] | null>(null)
  const statusKey = "/api/waha/session/status"
  const qrKey = "/api/waha/session/qr"
  const { data: features, isLoading: isLoadingFeatures } = useSWR<CompanyFeatures>("/api/features", fetcher)
  const wahaEnabled = features?.wahaEnabled === true

  const { data: statusData, isLoading, error } = useSWR<WahaSessionInfo>(wahaEnabled ? statusKey : null, fetcher, {
    refreshInterval: 5000,
  })
  const { data: qrData } = useSWR<WahaSessionInfo>(wahaEnabled && qrModalOpen ? qrKey : null, fetcher, {
    refreshInterval: 3000,
  })
  const data = qrModalOpen && qrData ? qrData : statusData

  useEffect(() => {
    const previousStatus = statusRef.current
    statusRef.current = data?.status ?? null

    if (
      qrModalOpen &&
      data?.status === "WORKING" &&
      previousStatus !== "WORKING"
    ) {
      setQrModalOpen(false)
      toast.success("WhatsApp conectado com sucesso.")
      void mutate(statusKey)
    }
  }, [data?.status, qrModalOpen])

  async function handleConnect() {
    setActionLoading("connect")
    try {
      const createResponse = await fetch("/api/waha/session", { method: "POST" })
      const createPayload = await createResponse.json().catch(() => null)
      if (!createResponse.ok) {
        throw new Error(createPayload?.error || "Erro ao criar sessao WAHA")
      }

      const startResponse = await fetch("/api/waha/session/start", { method: "POST" })
      const startPayload = await startResponse.json().catch(() => null)
      if (!startResponse.ok) {
        throw new Error(startPayload?.error || "Erro ao iniciar sessao WAHA")
      }

      const qrResponse = await fetch(qrKey)
      const qrPayload = await qrResponse.json().catch(() => null)
      if (!qrResponse.ok) {
        throw new Error(qrPayload?.error || "Erro ao buscar QR Code")
      }

      await mutate(statusKey, qrPayload ?? startPayload, false)

      if (qrPayload?.status === "WORKING") {
        toast.success("WhatsApp conectado com sucesso.")
        return
      }

      setQrModalOpen(true)
    } catch (connectError) {
      toast.error(
        connectError instanceof Error
          ? connectError.message
          : "Erro ao conectar WhatsApp"
      )
    } finally {
      setActionLoading(null)
    }
  }

  async function handleRestart() {
    setActionLoading("restart")
    try {
      const response = await fetch("/api/waha/session/restart", { method: "POST" })
      const payload = await response.json().catch(() => null)
      if (!response.ok) {
        throw new Error(payload?.error || "Erro ao reiniciar conexao")
      }

      await mutate(statusKey, payload, false)
      const qrResponse = await fetch(qrKey)
      const qrPayload = await qrResponse.json().catch(() => null)
      if (qrResponse.ok && qrPayload?.qrCodeDataUrl) {
        await mutate(statusKey, qrPayload, false)
        setQrModalOpen(true)
      }

      toast.success("Conexao reiniciada.")
    } catch (restartError) {
      toast.error(
        restartError instanceof Error
          ? restartError.message
          : "Erro ao reiniciar conexao"
      )
    } finally {
      setActionLoading(null)
    }
  }

  async function handleDisconnect() {
    setActionLoading("disconnect")
    try {
      const response = await fetch("/api/waha/session", { method: "DELETE" })
      const payload = await response.json().catch(() => null)
      if (!response.ok) {
        throw new Error(payload?.error || "Erro ao desconectar WhatsApp")
      }

      await mutate(statusKey, payload, false)
      setQrModalOpen(false)
      toast.success("Sessao WAHA removida.")
    } catch (disconnectError) {
      toast.error(
        disconnectError instanceof Error
          ? disconnectError.message
          : "Erro ao desconectar WhatsApp"
      )
    } finally {
      setActionLoading(null)
    }
  }

  if (isLoadingFeatures || (wahaEnabled && isLoading)) {
    return (
      <div className="flex flex-1 flex-col">
        <PageHeader title="WhatsApp" description="Gerencie a sessao WAHA da sua empresa." />
        <div className="grid gap-4 p-4 sm:p-6 lg:grid-cols-[1.05fr_0.95fr]">
          <Skeleton className="h-72 rounded-xl" />
          <Skeleton className="h-72 rounded-xl" />
        </div>
      </div>
    )
  }

  if (features && !wahaEnabled) {
    return (
      <div className="flex flex-1 flex-col">
        <PageHeader title="WhatsApp" description="Gerencie a sessao WAHA da sua empresa." />
        <div className="p-4 sm:p-6">
          <ProviderModeCard
            activeProvider={features.whatsappProvider}
            requiredProvider="waha"
            description="A pagina WAHA so fica disponivel para empresas configuradas para usar o WAHA como canal de WhatsApp."
          />
        </div>
      </div>
    )
  }

  if (error || !data) {
    return (
      <div className="flex flex-1 flex-col">
        <PageHeader title="WhatsApp" description="Gerencie a sessao WAHA da sua empresa." />
        <div className="p-4 sm:p-6">
          <Card>
            <CardContent className="py-10 text-sm text-muted-foreground">
              {error instanceof Error ? error.message : "Nao foi possivel carregar a conexao WAHA."}
            </CardContent>
          </Card>
        </div>
      </div>
    )
  }

  return (
    <div className="flex flex-1 flex-col">
      <PageHeader title="WhatsApp" description="Conexao WAHA separada do bot atual da plataforma." />

      <div className="grid gap-4 p-4 sm:p-6 lg:grid-cols-[1.05fr_0.95fr]">
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center justify-between gap-3">
              <span>Status da conexao</span>
              <Badge
                variant={
                  data.status === "WORKING"
                    ? "default"
                    : data.status === "FAILED"
                      ? "destructive"
                      : "secondary"
                }
              >
                {getStatusLabel(data.status)}
              </Badge>
            </CardTitle>
            <CardDescription>
              Toda a comunicacao acontece pelo backend e usa uma sessao propria do WAHA.
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-5">
            <div className="grid gap-3 sm:grid-cols-2">
              <div className="rounded-xl border bg-muted/20 p-4">
                <p className="text-xs text-muted-foreground">Nome da sessao</p>
                <p className="mt-1 break-all text-sm font-semibold">{data.sessionName}</p>
              </div>
              <div className="rounded-xl border bg-muted/20 p-4">
                <p className="text-xs text-muted-foreground">Numero conectado</p>
                <p className="mt-1 text-sm font-semibold">{data.phoneNumber || "-"}</p>
              </div>
              <div className="rounded-xl border bg-muted/20 p-4">
                <p className="text-xs text-muted-foreground">Nome conectado</p>
                <p className="mt-1 text-sm font-semibold">{data.connectedName || "-"}</p>
              </div>
              <div className="rounded-xl border bg-muted/20 p-4">
                <p className="text-xs text-muted-foreground">Ultima conexao</p>
                <p className="mt-1 text-sm font-semibold">{formatDateTime(data.lastConnectionAt)}</p>
              </div>
            </div>

            {data.lastError ? (
              <div className="rounded-xl border border-destructive/30 bg-destructive/10 p-4 text-sm text-destructive">
                {data.lastError}
              </div>
            ) : null}

            <div className="flex flex-col gap-2 sm:flex-row">
              <Button
                onClick={handleConnect}
                disabled={actionLoading !== null}
              >
                {actionLoading === "connect" ? (
                  <>
                    <Loader2 className="mr-2 size-4 animate-spin" />
                    Conectando...
                  </>
                ) : (
                  <>
                    <Smartphone className="mr-2 size-4" />
                    Conectar WhatsApp
                  </>
                )}
              </Button>

              <Button
                variant="outline"
                onClick={handleRestart}
                disabled={actionLoading !== null || data.status === "NOT_CREATED"}
              >
                {actionLoading === "restart" ? (
                  <>
                    <Loader2 className="mr-2 size-4 animate-spin" />
                    Reiniciando...
                  </>
                ) : (
                  <>
                    <RefreshCcw className="mr-2 size-4" />
                    Reiniciar conexao
                  </>
                )}
              </Button>

              <Button
                variant="secondary"
                onClick={handleDisconnect}
                disabled={actionLoading !== null || data.status === "NOT_CREATED"}
              >
                {actionLoading === "disconnect" ? (
                  <>
                    <Loader2 className="mr-2 size-4 animate-spin" />
                    Desconectando...
                  </>
                ) : (
                  <>
                    <Power className="mr-2 size-4" />
                    Desconectar
                  </>
                )}
              </Button>
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>QR Code</CardTitle>
            <CardDescription>
              Ao conectar, a plataforma cria a sessao automaticamente e acompanha o status ate virar WORKING.
            </CardDescription>
          </CardHeader>
          <CardContent>
            <div className="flex min-h-[320px] items-center justify-center rounded-xl border border-dashed bg-muted/20 p-4">
              {data.qrCodeDataUrl ? (
                <img
                  src={data.qrCodeDataUrl}
                  alt="QR Code do WAHA"
                  className="max-h-[260px] w-full max-w-[260px] rounded-lg border bg-white p-2 object-contain"
                />
              ) : (
                <div className="text-center text-sm text-muted-foreground">
                  {data.status === "WORKING"
                    ? "WhatsApp conectado. O QR volta a aparecer quando a sessao pedir nova leitura."
                    : "Nenhum QR disponivel no momento. Clique em Conectar WhatsApp para gerar o QR."}
                </div>
              )}
            </div>
          </CardContent>
        </Card>
      </div>

      <Dialog open={qrModalOpen} onOpenChange={setQrModalOpen}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>Conectar WhatsApp</DialogTitle>
          </DialogHeader>

          <div className="space-y-4">
            <p className="text-sm text-muted-foreground">
              Escaneie o QR Code abaixo no WhatsApp. Assim que o status ficar WORKING, esta janela sera fechada automaticamente.
            </p>

            <div className="flex min-h-[280px] items-center justify-center rounded-xl border bg-muted/20 p-4">
              {data.qrCodeDataUrl ? (
                <img
                  src={data.qrCodeDataUrl}
                  alt="QR Code do WAHA"
                  className="max-h-[240px] w-full max-w-[240px] rounded-lg border bg-white p-2 object-contain"
                />
              ) : (
                <div className="text-center text-sm text-muted-foreground">
                  Aguardando o WAHA gerar o QR Code...
                </div>
              )}
            </div>

            <div className="flex items-center justify-between rounded-lg border bg-background px-3 py-2 text-sm">
              <span className="text-muted-foreground">Status atual</span>
              <Badge variant={data.status === "WORKING" ? "default" : "secondary"}>
                {getStatusLabel(data.status)}
              </Badge>
            </div>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  )
}
