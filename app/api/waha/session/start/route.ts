import { NextResponse } from "next/server"
import { createServiceClient } from "@/lib/supabase/server"
import { startCompanyWahaSession } from "@/lib/waha-session-service"
import { getRequestContext, isAuthContextError } from "@/lib/tenant"
import { assertCompanyWhatsAppProvider } from "@/lib/whatsapp-provider"

export async function POST() {
  try {
    const { companyId } = await getRequestContext()
    const supabase = createServiceClient()
    await assertCompanyWhatsAppProvider(supabase, companyId, "waha")
    const session = await startCompanyWahaSession(supabase, companyId)
    return NextResponse.json(session)
  } catch (error) {
    if (isAuthContextError(error)) {
      return NextResponse.json({ error: "Nao autenticado" }, { status: 401 })
    }

    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Erro ao iniciar sessao WAHA" },
      { status: 500 }
    )
  }
}
