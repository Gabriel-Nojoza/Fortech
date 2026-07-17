import { NextRequest, NextResponse } from "next/server"
import { createServiceClient } from "@/lib/supabase/server"
import { requirePlatformAdminContext } from "@/lib/tenant"
import {
  GooglePlacesApiError,
  searchGooglePlacesLeads,
  sortLeadsByClassification,
} from "@/lib/google-places"
import { LEAD_STATUSES, type LeadListItem, type LeadStatus } from "@/lib/leads"

const DEFAULT_MAX = 60
const MAX_LIMIT = 60
const CACHE_TTL_DAYS = 7

function normalizeSearchTerm(value: string | null) {
  return (value ?? "").trim().toLowerCase().replace(/\s+/g, " ")
}

function getAdminClient() {
  return createServiceClient()
}

async function readLeadsFromDb(supabase: ReturnType<typeof getAdminClient>, nicho: string, cidade: string) {
  const { data, error } = await supabase
    .from("leads")
    .select("*")
    .eq("nicho", nicho)
    .eq("cidade", cidade)

  if (error) {
    throw error
  }

  return sortLeadsByClassification((data ?? []) as LeadListItem[])
}

export async function GET(request: NextRequest) {
  try {
    await requirePlatformAdminContext()

    const { searchParams } = new URL(request.url)
    const rawNicho = searchParams.get("nicho")
    const rawCidade = searchParams.get("cidade")
    const rawMax = searchParams.get("max")

    const nicho = normalizeSearchTerm(rawNicho)
    const cidade = normalizeSearchTerm(rawCidade)

    if (!nicho || !cidade) {
      return NextResponse.json(
        { error: "Os parametros 'nicho' e 'cidade' sao obrigatorios." },
        { status: 400 }
      )
    }

    const parsedMax = Number.parseInt(rawMax ?? "", 10)
    const max = Number.isFinite(parsedMax) && parsedMax > 0
      ? Math.min(parsedMax, MAX_LIMIT)
      : DEFAULT_MAX

    const supabase = getAdminClient()

    const { data: searchRow, error: searchError } = await supabase
      .from("lead_searches")
      .select("searched_at")
      .eq("nicho", nicho)
      .eq("cidade", cidade)
      .maybeSingle()

    if (searchError) {
      throw searchError
    }

    const cacheAgeMs = searchRow?.searched_at
      ? Date.now() - new Date(searchRow.searched_at).getTime()
      : null
    const isCacheFresh = cacheAgeMs !== null && cacheAgeMs < CACHE_TTL_DAYS * 24 * 60 * 60 * 1000

    if (isCacheFresh) {
      const cachedLeads = await readLeadsFromDb(supabase, nicho, cidade)
      return NextResponse.json(cachedLeads)
    }

    const googleLeads = await searchGooglePlacesLeads({ nicho, cidade, max })

    if (googleLeads.length > 0) {
      const now = new Date().toISOString()
      const { error: upsertError } = await supabase.from("leads").upsert(
        googleLeads.map((lead) => ({
          id: lead.id,
          nome: lead.nome,
          classificacao: lead.classificacao,
          site: lead.site,
          telefone: lead.telefone,
          endereco: lead.endereco,
          avaliacao: lead.avaliacao,
          num_avaliacoes: lead.num_avaliacoes,
          link_maps: lead.link_maps,
          nicho,
          cidade,
          updated_at: now,
          // "status" propositalmente omitido: preserva o status ja definido
          // para leads existentes e usa o default 'Novo' para leads novos.
        })),
        { onConflict: "id" }
      )

      if (upsertError) {
        throw upsertError
      }
    }

    const { error: upsertSearchError } = await supabase.from("lead_searches").upsert(
      { nicho, cidade, searched_at: new Date().toISOString() },
      { onConflict: "nicho,cidade" }
    )

    if (upsertSearchError) {
      throw upsertSearchError
    }

    const leads = await readLeadsFromDb(supabase, nicho, cidade)
    return NextResponse.json(leads)
  } catch (error) {
    if (error instanceof GooglePlacesApiError) {
      return NextResponse.json({ error: error.message }, { status: error.status })
    }

    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Erro ao buscar leads" },
      { status: 500 }
    )
  }
}

export async function PATCH(request: NextRequest) {
  try {
    await requirePlatformAdminContext()

    const body = await request.json().catch(() => null)
    const id = typeof body?.id === "string" ? body.id.trim() : ""
    const status = typeof body?.status === "string" ? body.status.trim() : ""

    if (!id || !status) {
      return NextResponse.json(
        { error: "Os campos 'id' e 'status' sao obrigatorios." },
        { status: 400 }
      )
    }

    if (!LEAD_STATUSES.includes(status as LeadStatus)) {
      return NextResponse.json(
        { error: `Status invalido. Use um de: ${LEAD_STATUSES.join(", ")}.` },
        { status: 400 }
      )
    }

    const supabase = getAdminClient()
    const { data, error } = await supabase
      .from("leads")
      .update({ status, updated_at: new Date().toISOString() })
      .eq("id", id)
      .select()
      .maybeSingle()

    if (error) {
      throw error
    }

    if (!data) {
      return NextResponse.json({ error: "Lead nao encontrado" }, { status: 404 })
    }

    return NextResponse.json(data)
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Erro ao atualizar status do lead" },
      { status: 500 }
    )
  }
}
