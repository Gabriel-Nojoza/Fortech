import { NextRequest, NextResponse } from "next/server"
import { createServiceClient } from "@/lib/supabase/server"
import {
  refreshCompanyWahaSession,
  removeCompanyWahaSession,
  restartCompanyWahaSession,
} from "@/lib/waha-session-service"
import { requireAdminContext } from "@/lib/tenant"
import { assertCompanyWhatsAppProvider } from "@/lib/whatsapp-provider"

function getAdminClient() {
  return createServiceClient()
}

async function resolveTargetCompanyIds(
  context: Awaited<ReturnType<typeof requireAdminContext>>,
  supabase: ReturnType<typeof getAdminClient>,
  requestedCompanyId?: string
) {
  if (requestedCompanyId) {
    if (!context.isPlatformAdmin && requestedCompanyId !== context.companyId) {
      throw new Error("Voce nao tem permissao para acessar esta empresa")
    }

    return [requestedCompanyId]
  }

  if (!context.isPlatformAdmin) {
    return [context.companyId]
  }

  const { data, error } = await supabase
    .from("companies")
    .select("id")
    .order("name")

  if (error) {
    throw error
  }

  return (data ?? []).map((company) => company.id)
}

export async function GET(request: NextRequest) {
  try {
    const context = await requireAdminContext()
    const supabase = getAdminClient()
    const requestedCompanyId = new URL(request.url).searchParams.get("companyId")?.trim() || undefined
    const companyIds = await resolveTargetCompanyIds(context, supabase, requestedCompanyId)

    const { data: companies, error: companiesError } = await supabase
      .from("companies")
      .select("id, name")
      .in("id", companyIds)
      .order("name")

    if (companiesError) {
      throw companiesError
    }

    const sessions = await Promise.all(
      (companies ?? []).map(async (company) => ({
        companyId: company.id,
        companyName: company.name ?? "Empresa sem nome",
        session: await refreshCompanyWahaSession(supabase, company.id),
      }))
    )

    return NextResponse.json(sessions)
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Erro ao listar conexoes WAHA" },
      { status: 500 }
    )
  }
}

export async function POST(request: NextRequest) {
  try {
    const context = await requireAdminContext()
    const supabase = getAdminClient()
    const body = await request.json() as {
      companyId?: string
      action?: "restart" | "remove" | "refresh"
    }

    const companyId = String(body.companyId ?? "").trim()
    if (!companyId) {
      return NextResponse.json({ error: "companyId obrigatorio" }, { status: 400 })
    }

    if (!context.isPlatformAdmin && companyId !== context.companyId) {
      return NextResponse.json(
        { error: "Voce nao tem permissao para acessar esta empresa" },
        { status: 403 }
      )
    }

    await assertCompanyWhatsAppProvider(supabase, companyId, "waha")

    let session
    if (body.action === "remove") {
      session = await removeCompanyWahaSession(supabase, companyId)
    } else if (body.action === "restart") {
      session = await restartCompanyWahaSession(supabase, companyId)
    } else {
      session = await refreshCompanyWahaSession(supabase, companyId)
    }

    return NextResponse.json(session)
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Erro ao controlar conexao WAHA" },
      { status: 500 }
    )
  }
}
