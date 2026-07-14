import { NextRequest, NextResponse } from "next/server"
import { z } from "zod"
import { createServiceClient } from "@/lib/supabase/server"
import { BOT_AI_PROVIDERS, normalizeBotAiConfig } from "@/lib/bot"
import { getRequestContext, isAuthContextError } from "@/lib/tenant"

const updateSchema = z.object({
  provider: z.enum(BOT_AI_PROVIDERS),
  api_key: z.string().trim().optional().default(""),
  model: z.string().trim().optional().default(""),
  system_prompt: z.string().trim().optional().default(""),
  temperature: z.number().min(0).max(2).optional().default(0.7),
  max_tokens: z.number().int().min(1).max(32000).optional().default(512),
})

export async function GET() {
  try {
    const { companyId } = await getRequestContext()
    const supabase = createServiceClient()

    const { data, error } = await supabase
      .from("company_settings")
      .select("value")
      .eq("company_id", companyId)
      .eq("key", "bot_ai_config")
      .maybeSingle()

    if (error) {
      throw error
    }

    return NextResponse.json(normalizeBotAiConfig(data?.value))
  } catch (error) {
    if (isAuthContextError(error)) {
      return NextResponse.json({ error: "Nao autenticado" }, { status: 401 })
    }
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Erro ao carregar configuracao de IA" },
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
        key: "bot_ai_config",
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
      { error: error instanceof Error ? error.message : "Erro ao salvar configuracao de IA" },
      { status: 500 }
    )
  }
}
