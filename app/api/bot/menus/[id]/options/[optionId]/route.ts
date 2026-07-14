import { NextRequest, NextResponse } from "next/server"
import { z } from "zod"
import { createServiceClient } from "@/lib/supabase/server"
import { getRequestContext, isAuthContextError } from "@/lib/tenant"

const updateSchema = z.object({
  position: z.number().int().min(1).optional(),
  label: z.string().trim().min(1).optional(),
  action_type: z.enum(["open_menu", "send_text", "transfer_human", "end_conversation"]).optional(),
  child_menu_id: z.string().uuid().optional().nullable(),
  response_text: z.string().trim().optional().nullable(),
  is_active: z.boolean().optional(),
})

export async function PUT(
  request: NextRequest,
  { params }: { params: Promise<{ id: string; optionId: string }> }
) {
  try {
    const { optionId } = await params
    const { companyId } = await getRequestContext()
    const supabase = createServiceClient()
    const body = await request.json()
    const parsed = updateSchema.safeParse(body)

    if (!parsed.success) {
      return NextResponse.json({ error: parsed.error.flatten().fieldErrors }, { status: 400 })
    }

    const { data, error } = await supabase
      .from("bot_menu_options")
      .update({ ...parsed.data, updated_at: new Date().toISOString() })
      .eq("id", optionId)
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
      { error: error instanceof Error ? error.message : "Erro ao atualizar opcao do menu" },
      { status: 500 }
    )
  }
}

export async function DELETE(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string; optionId: string }> }
) {
  try {
    const { optionId } = await params
    const { companyId } = await getRequestContext()
    const supabase = createServiceClient()

    const { error } = await supabase
      .from("bot_menu_options")
      .delete()
      .eq("id", optionId)
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
      { error: error instanceof Error ? error.message : "Erro ao remover opcao do menu" },
      { status: 500 }
    )
  }
}
