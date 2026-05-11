import { NextResponse } from "next/server"
import { createServiceClient as createClient } from "@/lib/supabase/server"
import { getAccessToken, listReports } from "@/lib/powerbi"
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

    if (!workspaceId) {
      return NextResponse.json({ error: "workspaceId obrigatorio" }, { status: 400 })
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
    const filteredReports = scope.datasetRestricted
      ? reports.filter((report) => isDatasetAllowed(scope, String(report.datasetId ?? "")))
      : reports

    return NextResponse.json(
      filteredReports.map((report) => ({
        id: report.id,
        name: report.name,
        datasetId: report.datasetId,
        webUrl: report.webUrl,
        embedUrl: report.embedUrl,
      }))
    )
  } catch (error) {
    return NextResponse.json(
      {
        error:
          error instanceof Error
            ? error.message
            : "Erro ao carregar relatorios direto do Power BI",
      },
      { status: 500 }
    )
  }
}
