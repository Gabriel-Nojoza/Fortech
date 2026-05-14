import { NextRequest, NextResponse } from "next/server"
import { renderHtmlScreenshotToPdf } from "@/lib/browser-pdf"
import { getRequestContext } from "@/lib/tenant"

// CSS pixels wide for the screenshot viewport — wide enough for most reports
const CAPTURE_WIDTH = 1000
// PDF page width in mm, matched to the capture width so there is no stretching
const PAGE_WIDTH_MM = Math.round(CAPTURE_WIDTH * 25.4 / 96) // ≈ 265 mm

function injectPdfLayoutCss(html: string): string {
  const style = `<style>
    /* Remove horizontal scroll and centering so the table fills from the left edge */
    html, body { overflow: hidden !important; background: #f0f4f8 !important; }
    .page { margin-left: 0 !important; margin-right: 0 !important; }
  </style>`
  return html.includes("</head>") ? html.replace("</head>", `${style}</head>`) : style + html
}

export async function POST(req: NextRequest) {
  try {
    await getRequestContext()
    const body = await req.json()
    const html = typeof body?.html === "string" ? body.html : ""

    if (!html.trim()) {
      return NextResponse.json({ error: "html obrigatorio" }, { status: 400 })
    }

    const pdfHtml = injectPdfLayoutCss(html)

    const pdf = await renderHtmlScreenshotToPdf(pdfHtml, {
      pngTimeoutMs: 120000,
      pdfTimeoutMs: 60000,
      captureWidth: CAPTURE_WIDTH,
      deviceScaleFactor: 2,
      pageWidthMm: PAGE_WIDTH_MM,
      pageMarginMm: 6,
      autoGrowPageHeight: true,
      maxPageHeightMm: 14400,
    })

    return new NextResponse(pdf, {
      headers: {
        "Content-Type": "application/pdf",
        "Content-Disposition": 'attachment; filename="relatorio.pdf"',
      },
    })
  } catch (err) {
    console.error("[generate-pdf]", err)
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "Erro ao gerar PDF" },
      { status: 500 }
    )
  }
}
