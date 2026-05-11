import { NextResponse } from "next/server"
import { createServiceClient as createClient } from "@/lib/supabase/server"
import { getAccessToken, listReportPages, listReports } from "@/lib/powerbi"
import { getRequestContext } from "@/lib/tenant"
import {
  getWorkspaceAccessScope,
  isDatasetAllowed,
  isWorkspaceAllowed,
} from "@/lib/workspace-access"

export async function GET(request: Request) {
  try {
    const context = await getRequestContext()
    const { companyId } = context
    const supabase = createClient()
    const scope = await getWorkspaceAccessScope(supabase, context)
    const { searchParams } = new URL(request.url)
    const workspaceId = searchParams.get("workspaceId")?.trim()
    const reportId = searchParams.get("reportId")?.trim()

    if (!workspaceId) {
      return NextResponse.json({ error: "workspaceId obrigatorio" }, { status: 400 })
    }

    if (!reportId) {
      return NextResponse.json({ error: "reportId obrigatorio" }, { status: 400 })
    }

    if (!isWorkspaceAllowed(scope, { pbiWorkspaceId: workspaceId })) {
      return NextResponse.json(
        { error: "Workspace nao permitido para este usuario" },
        { status: 403 }
      )
    }

    const { data: workspace } = await supabase
      .from("workspaces")
      .select("id")
      .eq("company_id", companyId)
      .eq("pbi_workspace_id", workspaceId)
      .single()

    if (!workspace) {
      return NextResponse.json(
        { error: "Workspace nao pertence a empresa do usuario" },
        { status: 403 }
      )
    }

    const token = await getAccessToken()
    const reports = await listReports(token, workspaceId)
    const report = reports.find((item) => item.id === reportId)

    if (!report) {
      return NextResponse.json(
        { error: "Relatorio nao encontrado no workspace selecionado" },
        { status: 404 }
      )
    }

    if (!isDatasetAllowed(scope, String(report.datasetId ?? ""))) {
      return NextResponse.json(
        { error: "Relatorio nao permitido para este usuario" },
        { status: 403 }
      )
    }

    const pages = await listReportPages(token, workspaceId, reportId)

    return NextResponse.json({
      reportId,
      pages: pages
        .slice()
        .sort((left, right) => left.order - right.order)
        .map((page) => ({
          name: page.name,
          displayName: page.displayName,
          order: page.order,
        })),
    })
  } catch (error) {
    return NextResponse.json(
      {
        error:
          error instanceof Error
            ? error.message
            : "Erro ao carregar paginas direto do Power BI",
      },
      { status: 500 }
    )
  }
}
