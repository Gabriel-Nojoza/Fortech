import { NextRequest, NextResponse } from "next/server"
import { createServiceClient } from "@/lib/supabase/server"
import { requirePlatformAdminContext } from "@/lib/tenant"

export async function GET() {
  try {
    await requirePlatformAdminContext()

    const supabase = createServiceClient()
    const { data, error } = await supabase
      .from("lead_message_templates")
      .select("id, label, content")
      .order("created_at", { ascending: false })

    if (error) {
      throw error
    }

    return NextResponse.json(data ?? [])
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Erro ao buscar modelos de mensagem" },
      { status: 500 }
    )
  }
}

export async function POST(request: NextRequest) {
  try {
    await requirePlatformAdminContext()

    const body = await request.json().catch(() => null)
    const label = typeof body?.label === "string" ? body.label.trim() : ""
    const content = typeof body?.content === "string" ? body.content.trim() : ""

    if (!label || !content) {
      return NextResponse.json(
        { error: "Os campos 'label' e 'content' sao obrigatorios." },
        { status: 400 }
      )
    }

    const supabase = createServiceClient()
    const { data, error } = await supabase
      .from("lead_message_templates")
      .insert({ label, content })
      .select("id, label, content")
      .single()

    if (error) {
      throw error
    }

    return NextResponse.json(data)
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Erro ao salvar modelo de mensagem" },
      { status: 500 }
    )
  }
}

export async function DELETE(request: NextRequest) {
  try {
    await requirePlatformAdminContext()

    const { searchParams } = new URL(request.url)
    const id = searchParams.get("id")?.trim()

    if (!id) {
      return NextResponse.json({ error: "O parametro 'id' e obrigatorio." }, { status: 400 })
    }

    const supabase = createServiceClient()
    const { error } = await supabase.from("lead_message_templates").delete().eq("id", id)

    if (error) {
      throw error
    }

    return NextResponse.json({ ok: true })
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Erro ao remover modelo de mensagem" },
      { status: 500 }
    )
  }
}
