import type { LeadClassification } from "@/lib/google-places"

export const LEAD_STATUSES = [
  "Novo",
  "Contatado",
  "Interessado",
  "Sem interesse",
  "Fechado",
] as const

export type LeadStatus = (typeof LEAD_STATUSES)[number]

export type LeadListItem = {
  id: string
  nome: string
  classificacao: LeadClassification
  site: string | null
  telefone: string | null
  endereco: string | null
  avaliacao: number | null
  num_avaliacoes: number | null
  link_maps: string | null
  status: string
  nicho: string
  cidade: string
  created_at: string
}
