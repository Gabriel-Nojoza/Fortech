import { NextResponse } from "next/server"
import { createServiceClient } from "@/lib/supabase/server"
import { requireAdminContext } from "@/lib/tenant"
import { getAccessToken, getDatasetMetadata } from "@/lib/powerbi"
import { saveCatalogEntry } from "@/lib/automation-catalog"

async function syncCompany(supabase: ReturnType<typeof createServiceClient>, companyId: string, bodyDatasetIds?: string[]) {
  // Busca os dataset IDs configurados no chat da empresa
  const { data: settingRow } = await supabase
    .from("company_settings")
    .select("value")
    .eq("company_id", companyId)
    .eq("key", "general")
    .maybeSingle()

  const generalVal = settingRow?.value as Record<string, unknown> | null
  const configuredIds: string[] = Array.isArray(generalVal?.chat_dataset_ids)
    ? (generalVal.chat_dataset_ids as unknown[]).filter((v): v is string => typeof v === "string")
    : []

  const datasetIds: string[] = Array.isArray(bodyDatasetIds) && bodyDatasetIds.length > 0
    ? bodyDatasetIds
    : configuredIds

  if (datasetIds.length === 0) {
    return { skipped: true, reason: "Nenhum dataset configurado no chat" }
  }

  const token = await getAccessToken(companyId)
  const syncedAt = new Date().toISOString()
  const results: Array<{
    dataset_id: string
    status: "ok" | "error"
    table_count?: number
    column_count?: number
    measure_count?: number
    error?: string
  }> = []

  for (const datasetId of datasetIds) {
    try {
      const metadata = await getDatasetMetadata(token, datasetId)

      await saveCatalogEntry(companyId, datasetId, {
        updated_at: syncedAt,
        catalog: {
          tables: metadata.tables,
          columns: metadata.columns,
          measures: metadata.measures,
        },
      })

      results.push({
        dataset_id: datasetId,
        status: "ok",
        table_count: metadata.tables.length,
        column_count: metadata.columns.length,
        measure_count: metadata.measures.length,
      })
    } catch (err) {
      results.push({
        dataset_id: datasetId,
        status: "error",
        error: err instanceof Error ? err.message : "Erro desconhecido",
      })
    }
  }

  return { results, synced_at: syncedAt }
}

export async function POST(request: Request) {
  try {
    const supabase = createServiceClient()
    const body = await request.json().catch(() => ({}))

    // Autenticação: aceita session de admin OU x-sync-secret (para n8n/cron)
    const syncSecret = request.headers.get("x-sync-secret")
    const expectedSecret = process.env.CATALOG_SYNC_SECRET

    const isSecretAuth = expectedSecret && syncSecret === expectedSecret

    if (!isSecretAuth) {
      // Tenta autenticação via sessão de usuário admin
      await requireAdminContext()
    }

    // Modo: sincronizar todas as empresas com chat ativo
    if (body?.all_companies === true) {
      const { data: rows } = await supabase
        .from("company_settings")
        .select("company_id, value")
        .eq("key", "general")

      const companies = (rows ?? []).filter((row) => {
        const val = row.value as Record<string, unknown> | null
        return Array.isArray(val?.chat_dataset_ids) && (val.chat_dataset_ids as unknown[]).length > 0
      })

      const allResults: Record<string, unknown> = {}
      for (const row of companies) {
        try {
          allResults[row.company_id] = await syncCompany(supabase, row.company_id)
        } catch (err) {
          allResults[row.company_id] = { error: err instanceof Error ? err.message : "Erro" }
        }
      }

      return NextResponse.json({
        success: true,
        companies_synced: companies.length,
        results: allResults,
      })
    }

    // Modo: sincronizar empresa específica
    const companyId: string = String(body?.company_id ?? "").trim()
    if (!companyId) {
      return NextResponse.json({ error: "Informe company_id ou all_companies: true" }, { status: 400 })
    }

    const result = await syncCompany(supabase, companyId, body?.dataset_ids)

    return NextResponse.json({ success: true, company_id: companyId, ...result })
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Erro ao sincronizar catálogo" },
      { status: 500 }
    )
  }
}
