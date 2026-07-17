import { NextRequest, NextResponse } from "next/server"
import { createServiceClient } from "@/lib/supabase/server"
import { getRequestContext, isAuthContextError } from "@/lib/tenant"
import { normalizeBotCatalogFile } from "@/lib/bot"

const BUCKET = "bot-catalog-files"
const MAX_SIZE_MB = 15
const ALLOWED_TYPES = ["application/pdf", "image/png", "image/jpeg", "image/jpg"]

async function ensureBucketExists(supabase: ReturnType<typeof createServiceClient>) {
  const { data: buckets } = await supabase.storage.listBuckets()
  const exists = buckets?.some((bucket) => bucket.name === BUCKET)
  if (!exists) {
    await supabase.storage.createBucket(BUCKET, { public: true })
  }
}

export async function GET() {
  try {
    const { companyId } = await getRequestContext()
    const supabase = createServiceClient()

    const { data } = await supabase
      .from("company_settings")
      .select("value")
      .eq("company_id", companyId)
      .eq("key", "bot_catalog_file")
      .maybeSingle()

    return NextResponse.json(normalizeBotCatalogFile(data?.value))
  } catch (error) {
    if (isAuthContextError(error)) {
      return NextResponse.json({ error: "Nao autenticado" }, { status: 401 })
    }
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Erro ao carregar catalogo" },
      { status: 500 }
    )
  }
}

export async function POST(request: NextRequest) {
  try {
    const { companyId } = await getRequestContext()

    const formData = await request.formData()
    const file = formData.get("file")

    if (!file || typeof file === "string") {
      return NextResponse.json({ error: "Arquivo nao enviado" }, { status: 400 })
    }

    const blob = file as File
    const sizeInMB = blob.size / (1024 * 1024)

    if (sizeInMB > MAX_SIZE_MB) {
      return NextResponse.json(
        { error: `Arquivo muito grande. Limite: ${MAX_SIZE_MB}MB` },
        { status: 413 }
      )
    }

    if (!ALLOWED_TYPES.includes(blob.type)) {
      return NextResponse.json(
        { error: "Formato nao suportado. Use PDF, PNG ou JPG." },
        { status: 400 }
      )
    }

    const ext = blob.name.split(".").pop()?.toLowerCase() || "pdf"
    const fileName = `${companyId}/catalogo-${Date.now()}.${ext}`

    const supabase = createServiceClient()
    await ensureBucketExists(supabase)

    const arrayBuffer = await blob.arrayBuffer()
    const buffer = Buffer.from(arrayBuffer)

    const { error: uploadError } = await supabase.storage
      .from(BUCKET)
      .upload(fileName, buffer, {
        contentType: blob.type,
        upsert: false,
      })

    if (uploadError) {
      throw uploadError
    }

    const { data: publicUrlData } = supabase.storage.from(BUCKET).getPublicUrl(fileName)

    const catalogFile = {
      url: publicUrlData.publicUrl,
      mimetype: blob.type,
      file_name: blob.name,
      uploaded_at: new Date().toISOString(),
    }

    const { error: settingsError } = await supabase.from("company_settings").upsert(
      {
        company_id: companyId,
        key: "bot_catalog_file",
        value: catalogFile,
        updated_at: new Date().toISOString(),
      },
      { onConflict: "company_id,key" }
    )

    if (settingsError) {
      throw settingsError
    }

    return NextResponse.json(catalogFile)
  } catch (error) {
    if (isAuthContextError(error)) {
      return NextResponse.json({ error: "Nao autenticado" }, { status: 401 })
    }
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Erro ao enviar catalogo" },
      { status: 500 }
    )
  }
}

export async function DELETE() {
  try {
    const { companyId } = await getRequestContext()
    const supabase = createServiceClient()

    const { error } = await supabase
      .from("company_settings")
      .delete()
      .eq("company_id", companyId)
      .eq("key", "bot_catalog_file")

    if (error) {
      throw error
    }

    return NextResponse.json({ success: true })
  } catch (error) {
    if (isAuthContextError(error)) {
      return NextResponse.json({ error: "Nao autenticado" }, { status: 401 })
    }
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Erro ao remover catalogo" },
      { status: 500 }
    )
  }
}
