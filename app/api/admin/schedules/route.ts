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
  const context = await requireAdminContext()
  const supabase = getAdminClient()
  const companyId = new URL(request.url).searchParams.get("company_id")

  let query = supabase
    .from("schedules")
    .select("id, name, is_active, cron_expression, send_mode, company_id, companies(name)")
    .order("name")

  if (companyId) {
    query = query.eq("company_id", companyId)
  } else if (!context.isPlatformAdmin) {
    query = query.eq("company_id", context.companyId)
  }

  const { data, error } = await query
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })

  return NextResponse.json(data ?? [])
}

export async function PATCH(request: NextRequest) {
  await requireAdminContext()
  const supabase = getAdminClient()
  const body = await request.json()
  const { id, send_mode } = body

  if (!id || !["none", "audio", "text"].includes(send_mode)) {
    return NextResponse.json({ error: "id e send_mode validos sao obrigatorios" }, { status: 400 })
  }

  const { error } = await supabase
    .from("schedules")
    .update({ send_mode })
    .eq("id", id)

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })

  return NextResponse.json({ ok: true })
}
