"use client"

import { useSearchParams } from "next/navigation"
import useSWR, { mutate } from "swr"
import { toast } from "sonner"
import { PageHeader } from "@/components/dashboard/page-header"
import { Badge } from "@/components/ui/badge"
import { Skeleton } from "@/components/ui/skeleton"
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select"
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table"

interface AdminSchedule {
  id: string
  name: string
  is_active: boolean
  cron_expression: string | null
  company_id: string
  companies: { name: string } | null
}

interface CompanyNarration {
  send_mode: "none" | "audio" | "text"
}

const fetcher = (url: string) => fetch(url).then((r) => r.json())

export default function AdminSchedulesPage() {
  const searchParams = useSearchParams()
  const companyId = searchParams.get("empresa")

  const schedulesUrl = companyId
    ? `/api/admin/schedules?company_id=${companyId}`
    : "/api/admin/schedules"

  const narrationUrl = companyId
    ? `/api/admin/company-narration?company_id=${companyId}`
    : null

  const { data: schedules, isLoading } = useSWR<AdminSchedule[]>(
    companyId ? schedulesUrl : null,
    fetcher
  )

  const { data: narration, isLoading: narrationLoading } = useSWR<CompanyNarration>(
    narrationUrl,
    fetcher
  )

  async function handleNarrationChange(send_mode: string) {
    if (!companyId) return
    try {
      const res = await fetch("/api/admin/company-narration", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ company_id: companyId, send_mode }),
      })
      if (!res.ok) throw new Error("Erro ao salvar")
      toast.success("Narração da empresa atualizada")
      mutate(narrationUrl)
    } catch {
      toast.error("Erro ao atualizar narração")
    }
  }

  return (
    <div className="flex flex-col gap-6 p-6">
      <PageHeader
        title="Rotinas"
        description="Gerencie narração em áudio ou texto por empresa"
      />

      {!companyId && (
        <p className="text-sm text-muted-foreground">
          Selecione uma empresa no filtro lateral para ver as rotinas.
        </p>
      )}

      {companyId && (
        <>
          <div className="flex items-center gap-4 rounded-md border p-4">
            <div className="flex flex-col gap-1">
              <span className="text-sm font-medium">Narração da empresa</span>
              <span className="text-xs text-muted-foreground">
                Define como os relatórios desta empresa serão narrados ao ser enviados
              </span>
            </div>
            <div className="ml-auto">
              {narrationLoading ? (
                <Skeleton className="h-9 w-44" />
              ) : (
                <Select
                  value={narration?.send_mode ?? "none"}
                  onValueChange={handleNarrationChange}
                >
                  <SelectTrigger className="w-44">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="none">Não enviar narração</SelectItem>
                    <SelectItem value="audio">Enviar áudio</SelectItem>
                    <SelectItem value="text">Enviar texto</SelectItem>
                  </SelectContent>
                </Select>
              )}
            </div>
          </div>

          <div className="rounded-md border">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Nome</TableHead>
                  <TableHead>Empresa</TableHead>
                  <TableHead>Status</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {isLoading && (
                  Array.from({ length: 4 }).map((_, i) => (
                    <TableRow key={i}>
                      <TableCell><Skeleton className="h-4 w-40" /></TableCell>
                      <TableCell><Skeleton className="h-4 w-32" /></TableCell>
                      <TableCell><Skeleton className="h-4 w-16" /></TableCell>
                    </TableRow>
                  ))
                )}
                {!isLoading && (!schedules || schedules.length === 0) && (
                  <TableRow>
                    <TableCell colSpan={3} className="text-center text-muted-foreground py-8">
                      Nenhuma rotina encontrada
                    </TableCell>
                  </TableRow>
                )}
                {!isLoading && schedules?.map((schedule) => (
                  <TableRow key={schedule.id}>
                    <TableCell className="font-medium">{schedule.name}</TableCell>
                    <TableCell className="text-muted-foreground text-sm">
                      {schedule.companies?.name ?? "—"}
                    </TableCell>
                    <TableCell>
                      {schedule.is_active
                        ? <Badge variant="default">Ativa</Badge>
                        : <Badge variant="outline">Inativa</Badge>
                      }
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>
        </>
      )}
    </div>
  )
}
