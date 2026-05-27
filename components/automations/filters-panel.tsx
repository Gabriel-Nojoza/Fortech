"use client"

import { useState } from "react"
import { Filter, X, FilterX, Plus, Search, Sparkles, Lock, LockOpen, GripVertical } from "lucide-react"
import {
  DndContext,
  closestCenter,
  PointerSensor,
  useSensor,
  useSensors,
  type DragEndEvent,
} from "@dnd-kit/core"
import {
  SortableContext,
  verticalListSortingStrategy,
  useSortable,
  arrayMove,
} from "@dnd-kit/sortable"
import { CSS } from "@dnd-kit/utilities"
import { ScrollArea } from "@/components/ui/scroll-area"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { FilterValueField } from "@/components/automations/filter-value-field"
import { isDateLikeDataType } from "@/lib/quick-filters"
import type { QueryFilter } from "@/lib/types"

type DateFilterMode = "day" | "month" | "year"

function inferDateFilterMode(...values: Array<string | undefined>) {
  const normalizedValues = values
    .map((value) => String(value ?? "").trim())
    .filter(Boolean)

  if (normalizedValues.some((value) => /^\d{4}-\d{2}-\d{2}$/.test(value))) {
    return "day" satisfies DateFilterMode
  }

  if (normalizedValues.some((value) => /^\d{4}-\d{2}$/.test(value))) {
    return "month" satisfies DateFilterMode
  }

  if (normalizedValues.some((value) => /^\d{4}$/.test(value))) {
    return "year" satisfies DateFilterMode
  }

  return "day" satisfies DateFilterMode
}

function normalizeDateFilterValueForMode(value: string, mode: DateFilterMode) {
  const trimmed = value.trim()
  if (!trimmed) return ""

  switch (mode) {
    case "year":
      if (/^\d{4}$/.test(trimmed)) return trimmed
      if (/^\d{4}-\d{2}$/.test(trimmed)) return trimmed.slice(0, 4)
      if (/^\d{4}-\d{2}-\d{2}$/.test(trimmed)) return trimmed.slice(0, 4)
      return ""
    case "month":
      if (/^\d{4}-\d{2}$/.test(trimmed)) return trimmed
      if (/^\d{4}-\d{2}-\d{2}$/.test(trimmed)) return trimmed.slice(0, 7)
      if (/^\d{4}$/.test(trimmed)) return `${trimmed}-01`
      return ""
    case "day":
    default:
      if (/^\d{4}-\d{2}-\d{2}$/.test(trimmed)) return trimmed
      if (/^\d{4}-\d{2}$/.test(trimmed)) return `${trimmed}-01`
      if (/^\d{4}$/.test(trimmed)) return `${trimmed}-01-01`
      return ""
  }
}

function sanitizeYearInput(value: string) {
  return value.replace(/\D/g, "").slice(0, 4)
}

function DateFilterInputs({
  filter,
  onUpdateFilter,
}: {
  filter: QueryFilter
  onUpdateFilter: (id: string, field: string, value: string) => void
}) {
  const [mode, setMode] = useState<DateFilterMode>(() =>
    inferDateFilterMode(filter.value, filter.valueTo)
  )

  const displayedValueTo = filter.valueTo ?? filter.value
  const shouldSyncEndWithStart =
    filter.valueTo === undefined || filter.valueTo === filter.value

  const handleModeChange = (nextMode: DateFilterMode) => {
    if (nextMode === mode) return

    setMode(nextMode)
    onUpdateFilter(
      filter.id,
      "value",
      normalizeDateFilterValueForMode(filter.value, nextMode)
    )
    onUpdateFilter(
      filter.id,
      "valueTo",
      normalizeDateFilterValueForMode(displayedValueTo, nextMode)
    )
  }

  const handleStartChange = (nextValue: string) => {
    onUpdateFilter(filter.id, "value", nextValue)

    if (shouldSyncEndWithStart) {
      onUpdateFilter(filter.id, "valueTo", nextValue)
    }
  }

  const handleEndChange = (nextValue: string) => {
    onUpdateFilter(filter.id, "valueTo", nextValue)
  }

  const labels =
    mode === "year"
      ? { start: "Ano inicial", end: "Ano final" }
      : mode === "month"
        ? { start: "Mes inicial", end: "Mes final" }
        : { start: "Data inicial", end: "Data final" }

  return (
    <div className="space-y-2">
      <div className="grid grid-cols-3 gap-1 rounded-lg border border-border bg-muted/20 p-1">
        <Button
          type="button"
          variant={mode === "day" ? "secondary" : "ghost"}
          size="sm"
          className="h-7 text-[10px]"
          onClick={() => handleModeChange("day")}
        >
          Dia
        </Button>
        <Button
          type="button"
          variant={mode === "month" ? "secondary" : "ghost"}
          size="sm"
          className="h-7 text-[10px]"
          onClick={() => handleModeChange("month")}
        >
          Mes
        </Button>
        <Button
          type="button"
          variant={mode === "year" ? "secondary" : "ghost"}
          size="sm"
          className="h-7 text-[10px]"
          onClick={() => handleModeChange("year")}
        >
          Ano
        </Button>
      </div>

      <div className="grid gap-2 sm:grid-cols-2">
        <div className="space-y-1">
          <span className="text-[10px] uppercase tracking-wide text-muted-foreground">
            {labels.start}
          </span>
          {mode === "year" ? (
            <Input
              type="text"
              inputMode="numeric"
              maxLength={4}
              value={filter.value}
              onChange={(e) => handleStartChange(sanitizeYearInput(e.target.value))}
              placeholder="2026"
              className="h-8 text-xs"
            />
          ) : (
            <Input
              type={mode === "month" ? "month" : "date"}
              value={filter.value}
              onChange={(e) => handleStartChange(e.target.value)}
              className="h-8 text-xs"
            />
          )}
        </div>

        <div className="space-y-1">
          <span className="text-[10px] uppercase tracking-wide text-muted-foreground">
            {labels.end}
          </span>
          {mode === "year" ? (
            <Input
              type="text"
              inputMode="numeric"
              maxLength={4}
              value={displayedValueTo}
              onChange={(e) => handleEndChange(sanitizeYearInput(e.target.value))}
              placeholder="2026"
              className="h-8 text-xs"
            />
          ) : (
            <Input
              type={mode === "month" ? "month" : "date"}
              value={displayedValueTo}
              onChange={(e) => handleEndChange(e.target.value)}
              className="h-8 text-xs"
            />
          )}
        </div>
      </div>

      <p className="text-[10px] text-muted-foreground">
        {mode === "year"
          ? "Informe somente o ano. Deixe o final vazio para usar intervalo aberto."
          : mode === "month"
            ? "Use mes e ano sem precisar informar o dia. Deixe o final vazio para usar intervalo aberto."
            : "Deixe a data final vazia para usar intervalo aberto."}
      </p>
    </div>
  )
}

function SortableFilterItem({
  filter,
  datasetId,
  executionDatasetId,
  executionWorkspaceId,
  autoOpenFilterSignal,
  onUpdateFilter,
  onRemoveFilter,
  onLockFilter,
}: {
  filter: QueryFilter
  datasetId: string
  executionDatasetId?: string
  executionWorkspaceId?: string | null
  autoOpenFilterSignal?: string | null
  onUpdateFilter: (id: string, field: string, value: string) => void
  onRemoveFilter: (id: string) => void
  onLockFilter: (id: string, locked: boolean) => void
}) {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } =
    useSortable({ id: filter.id })
  const style = {
    transform: CSS.Transform.toString(transform),
    transition,
    opacity: isDragging ? 0.5 : 1,
  }
  const isDateFilter = isDateLikeDataType(filter.dataType)

  return (
    <div
      ref={setNodeRef}
      style={style}
      className="rounded-xl border border-border bg-background/50 p-3 shadow-sm"
    >
      <div className="mb-2 flex items-center justify-between">
        <div className="flex min-w-0 flex-1 items-center gap-1.5">
          <button
            type="button"
            className="shrink-0 cursor-grab touch-none text-muted-foreground/50 hover:text-muted-foreground active:cursor-grabbing"
            {...attributes}
            {...listeners}
          >
            <GripVertical className="size-3.5" />
          </button>
          <div className="min-w-0">
            <div className="flex items-center gap-1">
              {filter.locked && <Lock className="size-3 shrink-0 text-amber-500" />}
              <span className="block truncate text-xs font-semibold text-primary">
                {filter.columnName}
              </span>
            </div>
            <span className="block text-[10px] uppercase tracking-wide text-muted-foreground">
              {filter.tableName}
            </span>
          </div>
        </div>

        <div className="flex items-center gap-0.5">
          <Button
            variant="ghost"
            size="icon"
            className="size-5"
            title={filter.locked ? "Destravar filtro" : "Travar filtro"}
            onClick={() => onLockFilter(filter.id, !filter.locked)}
          >
            {filter.locked ? (
              <Lock className="size-3 text-amber-500" />
            ) : (
              <LockOpen className="size-3 text-muted-foreground" />
            )}
          </Button>

          {!filter.locked && (
            <Button
              variant="ghost"
              size="icon"
              className="size-5"
              onClick={() => onRemoveFilter(filter.id)}
            >
              <X className="size-3" />
            </Button>
          )}
        </div>
      </div>

      <div className={filter.locked ? "pointer-events-none select-none opacity-50" : undefined}>
        {isDateFilter ? (
          <DateFilterInputs filter={filter} onUpdateFilter={onUpdateFilter} />
        ) : (
          <div className="flex gap-1.5">
            <FilterValueField
              filter={filter}
              datasetId={datasetId}
              executionDatasetId={executionDatasetId}
              executionWorkspaceId={executionWorkspaceId}
              autoOpenSignal={
                autoOpenFilterSignal?.startsWith(`${filter.id}:`)
                  ? autoOpenFilterSignal
                  : null
              }
              onUpdateFilter={onUpdateFilter}
            />
          </div>
        )}
      </div>
    </div>
  )
}

interface FiltersPanelProps {
  quickFilters: Array<{
    key: string
    label: string
    description: string
    mapped: boolean
    dataType: string
    activeCount: number
  }>
  onAddQuickFilter: (key: string) => void
  filters: QueryFilter[]
  datasetId: string
  executionDatasetId?: string
  executionWorkspaceId?: string | null
  autoOpenFilterSignal?: string | null
  onUpdateFilter: (id: string, field: string, value: string) => void
  onRemoveFilter: (id: string) => void
  onLockFilter: (id: string, locked: boolean) => void
  onReorderFilters: (ids: string[]) => void
  onClearAll: () => void
}

export function FiltersPanel({
  quickFilters,
  onAddQuickFilter,
  filters,
  datasetId,
  executionDatasetId,
  executionWorkspaceId,
  autoOpenFilterSignal,
  onUpdateFilter,
  onRemoveFilter,
  onLockFilter,
  onReorderFilters,
  onClearAll,
}: FiltersPanelProps) {
  const sensors = useSensors(useSensor(PointerSensor, { activationConstraint: { distance: 5 } }))

  function handleDragEnd(event: DragEndEvent) {
    const { active, over } = event
    if (!over || active.id === over.id) return
    const oldIndex = filters.findIndex((f) => f.id === active.id)
    const newIndex = filters.findIndex((f) => f.id === over.id)
    if (oldIndex === -1 || newIndex === -1) return
    const reordered = arrayMove(filters, oldIndex, newIndex)
    onReorderFilters(reordered.map((f) => f.id))
  }
  return (
    <div className="flex h-full flex-col">
      <div className="flex items-center justify-between border-b border-border px-3 py-2">
        <div className="flex items-center gap-2">
          <div className="flex size-6 items-center justify-center rounded-md bg-primary/10">
            <Filter className="size-3.5 text-primary" />
          </div>
          <div>
            <h3 className="text-sm font-semibold">FILTROS</h3>
            <p className="text-[10px] uppercase tracking-[0.2em] text-muted-foreground/70">
              Refinar consulta
            </p>
          </div>
          {filters.length > 0 && (
            <span className="rounded-full bg-primary/10 px-2 py-0.5 text-xs font-medium text-primary">
              {filters.length}
            </span>
          )}
        </div>

        {filters.some((f) => !f.locked) && (
          <Button
            variant="ghost"
            size="sm"
            onClick={onClearAll}
            className="h-6 text-xs text-destructive hover:text-destructive"
          >
            Limpar
          </Button>
        )}
      </div>

      <ScrollArea className="flex-1 overflow-auto">
        <div className="space-y-3 p-3">
          <div className="rounded-xl border border-border bg-muted/20 p-3">
            <div className="mb-3 flex items-center gap-2">
              <div className="flex size-6 items-center justify-center rounded-md bg-primary/10">
                <Search className="size-3.5 text-primary" />
              </div>
              <div>
                <span className="text-xs font-semibold uppercase tracking-wide text-foreground">
                  Filtros Ativos
                </span>
                <p className="text-[11px] text-muted-foreground">
                  Ajuste operadores e valores da consulta
                </p>
              </div>
            </div>

            {filters.length === 0 ? (
              <div className="flex flex-col items-center justify-center rounded-xl border border-dashed border-border/70 bg-background/30 px-4 py-8 text-center text-muted-foreground">
                <FilterX className="mb-2 size-8 opacity-40" />
                <p className="text-xs font-medium">Nenhum filtro ativo</p>
                <p className="mt-1 text-[11px]">
                  Use os filtros rapidos acima ou clique no funil ao lado da coluna.
                </p>
              </div>
            ) : (
              <DndContext
                sensors={sensors}
                collisionDetection={closestCenter}
                onDragEnd={handleDragEnd}
              >
                <SortableContext
                  items={filters.map((f) => f.id)}
                  strategy={verticalListSortingStrategy}
                >
                  <div className="space-y-2">
                    {filters.map((filter) => (
                      <SortableFilterItem
                        key={filter.id}
                        filter={filter}
                        datasetId={datasetId}
                        executionDatasetId={executionDatasetId}
                        executionWorkspaceId={executionWorkspaceId}
                        autoOpenFilterSignal={autoOpenFilterSignal}
                        onUpdateFilter={onUpdateFilter}
                        onRemoveFilter={onRemoveFilter}
                        onLockFilter={onLockFilter}
                      />
                    ))}
                  </div>
                </SortableContext>
              </DndContext>
            )}
          </div>
        </div>
      </ScrollArea>
    </div>
  )
}
