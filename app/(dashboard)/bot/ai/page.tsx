"use client"

import { useEffect, useState } from "react"
import useSWR, { mutate } from "swr"
import { Loader2, Save } from "lucide-react"
import { toast } from "sonner"
import { PageHeader } from "@/components/dashboard/page-header"
import { Card, CardContent } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Textarea } from "@/components/ui/textarea"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { Skeleton } from "@/components/ui/skeleton"
import { BOT_AI_PROVIDERS, getBotAiProviderLabel, type BotAiConfig, type BotAiProvider } from "@/lib/bot"

const fetcher = async (url: string) => {
  const response = await fetch(url)
  const data = await response.json()

  if (!response.ok) {
    throw new Error(data?.error || "Erro ao carregar dados")
  }

  return data
}

export default function BotAiPage() {
  const key = "/api/bot/ai-config"
  const { data, isLoading, error } = useSWR<BotAiConfig>(key, fetcher)
  const [provider, setProvider] = useState<BotAiProvider>("none")
  const [apiKey, setApiKey] = useState("")
  const [model, setModel] = useState("")
  const [systemPrompt, setSystemPrompt] = useState("")
  const [temperature, setTemperature] = useState("0.7")
  const [maxTokens, setMaxTokens] = useState("512")
  const [saving, setSaving] = useState(false)

  useEffect(() => {
    if (data) {
      setProvider(data.provider)
      setApiKey(data.api_key)
      setModel(data.model)
      setSystemPrompt(data.system_prompt)
      setTemperature(String(data.temperature))
      setMaxTokens(String(data.max_tokens))
    }
  }, [data])

  async function handleSave() {
    setSaving(true)
    try {
      const temperatureValue = Number(temperature.replace(",", "."))
      const maxTokensValue = Number(maxTokens)

      if (Number.isNaN(temperatureValue) || temperatureValue < 0 || temperatureValue > 2) {
        throw new Error("Temperatura deve ser um numero entre 0 e 2")
      }
      if (!Number.isInteger(maxTokensValue) || maxTokensValue < 1) {
        throw new Error("Maximo de tokens invalido")
      }

      const response = await fetch(key, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          provider,
          api_key: apiKey,
          model,
          system_prompt: systemPrompt,
          temperature: temperatureValue,
          max_tokens: maxTokensValue,
        }),
      })
      const result = await response.json().catch(() => null)

      if (!response.ok) {
        const message =
          typeof result?.error === "string"
            ? result.error
            : result?.error
              ? JSON.stringify(result.error)
              : "Erro ao salvar configuracao de IA"
        throw new Error(message)
      }

      await mutate(key)
      toast.success("Configuracao de IA salva.")
    } catch (saveError) {
      toast.error(saveError instanceof Error ? saveError.message : "Erro ao salvar configuracao de IA")
    } finally {
      setSaving(false)
    }
  }

  const isDisabled = provider === "none"

  return (
    <div className="flex flex-1 flex-col">
      <PageHeader title="IA" description="Configure o provedor de inteligencia artificial do atendimento." />

      <div className="p-4 sm:p-6">
        <Card>
          <CardContent className="space-y-4 pt-6">
            {isLoading ? (
              <Skeleton className="h-64 rounded-lg" />
            ) : error ? (
              <p className="text-sm text-muted-foreground">
                {error instanceof Error ? error.message : "Erro ao carregar configuracao de IA."}
              </p>
            ) : (
              <>
                <div className="grid gap-2">
                  <Label>Provedor</Label>
                  <Select value={provider} onValueChange={(value) => setProvider(value as BotAiProvider)}>
                    <SelectTrigger>
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      {BOT_AI_PROVIDERS.map((option) => (
                        <SelectItem key={option} value={option}>
                          {getBotAiProviderLabel(option)}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>

                <div className="grid gap-4 sm:grid-cols-2">
                  <div className="grid gap-2">
                    <Label htmlFor="ai-api-key">API Key</Label>
                    <Input
                      id="ai-api-key"
                      type="password"
                      value={apiKey}
                      onChange={(event) => setApiKey(event.target.value)}
                      disabled={isDisabled}
                      placeholder="sk-..."
                    />
                  </div>

                  <div className="grid gap-2">
                    <Label htmlFor="ai-model">Modelo</Label>
                    <Input
                      id="ai-model"
                      value={model}
                      onChange={(event) => setModel(event.target.value)}
                      disabled={isDisabled}
                      placeholder="gpt-4o-mini"
                    />
                  </div>
                </div>

                <div className="grid gap-2">
                  <Label htmlFor="ai-prompt">Prompt do sistema</Label>
                  <Textarea
                    id="ai-prompt"
                    value={systemPrompt}
                    onChange={(event) => setSystemPrompt(event.target.value)}
                    disabled={isDisabled}
                    rows={6}
                    placeholder="Voce e um assistente de atendimento da empresa..."
                  />
                </div>

                <div className="grid gap-4 sm:grid-cols-2">
                  <div className="grid gap-2">
                    <Label htmlFor="ai-temperature">Temperatura</Label>
                    <Input
                      id="ai-temperature"
                      type="number"
                      min="0"
                      max="2"
                      step="0.1"
                      value={temperature}
                      onChange={(event) => setTemperature(event.target.value)}
                      disabled={isDisabled}
                    />
                  </div>

                  <div className="grid gap-2">
                    <Label htmlFor="ai-max-tokens">Maximo de tokens</Label>
                    <Input
                      id="ai-max-tokens"
                      type="number"
                      min="1"
                      step="1"
                      value={maxTokens}
                      onChange={(event) => setMaxTokens(event.target.value)}
                      disabled={isDisabled}
                    />
                  </div>
                </div>
              </>
            )}

            <div className="flex justify-end">
              <Button onClick={handleSave} disabled={saving || isLoading}>
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
