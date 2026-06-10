import { NextRequest, NextResponse } from "next/server"
import { createServiceClient } from "@/lib/supabase/server"
import { getRequestContext, isAuthContextError } from "@/lib/tenant"
import { getAccessToken, executeDAXQuery } from "@/lib/powerbi"
import { buildCampaignDaxQuery } from "@/lib/campaign-dax"
import type { CampaignClient } from "@/lib/types"

function normalizePhone(raw: unknown): string | null {
  if (!raw) return null
  const phone = String(raw).replace(/\D/g, "")
  return phone.length >= 8 ? phone : null
}

export async function POST(request: NextRequest) {
  try {
    const ctx = await getRequestContext()
    const body = await request.json()
    const campaignId = typeof body?.campaign_id === "string" ? body.campaign_id.trim() : ""

    if (!campaignId) {
      return NextResponse.json({ error: "campaign_id obrigatorio" }, { status: 400 })
    }

    const supabase = createServiceClient()
    const { data: campaign, error: campaignError } = await supabase
      .from("campaigns")
      .select("*")
      .eq("id", campaignId)
      .eq("company_id", ctx.companyId)
      .single()

    if (campaignError || !campaign) {
      return NextResponse.json({ error: "Campanha nao encontrada" }, { status: 404 })
    }

    const daxQuery = buildCampaignDaxQuery(campaign)

    if (!daxQuery) {
      return NextResponse.json({ clients: [], columns: [] })
    }

    const token = await getAccessToken(ctx.companyId)
    const queryResult = await executeDAXQuery(token, campaign.dataset_id, daxQuery)
    const rows = queryResult.rows ?? []
    const columns: Array<{ name: string; dataType: string }> = queryResult.columns ?? []

    const clients: CampaignClient[] = rows.map((row) => ({
      name: row["nome"] != null ? String(row["nome"]) : null,
      phone: normalizePhone(row["telefone"]),
      data: row,
    }))

    return NextResponse.json({ clients, columns: columns.map((c) => c.name) })
  } catch (error) {
    if (isAuthContextError(error)) {
      return NextResponse.json({ error: "Nao autenticado" }, { status: 401 })
    }
    const message = error instanceof Error ? error.message : "Erro ao buscar clientes"
    return NextResponse.json({ error: message }, { status: 500 })
  }
}
