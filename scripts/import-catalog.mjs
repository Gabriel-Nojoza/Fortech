/**
 * Importa o catálogo do dataset a partir de um arquivo .completo.json
 * para o Supabase (company_settings → automation_catalogs).
 *
 * Uso:
 *   node scripts/import-catalog.mjs <COMPANY_ID> <DATASET_ID> [caminho-do-json]
 *
 * Exemplo:
 *   node scripts/import-catalog.mjs abc-123 e91fc9e3-ad93-4422-a8ac-af0f37616673 JA_DIRETORIA_AUTOMACAO_1.completo.json
 *
 * Se não passar o caminho, usa JA_DIRETORIA_AUTOMACAO_1.completo.json por padrão.
 */

import { createClient } from "@supabase/supabase-js"
import { readFileSync } from "fs"
import { resolve } from "path"
import { fileURLToPath } from "url"
import { dirname } from "path"

const __dirname = dirname(fileURLToPath(import.meta.url))
const rootDir = resolve(__dirname, "..")

// Lê variáveis de ambiente do .env manualmente
function loadEnv() {
  try {
    const envPath = resolve(rootDir, ".env")
    const raw = readFileSync(envPath, "utf-8")
    const vars = {}
    for (const line of raw.split("\n")) {
      const trimmed = line.trim()
      if (!trimmed || trimmed.startsWith("#")) continue
      const eqIdx = trimmed.indexOf("=")
      if (eqIdx < 0) continue
      const key = trimmed.slice(0, eqIdx).trim()
      const val = trimmed.slice(eqIdx + 1).trim()
      vars[key] = val
    }
    return vars
  } catch {
    return {}
  }
}

const env = loadEnv()
const SUPABASE_URL = env.NEXT_PUBLIC_SUPABASE_URL || process.env.NEXT_PUBLIC_SUPABASE_URL
const SUPABASE_KEY = env.SUPABASE_SERVICE_ROLE_KEY || process.env.SUPABASE_SERVICE_ROLE_KEY

if (!SUPABASE_URL || !SUPABASE_KEY) {
  console.error("❌  NEXT_PUBLIC_SUPABASE_URL ou SUPABASE_SERVICE_ROLE_KEY não encontrados no .env")
  process.exit(1)
}

const [, , companyId, datasetId, jsonPath] = process.argv

if (!companyId || !datasetId) {
  console.error("Uso: node scripts/import-catalog.mjs <COMPANY_ID> <DATASET_ID> [caminho-json]")
  console.error("Exemplo: node scripts/import-catalog.mjs abc-123 e91fc9e3-ad93-4422-a8ac-af0f37616673")
  process.exit(1)
}

const resolvedJsonPath = resolve(rootDir, jsonPath || "JA_DIRETORIA_AUTOMACAO_1.completo.json")
console.log(`📂  Lendo: ${resolvedJsonPath}`)

// Lê o arquivo removendo BOM (UTF-8 e UTF-16) gerado pelo PowerShell
let fileContent = readFileSync(resolvedJsonPath)
// Remove BOM UTF-16 LE (FF FE) ou UTF-16 BE (FE FF)
if (fileContent[0] === 0xFF && fileContent[1] === 0xFE) {
  fileContent = fileContent.toString("utf-16le")
} else if (fileContent[0] === 0xFE && fileContent[1] === 0xFF) {
  fileContent = fileContent.toString("utf-16be")
} else {
  fileContent = fileContent.toString("utf-8")
}
// Remove BOM UTF-8 se presente (\uFEFF)
fileContent = fileContent.replace(/^\uFEFF/, "")

const raw = JSON.parse(fileContent)

// Detecta tipo de coluna pelo nome
function inferDataType(columnName) {
  const n = columnName.toLowerCase()
  if (n.includes("data") || n.includes("date") || n.includes("mês_ano") || n.includes("mes_ano")) return "DateTime"
  if (n.includes("ano") || n.includes("year") || n.includes("mes") || n.includes("mês") || n.includes("dia")) return "Int64"
  if (n.includes("cod") || n.includes("id") || n.includes("num") || n.includes("qtde") || n.includes("qtd")) return "Int64"
  if (n.includes("vl") || n.includes("valor") || n.includes("preco") || n.includes("preço") || n.includes("pct") || n.includes("%")) return "Double"
  return "String"
}

// Converte o .completo.json para o formato CatalogPayload
const tables = raw.tables.map((t) => ({
  name: t.table,
  description: "",
  isHidden: false,
}))

const columns = []
const measures = []

for (const t of raw.tables) {
  for (const col of (t.columns || [])) {
    columns.push({
      tableName: t.table,
      columnName: col,
      dataType: inferDataType(col),
      isHidden: false,
    })
  }
  for (const m of (t.measures || [])) {
    measures.push({
      tableName: t.table,
      measureName: m,
      expression: "",
    })
  }
}

const catalog = { tables, columns, measures }

console.log(`📊  Tabelas: ${tables.length} | Colunas: ${columns.length} | Medidas: ${measures.length}`)
console.log("📋  Medidas encontradas:")
measures.forEach((m) => console.log(`    - [${m.tableName}] ${m.measureName}`))
console.log("🔑  Colunas para agrupamento:")
columns.filter((c) => !["Medidas"].includes(c.tableName)).forEach((c) =>
  console.log(`    - ${c.tableName}[${c.columnName}] (${c.dataType})`)
)

const supabase = createClient(SUPABASE_URL, SUPABASE_KEY)

// Busca catálogos existentes
const { data: existing, error: fetchErr } = await supabase
  .from("company_settings")
  .select("value")
  .eq("company_id", companyId)
  .eq("key", "automation_catalogs")
  .maybeSingle()

if (fetchErr) {
  console.error("❌  Erro ao buscar catálogos existentes:", fetchErr.message)
  process.exit(1)
}

const currentCatalogs = (existing?.value && typeof existing.value === "object") ? existing.value : {}

const updatedCatalogs = {
  ...currentCatalogs,
  [datasetId]: {
    workspace_id: null,
    updated_at: new Date().toISOString(),
    catalog,
  },
}

const { error: upsertErr } = await supabase
  .from("company_settings")
  .upsert(
    {
      company_id: companyId,
      key: "automation_catalogs",
      value: updatedCatalogs,
      updated_at: new Date().toISOString(),
    },
    { onConflict: "company_id,key" }
  )

if (upsertErr) {
  console.error("❌  Erro ao salvar catálogo:", upsertErr.message)
  process.exit(1)
}

console.log(`\n✅  Catálogo importado com sucesso!`)
console.log(`    Company: ${companyId}`)
console.log(`    Dataset: ${datasetId}`)
console.log(`    Medidas: ${measures.length} | Colunas: ${columns.length}`)
