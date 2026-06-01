import { NextRequest, NextResponse } from "next/server"
import { z } from "zod"
import { createServiceClient } from "@/lib/supabase/server"
import { getRequestContext, isAuthContextError } from "@/lib/tenant"

const campaignSchema = z.object({
  name: z.string().min(1, "Nome obrigatorio"),
  description: z.string().nullable().optional(),
  dataset_id: z.string().optional().default(""),
  workspace_id: z.string().nullable().optional(),
  dax_query: z.string().nullable().optional(),
  selected_columns: z.array(z.object({ tableName: z.string(), columnName: z.string() })).default([]),
  selected_measures: z.array(z.object({ tableName: z.string(), measureName: z.string() })).default([]),
  filters: z.array(z.unknown()).default([]),
  customer_table: z.string().nullable().optional(),
  date_column: z.string().nullable().optional(),
  days_inactive: z.number().int().positive().nullable().optional(),
  phone_column: z.string().nullable().optional(),
  name_column: z.string().nullable().optional(),
  message_template: z.string().min(1, "Template de mensagem obrigatorio"),
  image_url: z.string().url().nullable().optional().or(z.literal("").transform(() => null)),
  bot_instance_id: z.string().uuid().nullable().optional(),
  cron_expression: z.string().nullable().optional(),
  is_active: z.boolean().default(true),
})

const updateSchema = campaignSchema.partial().extend({
  id: z.string().uuid(),
})

export async function GET() {
  try {
    const ctx = await getRequestContext()
    const supabase = createServiceClient()

    const { data, error } = await supabase
      .from("campaigns")
      .select("*")
      .eq("company_id", ctx.companyId)
      .order("created_at", { ascending: false })

    if (error) {
      // Tabela ainda nao existe — retorna lista vazia em vez de 500
      const msg = typeof error.message === "string" ? error.message : ""
      if (msg.includes("relation") && msg.includes("does not exist")) {
        return NextResponse.json([])
      }
      console.error("[campaigns GET]", error)
      return NextResponse.json({ error: msg || "Erro ao buscar campanhas" }, { status: 500 })
    }

    return NextResponse.json(data ?? [])
  } catch (error) {
    if (isAuthContextError(error)) {
      return NextResponse.json({ error: "Nao autenticado" }, { status: 401 })
    }
    const msg = error instanceof Error ? error.message : "Erro ao buscar campanhas"
    console.error("[campaigns GET]", error)
    return NextResponse.json({ error: msg }, { status: 500 })
  }
}

export async function POST(request: NextRequest) {
  try {
    const ctx = await getRequestContext()
    const body = await request.json()
    const parsed = campaignSchema.safeParse(body)

    if (!parsed.success) {
      return NextResponse.json({ error: parsed.error.flatten().fieldErrors }, { status: 400 })
    }

    const supabase = createServiceClient()
    const { data, error } = await supabase
      .from("campaigns")
      .insert({ ...parsed.data, company_id: ctx.companyId })
      .select()
      .single()

    if (error) throw error

    return NextResponse.json(data, { status: 201 })
  } catch (error) {
    if (isAuthContextError(error)) {
      return NextResponse.json({ error: "Nao autenticado" }, { status: 401 })
    }
    return NextResponse.json({ error: "Erro ao criar campanha" }, { status: 500 })
  }
}

export async function PUT(request: NextRequest) {
  try {
    const ctx = await getRequestContext()
    const body = await request.json()
    const parsed = updateSchema.safeParse(body)

    if (!parsed.success) {
      return NextResponse.json({ error: parsed.error.flatten().fieldErrors }, { status: 400 })
    }

    const { id, ...updates } = parsed.data
    const supabase = createServiceClient()

    const { data, error } = await supabase
      .from("campaigns")
      .update({ ...updates, updated_at: new Date().toISOString() })
      .eq("id", id)
      .eq("company_id", ctx.companyId)
      .select()
      .single()

    if (error) throw error
    if (!data) return NextResponse.json({ error: "Campanha nao encontrada" }, { status: 404 })

    return NextResponse.json(data)
  } catch (error) {
    if (isAuthContextError(error)) {
      return NextResponse.json({ error: "Nao autenticado" }, { status: 401 })
    }
    return NextResponse.json({ error: "Erro ao atualizar campanha" }, { status: 500 })
  }
}

export async function DELETE(request: NextRequest) {
  try {
    const ctx = await getRequestContext()
    const { searchParams } = new URL(request.url)
    const id = searchParams.get("id")

    if (!id) return NextResponse.json({ error: "ID obrigatorio" }, { status: 400 })

    const supabase = createServiceClient()
    const { error } = await supabase
      .from("campaigns")
      .delete()
      .eq("id", id)
      .eq("company_id", ctx.companyId)

    if (error) throw error

    return NextResponse.json({ ok: true })
  } catch (error) {
    if (isAuthContextError(error)) {
      return NextResponse.json({ error: "Nao autenticado" }, { status: 401 })
    }
    return NextResponse.json({ error: "Erro ao excluir campanha" }, { status: 500 })
  }
}
