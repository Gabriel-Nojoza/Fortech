"use client"

import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { cn } from "@/lib/utils"

type CalendarDataPoint = {
  date: string
  delivered: number
  failed: number
  ongoing: number
  total: number
  successRate: number | null
}

const WEEKDAY_LABELS = ["Dom", "Seg", "Ter", "Qua", "Qui", "Sex", "Sab"]

function toCalendarDate(value: string) {
  return new Date(`${value}T12:00:00`)
}

function formatMonthLabel(value: string) {
  const date = toCalendarDate(value)
  const label = new Intl.DateTimeFormat("pt-BR", {
    month: "long",
    year: "numeric",
  }).format(date)

  return label.charAt(0).toUpperCase() + label.slice(1)
}

function getDayTone(point: CalendarDataPoint) {
  if (point.total === 0) {
    return "border-border/70 bg-background"
  }

  const deliveredWeight = Math.min(point.delivered * 0.08, 0.24)
  const failedWeight = Math.min(point.failed * 0.08, 0.2)

  if ((point.successRate ?? 0) >= 80) {
    return `border-emerald-500/30 bg-emerald-500/${Math.round(
      (0.1 + deliveredWeight) * 100
    )}`
  }

  if (point.failed > point.delivered) {
    return `border-red-500/30 bg-red-500/${Math.round((0.08 + failedWeight) * 100)}`
  }

  return "border-amber-500/30 bg-amber-500/10"
}

export function DispatchCalendar({ data }: { data: CalendarDataPoint[] }) {
  const points = [...data].sort((a, b) => a.date.localeCompare(b.date))
  const firstPoint = points[0] ?? null
  const monthLabel = firstPoint ? formatMonthLabel(firstPoint.date) : "Mes atual"
  const firstDayIndex = firstPoint ? toCalendarDate(firstPoint.date).getDay() : 0
  const leadingEmptyDays = Array.from({ length: firstDayIndex })
  const totalDelivered = points.reduce((sum, point) => sum + point.delivered, 0)
  const totalFailed = points.reduce((sum, point) => sum + point.failed, 0)

  return (
    <Card>
      <CardHeader className="gap-2">
        <div className="flex flex-col gap-1 sm:flex-row sm:items-center sm:justify-between">
          <CardTitle className="text-base">Calendario de Disparos</CardTitle>
          <p className="text-sm text-muted-foreground">{monthLabel}</p>
        </div>
        <div className="flex flex-wrap items-center gap-3 text-xs text-muted-foreground">
          <span className="inline-flex items-center gap-1.5">
            <span className="size-2.5 rounded-full bg-emerald-500" />
            {totalDelivered} enviados
          </span>
          <span className="inline-flex items-center gap-1.5">
            <span className="size-2.5 rounded-full bg-red-500" />
            {totalFailed} falharam
          </span>
        </div>
      </CardHeader>
      <CardContent>
        <div className="overflow-x-auto">
          <div className="grid min-w-[760px] grid-cols-7 gap-2">
            {WEEKDAY_LABELS.map((label) => (
              <div
                key={label}
                className="px-2 pb-1 text-center text-xs font-medium uppercase tracking-wide text-muted-foreground"
              >
                {label}
              </div>
            ))}

            {leadingEmptyDays.map((_, index) => (
              <div
                key={`empty-${index}`}
                className="min-h-[118px] rounded-xl border border-dashed border-border/60 bg-muted/10"
              />
            ))}

            {points.map((point) => {
              const date = toCalendarDate(point.date)
              const dayNumber = date.getDate()

              return (
                <div
                  key={point.date}
                  className={cn(
                    "min-h-[118px] rounded-xl border p-3 transition-colors",
                    getDayTone(point)
                  )}
                >
                  <div className="flex items-start justify-between gap-2">
                    <span className="text-sm font-semibold text-foreground">
                      {dayNumber}
                    </span>
                    <span className="rounded-full bg-background/80 px-2 py-0.5 text-[11px] font-medium text-foreground shadow-sm">
                      {point.successRate === null ? "--" : `${point.successRate}%`}
                    </span>
                  </div>

                  <div className="pt-4 text-[11px] text-muted-foreground">
                    {point.total > 0
                      ? `${point.total} disparo${point.total === 1 ? "" : "s"}`
                      : "Sem envios"}
                  </div>

                  <div className="mt-4 space-y-1.5 text-xs">
                    <div className="flex items-center justify-between gap-2">
                      <span className="inline-flex items-center gap-1.5 text-foreground/85">
                        <span className="size-2.5 rounded-full bg-emerald-500" />
                        Enviados
                      </span>
                      <span className="font-semibold text-foreground">
                        {point.delivered}
                      </span>
                    </div>
                    <div className="flex items-center justify-between gap-2">
                      <span className="inline-flex items-center gap-1.5 text-foreground/85">
                        <span className="size-2.5 rounded-full bg-red-500" />
                        Falhas
                      </span>
                      <span className="font-semibold text-foreground">
                        {point.failed}
                      </span>
                    </div>
                  </div>
                </div>
              )
            })}
          </div>
        </div>
      </CardContent>
    </Card>
  )
}
