"use client"

import { useEffect, useMemo, useState } from "react"
import useSWR from "swr"
import { Check, ChevronsUpDown, Loader2 } from "lucide-react"
import { Button } from "@/components/ui/button"
import {
  Command,
  CommandEmpty,
  CommandGroup,
  CommandInput,
  CommandItem,
  CommandList,
} from "@/components/ui/command"
import { Input } from "@/components/ui/input"
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover"
import { isDateLikeDataType } from "@/lib/quick-filters"
import { cn } from "@/lib/utils"
import type { QueryFilter } from "@/lib/types"

type FilterOptionsResponse = {
  options: string[]
  truncated: boolean
}

const fetcher = async (url: string) => {
  const response = await fetch(url)
  const data = await response.json()

  if (!response.ok) {
    throw new Error(data?.error || "Erro ao carregar opcoes do filtro")
  }

  return data as FilterOptionsResponse
}

function getInputType(dataType: string) {
  const normalized = dataType.toLowerCase()
  if (
    normalized.includes("int") ||
    normalized.includes("double") ||
    normalized.includes("decimal") ||
    normalized.includes("number")
  ) {
    return "number"
  }
  return "text"
}

interface FilterValueFieldProps {
  filter: QueryFilter
  datasetId: string
  executionDatasetId?: string
  executionWorkspaceId?: string | null
  autoOpenSignal?: string | null
  onUpdateFilter: (id: string, field: string, value: string) => void
}

export function FilterValueField({
  filter,
  datasetId,
  executionDatasetId,
  executionWorkspaceId,
  autoOpenSignal,
  onUpdateFilter,
}: FilterValueFieldProps) {
  const [open, setOpen] = useState(false)
  const canLoadOptions = Boolean(datasetId) && !isDateLikeDataType(filter.dataType)
  const optionsUrl = useMemo(() => {
    if (!canLoadOptions) return null
    const params = new URLSearchParams({
      datasetId,
      tableName: filter.tableName,
      columnName: filter.columnName,
      dataType: filter.dataType,
    })
    if (executionDatasetId) params.set("executionDatasetId", executionDatasetId)
    if (executionWorkspaceId) params.set("executionWorkspaceId", executionWorkspaceId)
    return `/api/powerbi/filter-options?${params.toString()}`
  }, [
    canLoadOptions, datasetId, executionDatasetId, executionWorkspaceId,
    filter.columnName, filter.dataType, filter.tableName,
  ])

  const { data, error, isLoading } = useSWR(optionsUrl, fetcher, { revalidateOnFocus: false })

  useEffect(() => {
    if (!autoOpenSignal || !canLoadOptions) return
    setOpen(true)
  }, [autoOpenSignal, canLoadOptions])

  const options = data?.options ?? []
  const showOptionsPicker = canLoadOptions && (isLoading || options.length > 0)

  // Modo excluir: operator === "neq" — os valores selecionados são os EXCLUÍDOS
  const isExcludeMode = filter.operator === "neq"

  const selectedValues = useMemo(
    () => filter.value ? filter.value.split(",").map((v) => v.trim()).filter(Boolean) : [],
    [filter.value]
  )

  function switchMode(mode: "eq" | "neq") {
    onUpdateFilter(filter.id, "operator", mode)
    onUpdateFilter(filter.id, "value", "")
  }

  function toggleOption(option: string) {
    const next = selectedValues.includes(option)
      ? selectedValues.filter((v) => v !== option)
      : [...selectedValues, option]
    // Incluir com todos selecionados = sem filtro (evita FILTER com todos os valores no group-by)
    const nextValue =
      !isExcludeMode && next.length > 0 && next.length === options.length
        ? ""
        : next.join(",")
    onUpdateFilter(filter.id, "value", nextValue)
  }

  if (!showOptionsPicker) {
    return (
      <div className="space-y-1">
        <Input
          type={getInputType(filter.dataType)}
          value={filter.value}
          onChange={(e) => onUpdateFilter(filter.id, "value", e.target.value)}
          placeholder="Valor..."
          className="h-8 flex-1 text-xs"
        />
        {error ? (
          <p className="text-[10px] text-muted-foreground">
            Nao foi possivel carregar a lista. Digite manualmente.
          </p>
        ) : null}
      </div>
    )
  }

  const triggerLabel = isLoading
    ? "Carregando opcoes..."
    : selectedValues.length === 0
      ? isExcludeMode ? "Nenhuma exclusao" : "Selecionar opcao"
      : isExcludeMode
        ? `Excluindo ${selectedValues.length}`
        : selectedValues.length === 1
          ? selectedValues[0]
          : `${selectedValues.length} selecionados`

  return (
    <div className="space-y-2">
      {/* Modo incluir / excluir */}
      <div className="flex gap-1 rounded-lg border border-border bg-muted/20 p-0.5">
        <button
          type="button"
          onClick={() => switchMode("eq")}
          className={cn(
            "flex-1 rounded-md px-2 py-1 text-[10px] font-medium transition-colors",
            !isExcludeMode
              ? "bg-background text-foreground shadow-sm"
              : "text-muted-foreground hover:text-foreground"
          )}
        >
          Incluir
        </button>
        <button
          type="button"
          onClick={() => switchMode("neq")}
          className={cn(
            "flex-1 rounded-md px-2 py-1 text-[10px] font-medium transition-colors",
            isExcludeMode
              ? "bg-destructive/10 text-destructive shadow-sm"
              : "text-muted-foreground hover:text-foreground"
          )}
        >
          Excluir
        </button>
      </div>

      <Popover open={open} onOpenChange={setOpen}>
        <PopoverTrigger asChild>
          <Button
            type="button"
            variant="outline"
            role="combobox"
            aria-expanded={open}
            className={cn(
              "h-8 w-full justify-between px-2 text-xs font-normal",
              isExcludeMode && selectedValues.length > 0 && "border-destructive/40 text-destructive"
            )}
          >
            <span className="truncate text-left">{triggerLabel}</span>
            {isLoading ? (
              <Loader2 className="ml-2 size-3.5 shrink-0 animate-spin text-muted-foreground" />
            ) : (
              <ChevronsUpDown className="ml-2 size-3.5 shrink-0 text-muted-foreground" />
            )}
          </Button>
        </PopoverTrigger>
        <PopoverContent className="w-[320px] p-0" align="start">
          {isExcludeMode && (
            <div className="border-b border-border bg-destructive/5 px-3 py-1.5">
              <p className="text-[10px] text-destructive font-medium">
                Modo excluir — marque os valores a remover do resultado
              </p>
            </div>
          )}
          <Command>
            <CommandInput placeholder={`Buscar ${filter.columnName}...`} />
            <CommandList>
              {isLoading ? (
                <div className="flex items-center justify-center gap-2 px-3 py-6 text-xs text-muted-foreground">
                  <Loader2 className="size-3.5 animate-spin" />
                  Carregando opcoes...
                </div>
              ) : (
                <>
                  <CommandEmpty>Nenhuma opcao encontrada.</CommandEmpty>
                  <CommandGroup>
                    {options.map((option) => {
                      const isSelected = selectedValues.includes(option)
                      return (
                        <CommandItem
                          key={option}
                          value={option}
                          onSelect={() => toggleOption(option)}
                          className={cn(isExcludeMode && isSelected && "text-destructive")}
                        >
                          <Check
                            className={cn(
                              "size-3.5",
                              isExcludeMode && isSelected ? "text-destructive opacity-100" : "",
                              !isExcludeMode && isSelected ? "opacity-100" : "",
                              !isSelected ? "opacity-0" : ""
                            )}
                          />
                          <span className="truncate">{option}</span>
                        </CommandItem>
                      )
                    })}
                  </CommandGroup>
                </>
              )}
            </CommandList>
          </Command>
          {!isLoading && options.length > 0 && (
            <div className="flex items-center justify-between border-t border-border px-3 py-2">
              {isExcludeMode ? (
                <button
                  className="text-[10px] text-muted-foreground hover:text-foreground transition-colors"
                  onClick={() => onUpdateFilter(filter.id, "value", "")}
                >
                  Limpar exclusoes
                </button>
              ) : (
                <button
                  className="text-[10px] text-primary hover:text-primary/80 transition-colors font-medium"
                  onClick={() => onUpdateFilter(filter.id, "value", "")}
                  title="Todos incluídos = sem filtro aplicado"
                >
                  Todos (sem filtro)
                </button>
              )}
              {selectedValues.length > 0 && (
                <button
                  className="text-[10px] text-muted-foreground hover:text-foreground transition-colors"
                  onClick={() => onUpdateFilter(filter.id, "value", "")}
                >
                  Limpar ({selectedValues.length})
                </button>
              )}
            </div>
          )}
        </PopoverContent>
      </Popover>

      {!options.length && !isLoading && (
        <Input
          type={getInputType(filter.dataType)}
          value={filter.value}
          onChange={(e) => onUpdateFilter(filter.id, "value", e.target.value)}
          placeholder="Ou digite manualmente"
          className="h-8 flex-1 text-xs"
        />
      )}

      {data?.truncated ? (
        <p className="text-[10px] text-muted-foreground">
          Mostrando as primeiras 200 opcoes disponiveis.
        </p>
      ) : null}
    </div>
  )
}
