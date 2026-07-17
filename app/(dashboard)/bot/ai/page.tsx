"use client"

import { useEffect, useRef, useState } from "react"
import useSWR, { mutate } from "swr"
import { FileText, Loader2, Save, Trash2, Upload } from "lucide-react"
import { toast } from "sonner"
import { PageHeader } from "@/components/dashboard/page-header"
import { Card, CardContent } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Textarea } from "@/components/ui/textarea"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { Skeleton } from "@/components/ui/skeleton"
import {
  BOT_AI_PROVIDERS,
  getBotAiProviderLabel,
  type BotAiConfig,
  type BotAiProvider,
  type BotCatalogFile,
} from "@/lib/bot"
import type { CompanyFeatures } from "@/app/api/features/route"

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
  const { data: features } = useSWR<CompanyFeatures>("/api/features", fetcher)
  const isWaha = features?.wahaEnabled === true
  const catalogKey = "/api/bot/catalog-file"
  const { data: catalogFile, isLoading: isLoadingCatalog } = useSWR<BotCatalogFile | null>(
    isWaha ? catalogKey : null,
    fetcher
  )
  const [uploadingCatalog, setUploadingCatalog] = useState(false)
  const catalogInputRef = useRef<HTMLInputElement>(null)
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

  async function handleCatalogUpload(event: React.ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0]
    if (!file) return

    setUploadingCatalog(true)
    try {
      const formData = new FormData()
      formData.append("file", file)
      const response = await fetch(catalogKey, { method: "POST", body: formData })
      const result = await response.json().catch(() => null)

      if (!response.ok) {
        throw new Error(result?.error || "Erro ao enviar catalogo")
      }

      await mutate(catalogKey, result, false)
      toast.success("Catalogo enviado.")
    } catch (uploadError) {
      toast.error(uploadError instanceof Error ? uploadError.message : "Erro ao enviar catalogo")
    } finally {
      setUploadingCatalog(false)
      if (catalogInputRef.current) catalogInputRef.current.value = ""
    }
  }

  async function handleCatalogRemove() {
    setUploadingCatalog(true)
    try {
      const response = await fetch(catalogKey, { method: "DELETE" })
      const result = await response.json().catch(() => null)

      if (!response.ok) {
        throw new Error(result?.error || "Erro ao remover catalogo")
      }

      await mutate(catalogKey, null, false)
      toast.success("Catalogo removido.")
    } catch (removeError) {
      toast.error(removeError instanceof Error ? removeError.message : "Erro ao remover catalogo")
    } finally {
      setUploadingCatalog(false)
    }
  }

  const isDisabled = !isWaha && provider === "none"

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
                {isWaha ? (
                  <p className="rounded-lg border bg-muted/20 p-3 text-sm text-muted-foreground">
                    Sua empresa usa o canal WAHA: o modelo de IA e controlado no seu fluxo
                    externo (n8n), nao aqui. Escreva abaixo o prompt do sistema — seu fluxo
                    pode buscar esse texto automaticamente em <code>/api/bot/n8n-prompt</code>.
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
                  </>
                )}

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

                {isWaha ? (
                  <div className="grid gap-2">
                    <Label>Catalogo (PDF ou PNG)</Label>
                    {isLoadingCatalog ? (
                      <Skeleton className="h-16 rounded-lg" />
                    ) : catalogFile ? (
                      <div className="flex items-center gap-3 rounded-lg border bg-muted/20 p-3">
                        <FileText className="size-5 shrink-0 text-muted-foreground" />
                        <div className="min-w-0 flex-1">
                          <p className="truncate text-sm font-medium">{catalogFile.file_name}</p>
                          <a
                            href={catalogFile.url}
                            target="_blank"
                            rel="noopener noreferrer"
                            className="text-xs text-primary hover:underline"
                          >
                            Ver arquivo
                          </a>
                        </div>
                        <Button
                          variant="outline"
                          size="sm"
                          onClick={handleCatalogRemove}
                          disabled={uploadingCatalog}
                        >
                          {uploadingCatalog ? (
                            <Loader2 className="size-4 animate-spin" />
                          ) : (
                            <Trash2 className="size-4 text-destructive" />
                          )}
                        </Button>
                      </div>
                    ) : (
                      <div
                        onClick={() => catalogInputRef.current?.click()}
                        className="flex cursor-pointer flex-col items-center justify-center gap-2 rounded-lg border border-dashed p-6 text-center hover:bg-muted/20"
                      >
                        {uploadingCatalog ? (
                          <Loader2 className="size-6 animate-spin text-muted-foreground" />
                        ) : (
                          <Upload className="size-6 text-muted-foreground/50" />
                        )}
                        <p className="text-sm text-muted-foreground">
                          {uploadingCatalog ? "Enviando..." : "Clique para enviar o PDF ou PNG do catalogo"}
                        </p>
                      </div>
                    )}
                    <input
                      ref={catalogInputRef}
                      type="file"
                      accept="application/pdf,image/png,image/jpeg,image/jpg"
                      className="hidden"
                      onChange={handleCatalogUpload}
                      disabled={uploadingCatalog}
                    />
                    <p className="text-xs text-muted-foreground">
                      Seu fluxo externo (n8n) pode buscar este arquivo automaticamente em{" "}
                      <code>/api/bot/n8n-prompt</code>.
                    </p>
                  </div>
                ) : null}

                {!isWaha ? (
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
                ) : null}
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
