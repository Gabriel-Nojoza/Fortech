import { NextResponse } from "next/server"
import { createServiceClient } from "@/lib/supabase/server"
import { fetchCompanyWahaQr } from "@/lib/waha-session-service"
import { getRequestContext, isAuthContextError } from "@/lib/tenant"
import { assertCompanyWhatsAppProvider } from "@/lib/whatsapp-provider"

export async function GET() {
  try {
    const { companyId } = await getRequestContext()
    const supabase = createServiceClient()
    await assertCompanyWhatsAppProvider(supabase, companyId, "waha")
    const session = await fetchCompanyWahaQr(supabase, companyId)
    return NextResponse.json(session)
  } catch (error) {
    if (isAuthContextError(error)) {
      return NextResponse.json({ error: "Nao autenticado" }, { status: 401 })
    }

    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Erro ao buscar QR Code do WAHA" },
      { status: 500 }
    )
  }
}
