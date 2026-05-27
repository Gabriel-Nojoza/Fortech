import { NextRequest, NextResponse } from "next/server"
import { createServiceClient } from "@/lib/supabase/server"
import { getRequestContext, isAuthContextError } from "@/lib/tenant"
import { getAccessToken, executeDAXQuery } from "@/lib/powerbi"

function normalizePhone(raw: unknown): string | null {
  if (!raw) return null
  const phone = String(raw).replace(/\D/g, "")
  return phone.length >= 8 ? phone : null
}

function buildPreviewDaxQuery(
  customerTable: string,
  dateColumn: string,
  daysInactive: number
): string {
  return [
    "EVALUATE",
    "FILTER(",
    `  '${customerTable}',`,
    `  NOT ISBLANK('${customerTable}'[${dateColumn}])`,
    `    && DATEDIFF('${customerTable}'[${dateColumn}], TODAY(), DAY) >= ${daysInactive}`,
    ")",
  ].join("\n")
}

export async function POST(request: NextRequest) {
  try {
    const ctx = await getRequestContext()

    const { data: featuresRow } = await createServiceClient()
      .from("company_settings")
      .select("value")
      .eq("company_id", ctx.companyId)
      .eq("key", "features")
      .maybeSingle()

    const features = (featuresRow?.value ?? {}) as Record<string, unknown>
    if (features.campaign_client_preview !== true) {
      return NextResponse.json({ error: "Funcionalidade nao habilitada" }, { status: 403 })
    }

    const body = await request.json()
    const { dataset_id, customer_table, date_column, days_inactive, name_column, phone_column } = body

    if (!dataset_id || !customer_table || !date_column || !days_inactive || !name_column || !phone_column) {
      return NextResponse.json({ error: "Campos obrigatorios ausentes" }, { status: 400 })
    }

    const daysNum = Number(days_inactive)
    if (isNaN(daysNum) || daysNum <= 0) {
      return NextResponse.json({ error: "days_inactive invalido" }, { status: 400 })
    }

    const daxQuery = buildPreviewDaxQuery(customer_table, date_column, daysNum)
    const token = await getAccessToken(ctx.companyId)
    const result = await executeDAXQuery(token, dataset_id, daxQuery)
    const rows = result.rows ?? []

    const clients = rows.map((row) => ({
      name: row[name_column] != null ? String(row[name_column]) : null,
      phone: normalizePhone(row[phone_column]),
    }))

    return NextResponse.json({ clients, total: clients.length })
  } catch (error) {
    if (isAuthContextError(error)) {
      return NextResponse.json({ error: "Nao autenticado" }, { status: 401 })
    }
    const message = error instanceof Error ? error.message : "Erro ao buscar clientes"
    return NextResponse.json({ error: message }, { status: 500 })
  }
}
