import { NextRequest, NextResponse } from "next/server"
import { z } from "zod"
import { createServiceClient } from "@/lib/supabase/server"
import { getRequestContext, isAuthContextError } from "@/lib/tenant"

const updateSchema = z.object({
  name: z.string().trim().min(1).optional(),
  message: z.string().trim().optional().nullable(),
  buttons: z.array(z.string().trim().min(1)).optional(),
  list_items: z.array(z.string().trim().min(1)).optional(),
  file_url: z.string().trim().optional().nullable(),
  image_url: z.string().trim().optional().nullable(),
  audio_url: z.string().trim().optional().nullable(),
  video_url: z.string().trim().optional().nullable(),
  is_active: z.boolean().optional(),
})

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

    const { data, error } = await supabase
      .from("bot_quick_replies")
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
      { error: error instanceof Error ? error.message : "Erro ao atualizar resposta" },
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
      .from("bot_quick_replies")
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
      { error: error instanceof Error ? error.message : "Erro ao remover resposta" },
      { status: 500 }
    )
  }
}
