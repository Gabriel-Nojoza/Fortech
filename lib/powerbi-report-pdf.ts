import {
  renderHtmlScreenshotToPdf,
  renderHtmlToPng,
  renderScreenshotPayloadsToPdf,
} from "@/lib/browser-pdf"
import { generateReportEmbedToken } from "@/lib/powerbi"

function escapeHtml(value: string) {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;")
}

export function sanitizeFileName(value: string) {
  return value
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-zA-Z0-9-_ ]/g, "")
    .trim()
    .replace(/\s+/g, "-")
}

function buildPowerBICaptureHtml(input: {
  reportName: string
  reportId: string
  embedUrl: string
  embedToken: string
  pageName?: string | null
}) {
  const title = escapeHtml(input.reportName)
  const config = JSON.stringify({
    reportId: input.reportId,
    embedUrl: input.embedUrl,
    accessToken: input.embedToken,
    pageName:
      typeof input.pageName === "string" && input.pageName.trim()
        ? input.pageName.trim()
        : null,
  })

  return `<!DOCTYPE html>
<html lang="pt-BR">
<head>
  <meta charset="utf-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1" />
  <title>${title}</title>
  <style>
    :root {
      color-scheme: light;
      --canvas-bg: #ffffff;
      --frame-bg: #ffffff;
      --status-bg: rgba(15, 23, 42, 0.82);
      --status-text: #f8fafc;
    }

    * {
      box-sizing: border-box;
    }

    html,
    body {
      margin: 0;
      padding: 0;
      width: 100%;
      min-height: 100%;
      background: var(--canvas-bg);
      font-family: "Segoe UI", Tahoma, sans-serif;
    }

    body {
      padding: 0;
    }

    .canvas {
      width: 100%;
      min-height: 0;
      margin: 0;
      display: flex;
      flex-direction: column;
      gap: 0;
    }

    .frame {
      position: relative;
      width: 100%;
      height: 1100px;
      overflow: hidden;
      border-radius: 0;
      background: var(--frame-bg);
      box-shadow: none;
    }

    #report-container {
      width: 100%;
      height: 100%;
    }

    .status {
      position: absolute;
      top: 18px;
      left: 50%;
      transform: translateX(-50%);
      z-index: 2;
      border-radius: 999px;
      background: var(--status-bg);
      color: var(--status-text);
      padding: 10px 16px;
      font-size: 13px;
      line-height: 1;
      letter-spacing: 0.01em;
      box-shadow: 0 14px 30px rgba(15, 23, 42, 0.18);
    }

    .status[hidden] {
      display: none;
    }

    .status.error {
      background: rgba(153, 27, 27, 0.92);
    }
  </style>
</head>
<body>
  <div class="canvas">
    <div class="frame">
      <div id="status" class="status">Carregando o relatorio do Power BI...</div>
      <div id="error" class="status error" hidden></div>
      <div id="report-container"></div>
    </div>
  </div>

  <script src="https://cdn.jsdelivr.net/npm/powerbi-client@2.23.1/dist/powerbi.min.js"></script>
  <script>
    (() => {
      window.__REPORT_CAPTURE__ = true
      window.__REPORT_READY__ = null
      window.__REPORT_ERROR__ = null

      window.addEventListener("error", (event) => {
        const message =
          event && typeof event.message === "string" && event.message.trim()
            ? event.message.trim()
            : "Erro inesperado ao preparar a captura do relatorio."

        window.__REPORT_ERROR__ = message
      })

      window.addEventListener("unhandledrejection", (event) => {
        const reason =
          event && "reason" in event ? event.reason : "Erro inesperado"
        const message =
          typeof reason === "string"
            ? reason
            : reason && typeof reason.message === "string"
              ? reason.message
              : "Erro inesperado ao preparar a captura do relatorio."

        window.__REPORT_ERROR__ = message
      })

      const config = ${config}
      const statusNode = document.getElementById("status")
      const errorNode = document.getElementById("error")
      const reportContainer = document.getElementById("report-container")
      const frameNode = document.querySelector(".frame")
      const wait = (ms) => new Promise((resolve) => window.setTimeout(resolve, ms))
      let finished = false
      let settlingRender = false
      let lastVisualRenderedAt = 0

      function markReady(reason) {
        if (finished) return
        finished = true
        statusNode.hidden = true
        window.__REPORT_READY__ = reason || "rendered"
      }

      function markError(message) {
        if (finished) return
        finished = true
        statusNode.hidden = true
        errorNode.hidden = false
        errorNode.textContent = message
        window.__REPORT_ERROR__ = message
      }

      const client = window.powerbi
      const modelsSource = window["powerbi-client"]
      const models = modelsSource && modelsSource.models

      if (!client || !models) {
        markError("Nao foi possivel carregar o cliente do Power BI.")
        return
      }

      const report = client.embed(reportContainer, {
        type: "report",
        id: config.reportId,
        embedUrl: config.embedUrl,
        accessToken: config.accessToken,
        tokenType: models.TokenType.Embed,
        permissions: models.Permissions.Read,
        settings: {
          filterPaneEnabled: false,
          navContentPaneEnabled: false,
          visualRenderedEvents: true,
          layoutType: models.LayoutType.Custom,
          customLayout: {
            displayOption: models.DisplayOption.FitToWidth
          },
          panes: {
            filters: { visible: false },
            pageNavigation: { visible: false }
          },
          background: models.BackgroundType.Transparent
        }
      })

      const selectedPageName =
        typeof config.pageName === "string" && config.pageName.trim()
          ? config.pageName.trim()
          : ""

      async function syncFrameToActivePage() {
        if (!frameNode || !reportContainer) return

        try {
          const pages = await report.getPages()
          const activePage =
            Array.isArray(pages) && pages.length
              ? pages.find((page) => page.isActive) || pages[0]
              : null

          const pageWidth = Number(
            activePage && activePage.defaultSize && activePage.defaultSize.width
          )
          const pageHeight = Number(
            activePage && activePage.defaultSize && activePage.defaultSize.height
          )

          if (
            !Number.isFinite(pageWidth) ||
            !Number.isFinite(pageHeight) ||
            pageWidth <= 0 ||
            pageHeight <= 0
          ) {
            return
          }

          const frameWidth = frameNode.clientWidth || reportContainer.clientWidth

          if (!frameWidth) {
            return
          }

          const nextHeight = Math.max(
            920,
            Math.ceil(frameWidth * (pageHeight / pageWidth))
          )

          frameNode.style.height = nextHeight + "px"
        } catch {
          // Se nao conseguir ler a pagina ativa, mantemos a altura padrao.
        }
      }

      async function ensureSelectedPageIsActive() {
        if (!selectedPageName) {
          return true
        }

        try {
          const pages = await report.getPages()
          const targetPage =
            Array.isArray(pages) && pages.length
              ? pages.find(
                  (page) =>
                    page.name === selectedPageName ||
                    page.displayName === selectedPageName
                ) || null
              : null

          if (!targetPage) {
            markError("A pagina selecionada nao foi encontrada neste relatorio.")
            return false
          }

          if (!targetPage.isActive) {
            statusNode.textContent =
              "Relatorio carregado. Abrindo a pagina selecionada..."
            await targetPage.setActive()
            await wait(1500)
          }

          return true
        } catch {
          markError("Nao foi possivel abrir a pagina selecionada do relatorio.")
          return false
        }
      }

      async function waitForVisualStability() {
        const startedAt = Date.now()
        const fallbackDelayMs = 9000
        const quietPeriodMs = 3200
        const maxWaitMs = 25000

        while (Date.now() - startedAt < maxWaitMs) {
          if (finished) {
            return false
          }

          await syncFrameToActivePage()

          if (lastVisualRenderedAt > 0) {
            if (Date.now() - lastVisualRenderedAt >= quietPeriodMs) {
              await wait(1200)
              return true
            }
          } else if (Date.now() - startedAt >= fallbackDelayMs) {
            await wait(1200)
            return true
          }

          await wait(500)
        }

        return true
      }

      report.on("loaded", async () => {
        statusNode.textContent = selectedPageName
          ? "Relatorio carregado. Abrindo a pagina selecionada..."
          : "Relatorio carregado. Finalizando renderizacao..."

        const pageReady = await ensureSelectedPageIsActive()
        if (!pageReady) {
          return
        }

        await syncFrameToActivePage()
        await wait(1500)
      })

      report.on("visualRendered", () => {
        lastVisualRenderedAt = Date.now()
      })

      report.on("rendered", () => {
        if (settlingRender || finished) {
          return
        }

        settlingRender = true

        window.setTimeout(async () => {
          if (selectedPageName) {
            try {
              const pages = await report.getPages()
              const activePage =
                Array.isArray(pages) && pages.length
                  ? pages.find((page) => page.isActive) || pages[0]
                  : null

              if (
                !activePage ||
                (activePage.name !== selectedPageName &&
                  activePage.displayName !== selectedPageName)
              ) {
                const pageReady = await ensureSelectedPageIsActive()
                if (pageReady) {
                  settlingRender = false
                  return
                }
                settlingRender = false
                return
              }
            } catch {
              markError("Nao foi possivel confirmar a pagina selecionada.")
              settlingRender = false
              return
            }
          }

          statusNode.textContent = "Relatorio carregado. Finalizando renderizacao..."
          const visualsSettled = await waitForVisualStability()
          if (!visualsSettled) {
            settlingRender = false
            return
          }

          await syncFrameToActivePage()
          await wait(1500)
          markReady("rendered")
          settlingRender = false
        }, 3500)
      })

      report.on("error", (event) => {
        const message =
          event &&
          event.detail &&
          typeof event.detail.message === "string" &&
          event.detail.message.trim()
            ? event.detail.message.trim()
            : "Erro ao renderizar o relatorio do Power BI."

        markError(message)
      })

      window.setTimeout(() => {
        if (!finished) {
          markReady("timeout")
        }
      }, 60000)

      window.addEventListener("resize", () => {
        window.setTimeout(() => {
          void syncFrameToActivePage()
        }, 120)
      })
    })()
  </script>
</body>
</html>`
}

export type PowerBiPdfProfile = "desktop" | "mobile"

function getPowerBiPdfPreset(profile: PowerBiPdfProfile) {
  if (profile === "mobile") {
    return {
      viewportWidth: 7800,
      viewportHeight: 5200,
      deviceScaleFactor: 1,
      pageWidthMm: 700,
      pageHeightMm: 460,
      pageMarginMm: 1,
    }
  }

  return {
    viewportWidth: 6800,
    viewportHeight: 32000,
    deviceScaleFactor: 1,
    pageWidthMm: 620,
    pageHeightMm: 5000,
    pageMarginMm: 1,
  }
}

export async function exportPowerBIReportPdf(input: {
  token: string
  workspaceId: string
  reportId: string
  reportName: string
  embedUrl: string | null
  pageNames?: string[] | null
  pageName?: string | null
  pdfProfile?: PowerBiPdfProfile
}) {
  const embedUrl = typeof input.embedUrl === "string" ? input.embedUrl.trim() : ""

  if (!embedUrl) {
    throw new Error(
      "Relatorio sem embed_url salvo. Sincronize novamente os relatorios do Power BI."
    )
  }

  const embedToken = await generateReportEmbedToken(
    input.token,
    input.workspaceId,
    input.reportId
  )

  const preset = getPowerBiPdfPreset(input.pdfProfile ?? "desktop")
  const normalizedPageNames = Array.isArray(input.pageNames)
    ? [...new Set(input.pageNames.map((pageName) => pageName.trim()).filter(Boolean))]
    : []

  const selectedPageNames =
    normalizedPageNames.length > 0
      ? normalizedPageNames
      : typeof input.pageName === "string" && input.pageName.trim()
        ? [input.pageName.trim()]
        : []

  if (selectedPageNames.length <= 1) {
    const html = buildPowerBICaptureHtml({
      reportName: input.reportName,
      reportId: input.reportId,
      embedUrl,
      embedToken,
      pageName: selectedPageNames[0] ?? null,
    })

    return renderHtmlScreenshotToPdf(html, {
      pngTimeoutMs: 90000,
      pdfTimeoutMs: 90000,
      captureWidth: preset.viewportWidth,
      captureHeight: preset.viewportHeight,
      deviceScaleFactor: preset.deviceScaleFactor,
      pageWidthMm: preset.pageWidthMm,
      pageHeightMm: preset.pageHeightMm,
      pageMarginMm: preset.pageMarginMm,
      screenshotScale: 1,
      forceExpandScrollable: true,
      scrollableSegmentationMode: "full-page-scroll-steps",
      autoGrowPageHeight: true,
      maxPageHeightMm: 10000,
    })
  }

  const screenshotPayloads: Buffer[] = []

  for (const pageName of selectedPageNames) {
    const html = buildPowerBICaptureHtml({
      reportName: `${input.reportName} - ${pageName}`,
      reportId: input.reportId,
      embedUrl,
      embedToken,
      pageName,
    })

    const screenshotPayload = await renderHtmlToPng(html, {
      timeoutMs: 90000,
      captureWidth: preset.viewportWidth,
      captureHeight: preset.viewportHeight,
      deviceScaleFactor: preset.deviceScaleFactor,
      screenshotScale: 1,
      forceExpandScrollable: true,
      scrollableSegmentationMode: "full-page-scroll-steps",
    })

    screenshotPayloads.push(screenshotPayload)
  }

  return renderScreenshotPayloadsToPdf(screenshotPayloads, {
    pdfTimeoutMs: 90000,
    pageWidthMm: preset.pageWidthMm,
    pageHeightMm: preset.pageHeightMm,
    pageMarginMm: preset.pageMarginMm,
    autoGrowPageHeight: false,
    maxPageHeightMm: 500,
  })
}
