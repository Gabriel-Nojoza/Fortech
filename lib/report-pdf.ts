import puppeteer from "puppeteer-core"

const CHROME_PATHS = [
  // Linux
  "/usr/bin/google-chrome",
  "/usr/bin/google-chrome-stable",
  "/usr/bin/chromium-browser",
  "/usr/bin/chromium",
  "/snap/bin/chromium",
  // Windows
  "C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe",
  "C:\\Program Files (x86)\\Google\\Chrome\\Application\\chrome.exe",
  "C:\\Program Files\\Microsoft\\Edge\\Application\\msedge.exe",
  "C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe",
]

async function findChromePath(): Promise<string> {
  const fs = await import("fs")
  for (const p of CHROME_PATHS) {
    if (fs.existsSync(p)) return p
  }
  throw new Error(
    "Nao foi possivel encontrar o Chrome ou Edge instalado para gerar o PDF. Instale o Google Chrome e tente novamente."
  )
}

export async function pdfToPng(pdfBuffer: Buffer): Promise<Buffer> {
  const executablePath = await findChromePath()
  const browser = await puppeteer.launch({
    executablePath,
    headless: true,
    args: ["--no-sandbox", "--disable-setuid-sandbox", "--disable-gpu", "--enable-local-file-accesses"],
  })
  try {
    const page = await browser.newPage()
    await page.setViewport({ width: 1920, height: 1080 })
    const base64 = pdfBuffer.toString("base64")
    await page.goto(`data:application/pdf;base64,${base64}`, { waitUntil: "networkidle0", timeout: 30000 })
    await new Promise((r) => setTimeout(r, 1500))
    const screenshot = await page.screenshot({ type: "png", fullPage: false })
    return Buffer.from(screenshot)
  } finally {
    await browser.close()
  }
}

export async function buildPdfFromHtml(html: string): Promise<Buffer> {
  const executablePath = await findChromePath()

  const browser = await puppeteer.launch({
    executablePath,
    headless: true,
    args: ["--no-sandbox", "--disable-setuid-sandbox", "--disable-gpu"],
  })

  try {
    const page = await browser.newPage()
    await page.setContent(html, { waitUntil: "load" })
    const pdf = await page.pdf({
      format: "A4",
      landscape: true,
      printBackground: true,
      margin: { top: "20px", right: "20px", bottom: "20px", left: "20px" },
    })
    return Buffer.from(pdf)
  } finally {
    await browser.close()
  }
}
