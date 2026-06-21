import { NextRequest, NextResponse } from "next/server"
import { createClient } from "@supabase/supabase-js"
import { requireAdminContext } from "@/lib/tenant"

function getAdminClient() {
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
    { auth: { autoRefreshToken: false, persistSession: false } }
  )
}

export async function GET(request: NextRequest) {
  await requireAdminContext()
  const supabase = getAdminClient()
  const companyId = new URL(request.url).searchParams.get("company_id")

  if (!companyId) {
    return NextResponse.json({ error: "company_id obrigatorio" }, { status: 400 })
  }

  const { data } = await supabase
    .from("company_settings")
    .select("value")
    .eq("company_id", companyId)
    .eq("key", "narration_mode")
    .maybeSingle()

  const value = data?.value as Record<string, unknown> | null
  const send_mode = typeof value?.send_mode === "string" ? value.send_mode : "none"

  return NextResponse.json({ send_mode })
}

export async function PATCH(request: NextRequest) {
  await requireAdminContext()
  const supabase = getAdminClient()
  const body = await request.json()
  const { company_id, send_mode } = body

  if (!company_id || !["none", "audio", "text"].includes(send_mode)) {
    return NextResponse.json({ error: "company_id e send_mode validos sao obrigatorios" }, { status: 400 })
  }

  const { error } = await supabase
    .from("company_settings")
    .upsert(
      { company_id, key: "narration_mode", value: { send_mode } },
      { onConflict: "company_id,key" }
    )

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })

  return NextResponse.json({ ok: true })
}
