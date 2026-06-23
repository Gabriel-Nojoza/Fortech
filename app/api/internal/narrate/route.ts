import { NextRequest, NextResponse } from "next/server"

const OLLAMA_URL = process.env.OLLAMA_URL || "http://72.60.12.165:11434"
const NARRATE_SECRET = process.env.NARRATE_SECRET || process.env.N8N_CALLBACK_SECRET || ""

export async function POST(request: NextRequest) {
  const secret = request.headers.get("x-narrate-secret") ?? request.headers.get("x-callback-secret")
  if (NARRATE_SECRET && secret !== NARRATE_SECRET) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
  }

  const body = await request.json()
  const { document_base64 } = body
  const send_mode = String(body.send_mode ?? "none").replace(/^=+/, "")

  if (!document_base64) {
    return NextResponse.json({ error: "document_base64 obrigatorio" }, { status: 400 })
  }

  // Mantém apenas caracteres base64 válidos (A-Z, a-z, 0-9, +, /, =)
  const rawStr = String(document_base64)
  // n8n sends the = expression-mode prefix as part of the value — strip it along with any data URL prefix and whitespace
  const stripped = rawStr
    .replace(/^data:[^;]+;base64,/, "")
    .replace(/\s/g, "")
    .replace(/^=+/, "")

  const buf = Buffer.from(stripped, "base64")
  console.log("[narrate] raw:", rawStr.length, "stripped:", stripped.length, "buf:", buf.length, "first8:", stripped.substring(0, 8))

  if (buf.length < 100) {
    return NextResponse.json({
      error: "base64 muito curto",
      debug: { raw_length: rawStr.length, stripped_length: stripped.length, buf_length: buf.length }
    }, { status: 400 })
  }

  const cleanBase64 = buf.toString("base64")

  const model = process.env.OLLAMA_VISION_MODEL || "llava:latest"

  const ollamaRes = await fetch(`${OLLAMA_URL}/api/chat`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      model,
      stream: false,
      messages: [
        {
          role: "user",
          content: `Você é um analista sênior de BI (Business Intelligence), especialista em análise de relatórios comerciais, financeiros, vendas, fornecedores, equipes, carteiras e indicadores de desempenho.

Analise a imagem enviada e extraia todas as informações visíveis de forma estruturada, mesmo que estejam distribuídas em tabelas, gráficos, cards, indicadores ou rankings.

Caso algum dado não esteja visível ou legível, informe "Não identificado".

# 1. Resumo Geral
Identifique: Nome do relatório, Empresa, Período analisado, Área de negócio, Objetivo do relatório, Tipo de relatório.

# 2. Estrutura Organizacional
Identifique todos os níveis hierárquicos encontrados (Diretor, Gerente, Supervisor, Representante, Vendedor, Fornecedor, Equipe, Carteira, Cliente) e monte a hierarquia.

# 3. Metas e Resultados
Para cada pessoa, equipe, fornecedor ou unidade identificada, informe: Nome, Cargo/Função, Meta, Realizado, Gap, % Meta, Tendência, Clientes, Pedidos, Produtos, Cobertura, Sortimento, Faturamento (preencha apenas os indicadores encontrados).

# 4. Indicadores Principais
Extraia todos os KPIs identificados: Meta Total, Realizado, Gap, % Meta, Tendência, Faturamento, Pedidos, Clientes Positivados, Carteira, Cobertura, Sortimento, Ticket Médio, Mix de Produtos, Devoluções, Margem, Ranking e outros.

# 5. Destaques Positivos
Identifique melhor gerente, supervisor, representante, vendedor, fornecedor, equipe, maior faturamento, maior atingimento de meta, melhor cobertura e sortimento. Explique com base nos números.

# 6. Pontos de Atenção
Identifique quem está abaixo da meta, maiores gaps negativos, menor faturamento, tendências negativas, baixa cobertura, baixo sortimento, carteiras com risco.

# 7. Rankings
Monte rankings de Equipes, Supervisores, Representantes, Vendedores e Fornecedores quando houver dados suficientes.

# 8. Análise Gerencial
Explique o que os números mostram, quais áreas performam melhor/pior, oportunidades de crescimento e riscos para o fechamento do período.

# 9. Insights Executivos
Gere entre 5 e 10 insights acionáveis para a gestão.

# 10. Resumo Executivo Final
Produza um resumo executivo de até 15 linhas com: situação geral, meta x realizado, principais destaques e problemas, probabilidade de atingir a meta, recomendações e próximas ações sugeridas.

IMPORTANTE: Utilize todos os valores numéricos encontrados. Preserve nomes exatamente como aparecem. Não invente informações. Responda sempre em português.`,
          images: [cleanBase64],
        },
      ],
    }),
  })

  if (!ollamaRes.ok) {
    const err = await ollamaRes.text()
    return NextResponse.json({ error: `Ollama error: ${err}` }, { status: 502 })
  }

  const data = await ollamaRes.json()
  const narration: string = data?.message?.content ?? ""

  return NextResponse.json({ narration, send_mode })
}
