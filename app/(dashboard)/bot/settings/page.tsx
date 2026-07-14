"use client"

import { useEffect, useState } from "react"
import useSWR, { mutate } from "swr"
import { Loader2 } from "lucide-react"
import { toast } from "sonner"
import { PageHeader } from "@/components/dashboard/page-header"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Switch } from "@/components/ui/switch"

type BotGeneralSettings = {
  is_enabled: boolean
}

const fetcher = async (url: string) => {
  const response = await fetch(url)
  const data = await response.json()

  if (!response.ok) {
    throw new Error(data?.error || "Erro ao carregar dados")
  }

  return data
}

export default function BotSettingsPage() {
  const key = "/api/bot/status"
  const { data, isLoading, error } = useSWR<BotGeneralSettings>(key, fetcher)
  const [isEnabled, setIsEnabled] = useState(false)
  const [saving, setSaving] = useState(false)

  useEffect(() => {
    if (data) {
      setIsEnabled(data.is_enabled)
    }
  }, [data])

  async function handleToggle(checked: boolean) {
    setIsEnabled(checked)
    setSaving(true)
    try {
      const response = await fetch(key, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ is_enabled: checked }),
      })
      const result = await response.json().catch(() => null)

      if (!response.ok) {
        throw new Error(result?.error || "Erro ao atualizar status do bot")
      }

      await mutate(key)
      toast.success(checked ? "Bot ligado." : "Bot desligado.")
    } catch (saveError) {
      setIsEnabled(!checked)
      toast.error(saveError instanceof Error ? saveError.message : "Erro ao atualizar status do bot")
    } finally {
      setSaving(false)
    }
  }

  return (
    <div className="flex flex-1 flex-col">
      <PageHeader title="Configuracoes" description="Ligue ou desligue o atendimento automatico." />

      <div className="p-4 sm:p-6">
        <Card>
          <CardHeader>
            <CardTitle>Status do bot</CardTitle>
            <CardDescription>
              Quando desligado, o bot para de responder automaticamente e as conversas seguem apenas
              para os atendentes.
            </CardDescription>
          </CardHeader>
          <CardContent>
            <div className="flex items-center gap-3">
              {isLoading ? (
                <Loader2 className="size-4 animate-spin" />
              ) : error ? (
                <p className="text-sm text-muted-foreground">
                  {error instanceof Error ? error.message : "Erro ao carregar status do bot."}
                </p>
              ) : (
                <>
                  <Switch checked={isEnabled} onCheckedChange={handleToggle} disabled={saving} />
                  <span className="text-sm font-medium">{isEnabled ? "Bot ligado" : "Bot desligado"}</span>
                  {saving ? <Loader2 className="size-4 animate-spin text-muted-foreground" /> : null}
                </>
              )}
            </div>
          </CardContent>
        </Card>
      </div>
    </div>
  )
}
