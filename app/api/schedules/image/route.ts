import { NextRequest, NextResponse } from "next/server"
import { createServiceClient } from "@/lib/supabase/server"
import { getRequestContext, isAuthContextError } from "@/lib/tenant"

const BUCKET = "campaign-images"
const MAX_SIZE_MB = 10

async function ensureBucketExists(supabase: ReturnType<typeof createServiceClient>) {
  const { data: buckets } = await supabase.storage.listBuckets()
  const exists = buckets?.some((b) => b.name === BUCKET)
  if (!exists) {
    await supabase.storage.createBucket(BUCKET, { public: true })
  }
}

export async function POST(request: NextRequest) {
  try {
    const ctx = await getRequestContext()

    const formData = await request.formData()
    const file = formData.get("file")

    if (!file || typeof file === "string") {
      return NextResponse.json({ error: "Arquivo nao enviado" }, { status: 400 })
    }

    const blob = file as File
    const sizeInMB = blob.size / (1024 * 1024)

    if (sizeInMB > MAX_SIZE_MB) {
      return NextResponse.json(
        { error: `Imagem muito grande. Limite: ${MAX_SIZE_MB}MB` },
        { status: 413 }
      )
    }

    const allowedTypes = ["image/jpeg", "image/jpg", "image/png", "image/webp", "image/gif"]
    if (!allowedTypes.includes(blob.type)) {
      return NextResponse.json(
        { error: "Formato nao suportado. Use JPG, PNG, WEBP ou GIF" },
        { status: 400 }
      )
    }

    const ext = blob.name.split(".").pop()?.toLowerCase() ?? "jpg"
    const fileName = `${ctx.companyId}/schedules/${Date.now()}-${Math.random().toString(36).slice(2)}.${ext}`

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

    return NextResponse.json({ url: publicUrlData.publicUrl })
  } catch (error) {
    if (isAuthContextError(error)) {
      return NextResponse.json({ error: "Nao autenticado" }, { status: 401 })
    }
    const message = error instanceof Error ? error.message : "Erro ao fazer upload da imagem"
    return NextResponse.json({ error: message }, { status: 500 })
  }
}
