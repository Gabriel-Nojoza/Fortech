import { NextResponse } from "next/server"
import OpenAI from "openai"
import { createServiceClient } from "@/lib/supabase/server"
import { getCatalogMap, getExecutionTarget } from "@/lib/automation-catalog"
import { getRequestContext, isAuthContextError } from "@/lib/tenant"
import { getAccessToken, executeDAXQuery, getDatasetMetadata } from "@/lib/powerbi"
import {
  getWorkspaceAccessScope,
  isDatasetAllowed,
  isWorkspaceAllowed,
} from "@/lib/workspace-access"

const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY })

type Message = { role: "user" | "assistant"; content: string }

type MeasureRow = { tableName: string; measureName: string; expression: string }
type ColumnRow = { tableName: string; columnName: string; dataType: string; isHidden: boolean }
type TableRow = { name?: string; description?: string; isHidden?: boolean }
type MetadataPayload = {
  tables: TableRow[]
  columns: ColumnRow[]
  measures: MeasureRow[]
}
type DatasetCandidate = {
  sourceDatasetId: string
  executionDatasetId: string
  executionWorkspaceId: string | null
  datasetName: string | null
}
type TemporalContext = {
  month: number | null
  year: number | null
}

const MONTH_TOKENS: Array<{ month: number; tokens: string[] }> = [
  { month: 1, tokens: ["janeiro", "jan"] },
  { month: 2, tokens: ["fevereiro", "fev"] },
  { month: 3, tokens: ["marco", "março", "mar"] },
  { month: 4, tokens: ["abril", "abr"] },
  { month: 5, tokens: ["maio", "mai"] },
  { month: 6, tokens: ["junho", "jun"] },
  { month: 7, tokens: ["julho", "jul"] },
  { month: 8, tokens: ["agosto", "ago"] },
  { month: 9, tokens: ["setembro", "set"] },
  { month: 10, tokens: ["outubro", "out"] },
  { month: 11, tokens: ["novembro", "nov"] },
  { month: 12, tokens: ["dezembro", "dez"] },
]

/** Normaliza texto: minúsculo, sem acento, sem espaço/underscore */
function normalize(s: string) {
  return s
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[\s_\-]/g, "")
}

function getBrazilNow() {
  const now = new Date()
  const formatter = new Intl.DateTimeFormat("en-CA", {
    timeZone: "America/Sao_Paulo",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  })
  const parts = formatter.formatToParts(now)
  const year = Number(parts.find((part) => part.type === "year")?.value ?? now.getFullYear())
  const month = Number(parts.find((part) => part.type === "month")?.value ?? now.getMonth() + 1)
  const day = Number(parts.find((part) => part.type === "day")?.value ?? now.getDate())
  return { year, month, day }
}

function parseTemporalContext(query: string): TemporalContext {
  const normalized = normalize(query)
  const now = getBrazilNow()
  let month: number | null = null
  let year: number | null = null

  const explicitYearMatch = normalized.match(/(?:^|[^0-9])(20\d{2})(?:[^0-9]|$)/)
  if (explicitYearMatch) {
    year = Number(explicitYearMatch[1])
  }

  for (const entry of MONTH_TOKENS) {
    if (entry.tokens.some((token) => normalized.includes(normalize(token)))) {
      month = entry.month
      break
    }
  }

  if (
    normalized.includes("mesatual") ||
    normalized.includes("estemes") ||
    normalized.includes("nomesatual")
  ) {
    month = now.month
    year ??= now.year
  }

  if (normalized.includes("mespassado") || normalized.includes("ultimomes")) {
    month = now.month === 1 ? 12 : now.month - 1
    year ??= now.month === 1 ? now.year - 1 : now.year
  }

  if (
    normalized.includes("anoatual") ||
    normalized.includes("esteano") ||
    normalized.includes("noanoatual")
  ) {
    year = now.year
  }

  if (normalized.includes("anopassado") || normalized.includes("ultimoano")) {
    year = now.year - 1
  }

  if (month !== null && year === null) {
    year = now.year
  }

  return { month, year }
}

/**
 * Retorna as medidas mais relevantes para a pergunta do usuário.
 * Usa correspondência de tokens para encontrar medidas cujo nome
 * contém partes da pergunta (e vice-versa).
 */
function findRelevantMeasures(query: string, measures: MeasureRow[]): MeasureRow[] {
  const normQuery = normalize(query)
  // Tokens da query com pelo menos 3 chars
  const tokens = normQuery.match(/[a-z0-9]{3,}/g) ?? [normQuery]

  const scored = measures.map((m) => {
    const normName = normalize(m.measureName)
    let score = 0
    for (const token of tokens) {
      if (normName.includes(token)) score += 2
      if (normQuery.includes(normName)) score += 3
    }
    // Correspondência exata parcial
    if (normName.includes(normQuery) || normQuery.includes(normName)) score += 5
    return { m, score }
  })

  const relevant = scored.filter((s) => s.score > 0).sort((a, b) => b.score - a.score)
  // Retorna as top 10 mais relevantes, ou todas se < 10 relevantes
  return relevant.length > 0
    ? relevant.slice(0, 10).map((s) => s.m)
    : measures.slice(0, 30) // fallback: envia as primeiras 30 para o modelo decidir
}

function formatQueryResult(result: { columns: Array<{ name: string }>; rows: Array<Record<string, unknown>> }) {
  if (result.rows.length === 0) return "Nenhum dado retornado."

  const header = result.columns.map((c) => c.name).join(" | ")
  const rows = result.rows
    .slice(0, 50)
    .map((row) => result.columns.map((c) => String(row[c.name] ?? "")).join(" | "))
    .join("\n")

  const extra = result.rows.length > 50 ? `\n... e mais ${result.rows.length - 50} linhas.` : ""

  return `${header}\n${rows}${extra}`
}

function toUniqueNonEmptyStrings(values: Array<string | null | undefined>) {
  return Array.from(
    new Set(
      values
        .map((value) => (typeof value === "string" ? value.trim() : ""))
        .filter(Boolean)
    )
  )
}

async function resolveChatDatasetCandidates(input: {
  supabase: ReturnType<typeof createServiceClient>
  companyId: string
  context: Awaited<ReturnType<typeof getRequestContext>>
}) {
  const { supabase, companyId, context } = input
  const scope = await getWorkspaceAccessScope(supabase, context)
  const catalogs = await getCatalogMap(companyId)

  const { data: generalSetting } = await supabase
    .from("company_settings")
    .select("value")
    .eq("company_id", companyId)
    .eq("key", "general")
    .maybeSingle()

  const generalVal = generalSetting?.value as Record<string, unknown> | null
  const configuredChatDatasetIds = Array.isArray(generalVal?.chat_dataset_ids)
    ? generalVal.chat_dataset_ids.filter((value): value is string => typeof value === "string")
    : []

  const fallbackDatasetIds =
    configuredChatDatasetIds.length > 0
      ? configuredChatDatasetIds
      : context.selectedPbiDatasetIds.length > 0
        ? context.selectedPbiDatasetIds
        : scope.datasetIds.length > 0
          ? scope.datasetIds
          : []

  let datasetIds = toUniqueNonEmptyStrings(fallbackDatasetIds)

  if (datasetIds.length === 0) {
    const { data: reports } = await supabase
      .from("reports")
      .select("dataset_id")
      .eq("company_id", companyId)
      .eq("is_active", true)
      .not("dataset_id", "is", null)

    datasetIds = toUniqueNonEmptyStrings(
      (reports ?? []).map((report) =>
        typeof report.dataset_id === "string" ? report.dataset_id : null
      )
    )
  }

  const allowedDatasetIds = datasetIds.filter((datasetId) =>
    isDatasetAllowed(scope, datasetId)
  )

  return allowedDatasetIds.flatMap((datasetId) => {
    const executionTarget = getExecutionTarget(catalogs[datasetId], datasetId)

    if (!isDatasetAllowed(scope, executionTarget.datasetId)) {
      return []
    }

    if (
      executionTarget.workspaceId &&
      !isWorkspaceAllowed(scope, { pbiWorkspaceId: executionTarget.workspaceId })
    ) {
      return []
    }

    return [
      {
        sourceDatasetId: datasetId,
        executionDatasetId: executionTarget.datasetId,
        executionWorkspaceId: executionTarget.workspaceId,
        datasetName: executionTarget.datasetName,
      },
    ]
  })
}

async function loadDatasetMetadata(input: {
  companyId: string
  token: string
  sourceDatasetId: string
}) {
  const catalogs = await getCatalogMap(input.companyId)
  const catalogEntry = catalogs[input.sourceDatasetId]

  if (catalogEntry?.catalog) {
    return catalogEntry.catalog as MetadataPayload
  }

  return getDatasetMetadata(input.token, input.sourceDatasetId) as Promise<MetadataPayload>
}

export async function POST(request: Request) {
  try {
    let context
    try {
      context = await getRequestContext()
    } catch (err) {
      if (isAuthContextError(err)) {
        return NextResponse.json({ error: "Não autorizado" }, { status: 401 })
      }
      throw err
    }

    const { companyId } = context
    const supabase = createServiceClient()
    const { messages }: { messages: Message[] } = await request.json()

    if (!messages || !Array.isArray(messages) || messages.length === 0) {
      return NextResponse.json({ error: "Mensagens inválidas" }, { status: 400 })
    }

    const datasetCandidates = await resolveChatDatasetCandidates({
      supabase,
      companyId,
      context,
    })

    console.log(
      "[CHAT] Datasets para consulta:",
      datasetCandidates.map((candidate) => ({
        sourceDatasetId: candidate.sourceDatasetId,
        executionDatasetId: candidate.executionDatasetId,
        executionWorkspaceId: candidate.executionWorkspaceId,
      }))
    )

    // --- Busca schema do dataset ---
    let dataResult = ""
    const lastUserMsg = [...messages].reverse().find((m) => m.role === "user")?.content ?? ""
    const temporalContext = parseTemporalContext(lastUserMsg)
    const isListRequest = /o que (você|vc) sabe|o que (você|vc) (pode|consegue)|quais dados|que dados|me mostra|listar medidas|o que posso perguntar/i.test(lastUserMsg)

    if (datasetCandidates.length > 0) {
      try {
        const token = await getAccessToken(companyId)

        // Comando especial: listar medidas disponíveis
        if (isListRequest) {
          const allMeasures: string[] = []
          for (const candidate of datasetCandidates) {
            try {
              const metadata = await loadDatasetMetadata({
                companyId,
                token,
                sourceDatasetId: candidate.sourceDatasetId,
              })
              const measures = metadata.measures
              allMeasures.push(...measures.map((m) => m.measureName))
            } catch { /* ignora dataset com erro */ }
          }
          const unique = [...new Set(allMeasures)]
          if (unique.length > 0) {
            const lista = unique.map((n) => `- ${n}`).join("\n")
            dataResult = `\nDADOS RETORNADOS DO DATASET:\nMEDIDAS DISPONÍVEIS:\n${lista}\n`
          }
        }

        // Tenta cada dataset até encontrar dados
        if (!dataResult) for (const candidate of datasetCandidates) {
          try {
            const metadata = await loadDatasetMetadata({
              companyId,
              token,
              sourceDatasetId: candidate.sourceDatasetId,
            })
            const measures = metadata.measures
            const columns = metadata.columns.filter((c) => !c.isHidden)

            const relevantMeasures = findRelevantMeasures(lastUserMsg, measures)
            const measuresList = relevantMeasures
              .map((m) => `"${m.measureName}" (tabela: ${m.tableName})`)
              .join("\n")
            const columnsList = columns
              .slice(0, 120)
              .map((c) => `${c.tableName}[${c.columnName}] (${c.dataType})`)
              .join("\n")

            console.log(
              "[CHAT] Dataset:",
              candidate.sourceDatasetId,
              "| Execucao:",
              candidate.executionDatasetId,
              "| Medidas candidatas:",
              relevantMeasures.map((m) => m.measureName)
            )

            // Passo 1: modelo identifica a medida pelo nome exato
            const pickResponse = await openai.chat.completions.create({
              model: "gpt-4o-mini",
              response_format: { type: "json_object" },
              max_tokens: 256,
              messages: [
                {
                  role: "system",
                  content: `Você identifica qual medida do dataset responde à pergunta do usuário.

MEDIDAS DISPONÍVEIS (use o nome EXATO, incluindo espaços e maiúsculas):
${measuresList}

COLUNAS DISPONÍVEIS PARA FILTROS E AGRUPAMENTOS (use exatamente como está):
${columnsList}

Retorne SOMENTE um dos JSONs abaixo:
- Medida simples: {"type":"measure","measure":"NomeExato"}
- Medida com filtro de TEXTO: {"type":"filtered","measure":"NomeExato","filter_table":"TabelaDaColuna","filter_col":"NomeDaColuna","filter_val":"valor"}
- Medida com filtro de DATA: {"type":"date_filter","measure":"NomeExato","filter_table":"TabelaDaColuna","filter_col":"NomeDaColuna","filter_month":1,"filter_year":2025}
  - filter_month: 1=jan, 2=fev, 3=mar, 4=abr, 5=mai, 6=jun, 7=jul, 8=ago, 9=set, 10=out, 11=nov, 12=dez
  - filter_year: só inclua se o usuário mencionou explicitamente o ano (ex: "janeiro de 2025"). Se não mencionou, OMITA filter_year.
  - filter_table e filter_col DEVEM ser uma coluna do tipo DateTime/Date da lista COLUNAS acima — nunca use a tabela de medidas
- Agrupado por dimensão: {"type":"group","measure":"NomeExato","group_table":"Tabela","group_col":"Coluna"}
- Não é dado: {"type":"none"}

REGRAS IMPORTANTES:
1. Quando a pergunta contiver "por cliente", "por cada cliente", "clientes": use type "group" com a coluna de nome de cliente da lista COLUNAS acima (ex: PCCLIENTE[DESCRICAO]).
2. Quando a pergunta contiver "por vendedor", "por representante", "por supervisor": use type "group" com a coluna de vendedor/supervisor da lista COLUNAS.
3. Quando a pergunta contiver "por fornecedor", "por marca", "por divisão": use type "group" com a coluna de fornecedor da lista COLUNAS.
4. Quando a pergunta contiver "por filial", "por loja", "por unidade": use type "group" com a coluna de filial da lista COLUNAS.
5. Quando a pergunta contiver "por mês", "mensal", "por período": use type "group" com a coluna de mês/período da lista COLUNAS.
6. Para filtrar por um nome específico (ex: "do cliente X", "do vendedor Y"): use type "filtered" com filter_val = o nome exato.
7. group_table e group_col SEMPRE vêm da lista COLUNAS acima. Nunca invente nomes.
8. filter_table e filter_col sempre vêm da lista COLUNAS. Nunca invente nomes.`,
                },
                ...messages,
              ],
            })

            const pickRaw = pickResponse.choices[0]?.message?.content ?? "{}"
            console.log("[CHAT] Seleção:", pickRaw)
            const pick = JSON.parse(pickRaw) as {
              type: string; measure?: string; table?: string
              filter_table?: string; filter_col?: string; filter_val?: string
              filter_month?: number; filter_year?: number
              group_table?: string; group_col?: string
            }
            const effectivePickBase =
              pick.type === "measure" &&
              pick.measure &&
              (temporalContext.month !== null || temporalContext.year !== null)
                ? {
                    ...pick,
                    type: "date_filter",
                    filter_month: temporalContext.month ?? undefined,
                    filter_year: temporalContext.year ?? undefined,
                  }
                : pick
            const effectivePick =
              effectivePickBase.type === "date_filter"
                ? {
                    ...effectivePickBase,
                    filter_month:
                      effectivePickBase.filter_month ?? temporalContext.month ?? undefined,
                    filter_year:
                      effectivePickBase.filter_year ??
                      temporalContext.year ??
                      (effectivePickBase.filter_month ? getBrazilNow().year : undefined),
                  }
                : effectivePickBase

            // Passo 2: constrói o DAX com nomes exatos
            let dax: string | null = null
            if (effectivePick.type === "measure" && effectivePick.measure) {
              dax = `EVALUATE ROW("Resultado", [${effectivePick.measure}])`
            } else if (effectivePick.type === "filtered" && effectivePick.measure && effectivePick.filter_table && effectivePick.filter_col) {
              dax = `EVALUATE ROW("Resultado", CALCULATE([${effectivePick.measure}], ${effectivePick.filter_table}[${effectivePick.filter_col}] = "${effectivePick.filter_val ?? ""}"))`
            } else if (effectivePick.type === "date_filter" && effectivePick.measure) {
              const fm = effectivePick.filter_month
              const fy = effectivePick.filter_year
              if (fm || fy) {
                // Encontra todas as colunas de data disponíveis
                const dateCols = columns.filter((c) =>
                  c.dataType === "DateTime" || c.dataType === "Date" ||
                  String(c.dataType) === "9" || c.columnName.toLowerCase().includes("data") ||
                  c.columnName.toLowerCase().includes("date")
                )
                // Prioriza coluna validada pelo modelo, depois busca por nome
                const pickedCol = dateCols.find(
                  (c) => c.tableName === effectivePick.filter_table && c.columnName === effectivePick.filter_col
                ) ?? dateCols[0]

                if (pickedCol) {
                  const ref = `${pickedCol.tableName}[${pickedCol.columnName}]`
                  const conds: string[] = []
                  if (fm) conds.push(`MONTH(${ref}) = ${fm}`)
                  if (fy) conds.push(`YEAR(${ref}) = ${fy}`)
                  // Gera múltiplas queries: CALCULATE com FILTER (mais compatível) e com condição direta
                  const filterExpr = conds.map(c => `FILTER(ALL(${pickedCol.tableName}), ${c})`).join(", ")
                  dax = `EVALUATE ROW("Resultado", CALCULATE([${effectivePick.measure}], ${filterExpr}))`
                  console.log("[CHAT] Filtro de data via FILTER:", ref, "mês:", fm, "ano:", fy)
                } else {
                  dax = `EVALUATE ROW("Resultado", [${effectivePick.measure}])`
                }
              } else {
                dax = `EVALUATE ROW("Resultado", [${effectivePick.measure}])`
              }
            } else if (effectivePick.type === "group" && effectivePick.measure && effectivePick.group_table && effectivePick.group_col) {
              dax = `EVALUATE SUMMARIZECOLUMNS(${effectivePick.group_table}[${effectivePick.group_col}], "Total", [${effectivePick.measure}])`
            }

            if (!dax) continue // tenta próximo dataset

            console.log("[CHAT] DAX construído:", dax)

            // Passo 3: executa
            const result = await executeDAXQuery(
              token,
              candidate.executionDatasetId,
              dax
            )
            console.log("[CHAT] Resultado:", JSON.stringify(result).slice(0, 300))

            if (result.rows.length > 0) {
              // Verifica se há valor real (não null/blank)
              const hasValue = result.rows.some((row) =>
                result.columns.some((col: { name: string }) => row[col.name] !== null && row[col.name] !== undefined && row[col.name] !== "")
              )
              if (hasValue) {
                dataResult = `\nDADOS RETORNADOS DO DATASET:\n${formatQueryResult(result)}\n`
              } else {
                // Medida existe mas retornou null — informa o modelo
                dataResult = `\nMEDIDA_SEM_VALOR: A medida "${effectivePick.measure}" existe no dataset mas retornou vazio. Pode precisar de um filtro de período ou contexto.\n`
              }
              break
            }
          } catch (err) {
            console.error(
              "[CHAT] Erro no dataset",
              candidate.sourceDatasetId,
              err instanceof Error ? err.message : err
            )
          }
        }

        if (!dataResult) dataResult = `\nSEM_DADOS\n`
      } catch (err) {
        console.error("[CHAT] Erro no token:", err)
        dataResult = `\nFALHA_NO_SCHEMA: ${err instanceof Error ? err.message : "erro desconhecido"}\n`
      }
    }

    // --- Passo 3: Resposta final ---
    const hasMedidaSemValor = dataResult.includes("MEDIDA_SEM_VALOR")
    const hasDadosRetornados = dataResult.includes("DADOS RETORNADOS")
    const hasMedidasDisponiveis = dataResult.includes("MEDIDAS DISPONÍVEIS")
    const hasAnyData = hasDadosRetornados || hasMedidaSemValor || hasMedidasDisponiveis

    const systemPrompt = `Você é a SIL, assistente de inteligência analítica da Solução Inteligente.
${hasAnyData ? dataResult : ""}
**REGRAS ABSOLUTAS — SIGA NESTA ORDEM:**
1. Se há MEDIDAS DISPONÍVEIS acima: liste-as de forma amigável, agrupando por tema quando possível, e sugira exemplos de perguntas para cada grupo. Seja didático.
2. Se há DADOS RETORNADOS acima: use-os e responda com os valores reais. Formate números como R$ 1.234,56
3. Se há MEDIDA_SEM_VALOR acima: diga "A medida existe no dataset mas não retornou valor. Tente especificar um período (ex: 'em março', 'mês atual') ou um contexto (ex: nome do vendedor, filial)." — NADA MAIS
4. Se nenhuma das situações acima: responda apenas "Não encontrei esse dado no momento. Tente reformular a pergunta." — NADA MAIS
- Responda SEMPRE em português brasileiro
- PROIBIDO gerar qualquer código, fórmula, expressão DAX, SQL ou similar
- PROIBIDO explicar como calcular, como criar medidas ou como buscar dados
- PROIBIDO descrever tabelas, colunas ou estrutura do dataset
- Seja direto: responda o dado solicitado ou diga que não encontrou`

    const finalResponse = await openai.chat.completions.create({
      model: "gpt-4o-mini",
      max_tokens: 1024,
      messages: [
        { role: "system", content: systemPrompt },
        ...messages,
      ],
    })

    const text = finalResponse.choices[0]?.message?.content ?? ""
    return NextResponse.json({ message: text })
  } catch (error) {
    console.error("Chat API error:", error)
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Erro ao processar mensagem" },
      { status: 500 }
    )
  }
}
