import { execFile } from "child_process"
import { promisify } from "util"
import * as fs from "fs"
import * as path from "path"
import * as os from "os"
import puppeteer from "puppeteer-core"

const execFileAsync = promisify(execFile)

const CHROME_PATHS = [
  "/usr/bin/google-chrome",
  "/usr/bin/google-chrome-stable",
  "/usr/bin/chromium-browser",
  "/usr/bin/chromium",
  "/snap/bin/chromium",
  "C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe",
  "C:\\Program Files (x86)\\Google\\Chrome\\Application\\chrome.exe",
  "C:\\Program Files\\Microsoft\\Edge\\Application\\msedge.exe",
  "C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe",
]

async function findChromePath(): Promise<string> {
  for (const p of CHROME_PATHS) {
    if (fs.existsSync(p)) return p
  }
  throw new Error(
    "Nao foi possivel encontrar o Chrome ou Edge instalado. Instale o Google Chrome e tente novamente."
  )
}

export async function pdfToPng(pdfBuffer: Buffer): Promise<Buffer> {
  const tmpDir = os.tmpdir()
  const id = `pbi_${Date.now()}_${Math.random().toString(36).slice(2)}`
  const tmpPdf = path.join(tmpDir, `${id}.pdf`)
  const tmpPng = path.join(tmpDir, `${id}.png`)

  try {
    await fs.promises.writeFile(tmpPdf, pdfBuffer)

    const gsArgs = [
      "-dNOPAUSE",
      "-dBATCH",
      "-sDEVICE=png16m",
      "-r150",
      "-dFirstPage=1",
      "-dLastPage=1",
      `-sOutputFile=${tmpPng}`,
      tmpPdf,
    ]

    // Windows usa gswin64c ou gswin32c; Linux/Mac usa gs
    const gsCandidates =
      process.platform === "win32"
        ? ["gswin64c", "gswin32c", "gs"]
        : ["gs"]

    let gsError: Error | null = null
    for (const cmd of gsCandidates) {
      try {
        await execFileAsync(cmd, gsArgs)
        gsError = null
        break
      } catch (err) {
        if ((err as NodeJS.ErrnoException).code === "ENOENT") {
          gsError = err as Error
          continue
        }
        throw err
      }
    }

    if (gsError) {
      throw new Error(
        process.platform === "win32"
          ? "Ghostscript nao encontrado. Instale em https://www.ghostscript.com/releases/gsdnld.html"
          : "Ghostscript (gs) nao encontrado. Instale com: apt-get install -y ghostscript"
      )
    }

    if (!fs.existsSync(tmpPng)) {
      throw new Error("Ghostscript nao gerou o arquivo PNG esperado")
    }

    return await fs.promises.readFile(tmpPng)
  } finally {
    fs.unlink(tmpPdf, () => {})
    fs.unlink(tmpPng, () => {})
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
