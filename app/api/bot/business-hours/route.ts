import { NextRequest, NextResponse } from "next/server"
import { z } from "zod"
import { createServiceClient } from "@/lib/supabase/server"
import { BOT_WEEKDAYS, normalizeBotBusinessHours } from "@/lib/bot"
import { getRequestContext, isAuthContextError } from "@/lib/tenant"

const weekdayHoursSchema = z.object({
  enabled: z.boolean(),
  open: z.string().trim().min(1),
  close: z.string().trim().min(1),
})

const updateSchema = z.object({
  hours: z.object(
    BOT_WEEKDAYS.reduce(
      (acc, day) => ({ ...acc, [day]: weekdayHoursSchema }),
      {} as Record<(typeof BOT_WEEKDAYS)[number], typeof weekdayHoursSchema>
    )
  ),
  closed_message: z.string().trim().min(1, "Mensagem obrigatoria"),
})

export async function GET() {
  try {
    const { companyId } = await getRequestContext()
    const supabase = createServiceClient()

    const { data, error } = await supabase
      .from("company_settings")
      .select("value")
      .eq("company_id", companyId)
      .eq("key", "bot_business_hours")
      .maybeSingle()

    if (error) {
      throw error
    }

    return NextResponse.json(normalizeBotBusinessHours(data?.value))
  } catch (error) {
    if (isAuthContextError(error)) {
      return NextResponse.json({ error: "Nao autenticado" }, { status: 401 })
    }
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Erro ao carregar horarios" },
      { status: 500 }
    )
  }
}

export async function PUT(request: NextRequest) {
  try {
    const { companyId } = await getRequestContext()
    const supabase = createServiceClient()
    const body = await request.json()
    const parsed = updateSchema.safeParse(body)

    if (!parsed.success) {
      return NextResponse.json({ error: parsed.error.flatten().fieldErrors }, { status: 400 })
    }

    const { error } = await supabase.from("company_settings").upsert(
      {
        company_id: companyId,
        key: "bot_business_hours",
        value: parsed.data,
        updated_at: new Date().toISOString(),
      },
      { onConflict: "company_id,key" }
    )

    if (error) {
      throw error
    }

    return NextResponse.json(parsed.data)
  } catch (error) {
    if (isAuthContextError(error)) {
      return NextResponse.json({ error: "Nao autenticado" }, { status: 401 })
    }
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Erro ao salvar horarios" },
      { status: 500 }
    )
  }
}
