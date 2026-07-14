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
import { Switch } from "@/components/ui/switch"
import { Textarea } from "@/components/ui/textarea"
import { Skeleton } from "@/components/ui/skeleton"
import {
  BOT_WEEKDAYS,
  BOT_WEEKDAY_LABELS,
  type BotBusinessHours,
  type BotWeekday,
  type BotWeekdayHours,
} from "@/lib/bot"

const fetcher = async (url: string) => {
  const response = await fetch(url)
  const data = await response.json()

  if (!response.ok) {
    throw new Error(data?.error || "Erro ao carregar dados")
  }

  return data
}

export default function BotHoursPage() {
  const key = "/api/bot/business-hours"
  const { data, isLoading, error } = useSWR<BotBusinessHours>(key, fetcher)
  const [hours, setHours] = useState<Record<BotWeekday, BotWeekdayHours> | null>(null)
  const [closedMessage, setClosedMessage] = useState("")
  const [saving, setSaving] = useState(false)

  useEffect(() => {
    if (data) {
      setHours(data.hours)
      setClosedMessage(data.closed_message)
    }
  }, [data])

  function updateDay(day: BotWeekday, patch: Partial<BotWeekdayHours>) {
    setHours((current) => {
      if (!current) return current
      return { ...current, [day]: { ...current[day], ...patch } }
    })
  }

  async function handleSave() {
    if (!hours) return
    setSaving(true)
    try {
      const response = await fetch(key, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ hours, closed_message: closedMessage }),
      })
      const result = await response.json().catch(() => null)

      if (!response.ok) {
        throw new Error(
          typeof result?.error === "string" ? result.error : "Erro ao salvar horarios"
        )
      }

      await mutate(key)
      toast.success("Horarios salvos.")
    } catch (saveError) {
      toast.error(saveError instanceof Error ? saveError.message : "Erro ao salvar horarios")
    } finally {
      setSaving(false)
    }
  }

  return (
    <div className="flex flex-1 flex-col">
      <PageHeader
        title="Horarios"
        description="Configure os horarios de funcionamento e a mensagem fora do expediente."
      />

      <div className="p-4 sm:p-6">
        <Card>
          <CardContent className="space-y-4 pt-6">
            {isLoading || !hours ? (
              <div className="space-y-3">
                {Array.from({ length: 7 }).map((_, index) => (
                  <Skeleton key={index} className="h-12 rounded-lg" />
                ))}
              </div>
            ) : error ? (
              <p className="text-sm text-muted-foreground">
                {error instanceof Error ? error.message : "Erro ao carregar horarios."}
              </p>
            ) : (
              <>
                <div className="space-y-3">
                  {BOT_WEEKDAYS.map((day) => (
                    <div
                      key={day}
                      className="flex flex-wrap items-center gap-3 rounded-xl border bg-muted/20 p-3"
                    >
                      <div className="flex w-32 items-center gap-2">
                        <Switch
                          checked={hours[day].enabled}
                          onCheckedChange={(checked) => updateDay(day, { enabled: checked })}
                        />
                        <span className="text-sm font-medium">{BOT_WEEKDAY_LABELS[day]}</span>
                      </div>
                      <Input
                        type="time"
                        value={hours[day].open}
                        onChange={(event) => updateDay(day, { open: event.target.value })}
                        disabled={!hours[day].enabled}
                        className="w-32"
                      />
                      <span className="text-sm text-muted-foreground">ate</span>
                      <Input
                        type="time"
                        value={hours[day].close}
                        onChange={(event) => updateDay(day, { close: event.target.value })}
                        disabled={!hours[day].enabled}
                        className="w-32"
                      />
                    </div>
                  ))}
                </div>

                <div className="grid gap-2">
                  <Label htmlFor="closed-message">Mensagem fora do expediente</Label>
                  <Textarea
                    id="closed-message"
                    value={closedMessage}
                    onChange={(event) => setClosedMessage(event.target.value)}
                    rows={3}
                  />
                </div>
              </>
            )}

            <div className="flex justify-end">
              <Button onClick={handleSave} disabled={saving || isLoading || !hours}>
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
