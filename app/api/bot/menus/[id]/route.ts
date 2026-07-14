import { NextRequest, NextResponse } from "next/server"
import { z } from "zod"
import { createServiceClient } from "@/lib/supabase/server"
import { getRequestContext, isAuthContextError } from "@/lib/tenant"

const updateSchema = z.object({
  name: z.string().trim().min(1).optional(),
  prompt_text: z.string().trim().optional(),
  is_root: z.boolean().optional(),
  is_active: z.boolean().optional(),
})

export async function GET(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params
    const { companyId } = await getRequestContext()
    const supabase = createServiceClient()

    const [{ data: menu, error: menuError }, { data: options, error: optionsError }] =
      await Promise.all([
        supabase
          .from("bot_menus")
          .select("*")
          .eq("company_id", companyId)
          .eq("id", id)
          .single(),
        supabase
          .from("bot_menu_options")
          .select("*")
          .eq("company_id", companyId)
          .eq("menu_id", id)
          .order("position", { ascending: true }),
      ])

    if (menuError) {
      return NextResponse.json({ error: menuError.message }, { status: 404 })
    }
    if (optionsError) throw optionsError

    return NextResponse.json({ ...menu, options: options ?? [] })
  } catch (error) {
    if (isAuthContextError(error)) {
      return NextResponse.json({ error: "Nao autenticado" }, { status: 401 })
    }
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Erro ao carregar menu" },
      { status: 500 }
    )
  }
}

export async function PUT(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params
    const { companyId } = await getRequestContext()
    const supabase = createServiceClient()
    const body = await request.json()
    const parsed = updateSchema.safeParse(body)

    if (!parsed.success) {
      return NextResponse.json({ error: parsed.error.flatten().fieldErrors }, { status: 400 })
    }

    if (parsed.data.is_root === true) {
      await supabase
        .from("bot_menus")
        .update({ is_root: false })
        .eq("company_id", companyId)
        .eq("is_root", true)
        .neq("id", id)
    }

    const { data, error } = await supabase
      .from("bot_menus")
      .update({ ...parsed.data, updated_at: new Date().toISOString() })
      .eq("id", id)
      .eq("company_id", companyId)
      .select("*")
      .single()

    if (error) {
      return NextResponse.json({ error: error.message }, { status: 400 })
    }

    return NextResponse.json(data)
  } catch (error) {
    if (isAuthContextError(error)) {
      return NextResponse.json({ error: "Nao autenticado" }, { status: 401 })
    }
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Erro ao atualizar menu" },
      { status: 500 }
    )
  }
}

export async function DELETE(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params
    const { companyId } = await getRequestContext()
    const supabase = createServiceClient()

    const { error } = await supabase
      .from("bot_menus")
      .delete()
      .eq("id", id)
      .eq("company_id", companyId)

    if (error) {
      return NextResponse.json({ error: error.message }, { status: 400 })
    }

    return NextResponse.json({ success: true })
  } catch (error) {
    if (isAuthContextError(error)) {
      return NextResponse.json({ error: "Nao autenticado" }, { status: 401 })
    }
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Erro ao remover menu" },
      { status: 500 }
    )
  }
}
