import { NextRequest, NextResponse } from "next/server"
import { z } from "zod"
import { createServiceClient } from "@/lib/supabase/server"
import { getRequestContext, isAuthContextError } from "@/lib/tenant"

const createSchema = z.object({
  name: z.string().trim().min(1, "Nome obrigatorio"),
  prompt_text: z.string().trim().optional().default(""),
  is_root: z.boolean().optional().default(false),
  is_active: z.boolean().optional().default(true),
})

async function unsetExistingRoot(
  supabase: ReturnType<typeof createServiceClient>,
  companyId: string
) {
  await supabase
    .from("bot_menus")
    .update({ is_root: false })
    .eq("company_id", companyId)
    .eq("is_root", true)
}

export async function GET() {
  try {
    const { companyId } = await getRequestContext()
    const supabase = createServiceClient()

    const { data, error } = await supabase
      .from("bot_menus")
      .select("*, bot_menu_options(count)")
      .eq("company_id", companyId)
      .order("name", { ascending: true })

    if (error) throw error

    return NextResponse.json(data ?? [])
  } catch (error) {
    if (isAuthContextError(error)) {
      return NextResponse.json({ error: "Nao autenticado" }, { status: 401 })
    }
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Erro ao listar menus" },
      { status: 500 }
    )
  }
}

export async function POST(request: NextRequest) {
  try {
    const { companyId } = await getRequestContext()
    const supabase = createServiceClient()
    const body = await request.json()
    const parsed = createSchema.safeParse(body)

    if (!parsed.success) {
      return NextResponse.json({ error: parsed.error.flatten().fieldErrors }, { status: 400 })
    }

    if (parsed.data.is_root) {
      await unsetExistingRoot(supabase, companyId)
    }

    const { data, error } = await supabase
      .from("bot_menus")
      .insert({ ...parsed.data, company_id: companyId })
      .select("*")
      .single()

    if (error) {
      return NextResponse.json({ error: error.message }, { status: 400 })
    }

    return NextResponse.json(data, { status: 201 })
  } catch (error) {
    if (isAuthContextError(error)) {
      return NextResponse.json({ error: "Nao autenticado" }, { status: 401 })
    }
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Erro ao criar menu" },
      { status: 500 }
    )
  }
}
