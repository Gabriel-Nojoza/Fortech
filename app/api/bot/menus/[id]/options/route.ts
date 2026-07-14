import { NextRequest, NextResponse } from "next/server"
import { z } from "zod"
import { createServiceClient } from "@/lib/supabase/server"
import { getRequestContext, isAuthContextError } from "@/lib/tenant"

const createSchema = z.object({
  position: z.number().int().min(1),
  label: z.string().trim().min(1, "Rotulo obrigatorio"),
  action_type: z.enum(["open_menu", "send_text", "transfer_human", "end_conversation"]),
  child_menu_id: z.string().uuid().optional().nullable(),
  response_text: z.string().trim().optional().nullable(),
  is_active: z.boolean().optional().default(true),
})

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id: menuId } = await params
    const { companyId } = await getRequestContext()
    const supabase = createServiceClient()
    const body = await request.json()
    const parsed = createSchema.safeParse(body)

    if (!parsed.success) {
      return NextResponse.json({ error: parsed.error.flatten().fieldErrors }, { status: 400 })
    }

    if (parsed.data.action_type === "open_menu" && !parsed.data.child_menu_id) {
      return NextResponse.json(
        { error: "Selecione o submenu que essa opcao deve abrir" },
        { status: 400 }
      )
    }

    const { data, error } = await supabase
      .from("bot_menu_options")
      .insert({ ...parsed.data, menu_id: menuId, company_id: companyId })
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
      { error: error instanceof Error ? error.message : "Erro ao criar opcao do menu" },
      { status: 500 }
    )
  }
}
