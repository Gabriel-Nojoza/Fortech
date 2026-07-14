"use client"

import { useEffect, useState } from "react"
import useSWR, { mutate } from "swr"
import { Loader2, Save } from "lucide-react"
import { toast } from "sonner"
import { PageHeader } from "@/components/dashboard/page-header"
import { Card, CardContent } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { Label } from "@/components/ui/label"
import { Textarea } from "@/components/ui/textarea"
import { Skeleton } from "@/components/ui/skeleton"

type WelcomeMessageData = {
  message: string
}

const fetcher = async (url: string) => {
  const response = await fetch(url)
  const data = await response.json()

  if (!response.ok) {
    throw new Error(data?.error || "Erro ao carregar dados")
  }

  return data
}

export default function BotWelcomeMessagePage() {
  const key = "/api/bot/welcome-message"
  const { data, isLoading, error } = useSWR<WelcomeMessageData>(key, fetcher)
  const [message, setMessage] = useState("")
  const [saving, setSaving] = useState(false)

  useEffect(() => {
    if (data) {
      setMessage(data.message)
    }
  }, [data])

  async function handleSave() {
    setSaving(true)
    try {
      const response = await fetch(key, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ message }),
      })
      const result = await response.json().catch(() => null)

      if (!response.ok) {
        throw new Error(result?.error || "Erro ao salvar mensagem inicial")
      }

      await mutate(key)
      toast.success("Mensagem inicial salva.")
    } catch (saveError) {
      toast.error(saveError instanceof Error ? saveError.message : "Erro ao salvar mensagem inicial")
    } finally {
      setSaving(false)
    }
  }

  return (
    <div className="flex flex-1 flex-col">
      <PageHeader
        title="Mensagem Inicial"
        description="Configure a mensagem de boas-vindas enviada quando o cliente inicia uma conversa."
      />

      <div className="p-4 sm:p-6">
        <Card>
          <CardContent className="space-y-4 pt-6">
            {isLoading ? (
              <Skeleton className="h-48 rounded-lg" />
            ) : error ? (
              <p className="text-sm text-muted-foreground">
                {error instanceof Error ? error.message : "Erro ao carregar mensagem inicial."}
              </p>
            ) : (
              <div className="grid gap-2">
                <Label htmlFor="welcome-message">Mensagem de boas-vindas</Label>
                <Textarea
                  id="welcome-message"
                  value={message}
                  onChange={(event) => setMessage(event.target.value)}
                  rows={10}
                  placeholder={"Ola {{nome}}\n\nBem-vindo a empresa.\nEscolha uma opcao."}
                />
                <p className="text-xs text-muted-foreground">
                  Use {"{{nome}}"} para inserir o nome do contato automaticamente.
                </p>
              </div>
            )}

            <div className="flex justify-end">
              <Button onClick={handleSave} disabled={saving || isLoading || !message.trim()}>
                {saving ? (
                  <Loader2 className="mr-2 size-4 animate-spin" />
                ) : (
                  <Save className="mr-2 size-4" />
                )}
                Salvar
              </Button>
            </div>
          </CardContent>
        </Card>
      </div>
    </div>
  )
}
