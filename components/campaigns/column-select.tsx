"use client"

import { useState } from "react"
import { Check, ChevronsUpDown } from "lucide-react"
import { Button } from "@/components/ui/button"
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover"
import {
  Command,
  CommandEmpty,
  CommandGroup,
  CommandInput,
  CommandItem,
  CommandList,
} from "@/components/ui/command"
import { cn } from "@/lib/utils"

type Props = {
  columns: string[]
  value: string
  onChange: (value: string) => void
  placeholder?: string
  disabled?: boolean
  error?: boolean
}

export function ColumnSelect({
  columns,
  value,
  onChange,
  placeholder = "Selecionar coluna",
  disabled = false,
  error = false,
}: Props) {
  const [open, setOpen] = useState(false)
  const sorted = [...columns].sort((a, b) => a.localeCompare(b))

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <Button
          variant="outline"
          role="combobox"
          aria-expanded={open}
          disabled={disabled}
          className={cn(
            "w-full justify-between font-normal",
            !value && "text-muted-foreground",
            error && "border-destructive"
          )}
        >
          <span className="truncate">{value || placeholder}</span>
          <ChevronsUpDown className="ml-2 size-4 shrink-0 opacity-50" />
        </Button>
      </PopoverTrigger>
      <PopoverContent className="w-[--radix-popover-trigger-width] p-0" align="start">
        <Command>
          <CommandInput placeholder="Buscar coluna..." />
          <CommandList
            onWheelCapture={(e) => {
              const el = e.currentTarget
              el.scrollTop += e.deltaY * 0.4
              e.preventDefault()
              e.stopPropagation()
            }}
          >
            <CommandEmpty>Nenhuma coluna encontrada.</CommandEmpty>
            <CommandGroup>
              {sorted.map((col) => (
                <CommandItem
                  key={col}
                  value={col}
                  onSelect={(selected) => {
                    onChange(selected === value ? "" : selected)
                    setOpen(false)
                  }}
                >
                  <Check
                    className={cn(
                      "mr-2 size-4 shrink-0",
                      value === col ? "opacity-100" : "opacity-0"
                    )}
                  />
                  <span className="truncate">{col}</span>
                </CommandItem>
              ))}
            </CommandGroup>
          </CommandList>
        </Command>
      </PopoverContent>
    </Popover>
  )
}
