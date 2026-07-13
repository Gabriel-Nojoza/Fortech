import { NextResponse } from "next/server"
import { createServiceClient } from "@/lib/supabase/server"
import { ensureCompanyWahaSession, refreshCompanyWahaSession, removeCompanyWahaSession } from "@/lib/waha-session-service"
import { getRequestContext, isAuthContextError } from "@/lib/tenant"
import { assertCompanyWhatsAppProvider } from "@/lib/whatsapp-provider"

function getAdminClient() {
  return createServiceClient()
}

export async function GET() {
  try {
    const { companyId } = await getRequestContext()
    const supabase = getAdminClient()
    await assertCompanyWhatsAppProvider(supabase, companyId, "waha")
    const session = await refreshCompanyWahaSession(supabase, companyId)
    return NextResponse.json(session)
  } catch (error) {
    if (isAuthContextError(error)) {
      return NextResponse.json({ error: "Nao autenticado" }, { status: 401 })
    }

    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Erro ao consultar sessao WAHA" },
      { status: 500 }
    )
  }
}

export async function POST() {
  try {
    const { companyId } = await getRequestContext()
    const supabase = getAdminClient()
    await assertCompanyWhatsAppProvider(supabase, companyId, "waha")
    const session = await ensureCompanyWahaSession(supabase, companyId)
    return NextResponse.json(session, { status: 201 })
  } catch (error) {
    if (isAuthContextError(error)) {
      return NextResponse.json({ error: "Nao autenticado" }, { status: 401 })
    }

    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Erro ao criar sessao WAHA" },
      { status: 500 }
    )
  }
}

export async function DELETE() {
  try {
    const { companyId } = await getRequestContext()
    const supabase = getAdminClient()
    await assertCompanyWhatsAppProvider(supabase, companyId, "waha")
    const session = await removeCompanyWahaSession(supabase, companyId)
    return NextResponse.json(session)
  } catch (error) {
    if (isAuthContextError(error)) {
      return NextResponse.json({ error: "Nao autenticado" }, { status: 401 })
    }

    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Erro ao remover sessao WAHA" },
      { status: 500 }
    )
  }
}
