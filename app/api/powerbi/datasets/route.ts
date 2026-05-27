import { NextResponse } from "next/server"
import { getAccessToken, listDatasets } from "@/lib/powerbi"
import { createServiceClient as createClient } from "@/lib/supabase/server"
import { getRequestContext } from "@/lib/tenant"
import {
  getWorkspaceAccessScope,
  isWorkspaceAllowed,
} from "@/lib/workspace-access"

export async function GET(request: Request) {
  try {
    const context = await getRequestContext()
    const { companyId } = context
    const supabase = createClient()
    const scope = await getWorkspaceAccessScope(supabase, context)
    const { searchParams } = new URL(request.url)
    const workspaceId = searchParams.get("workspaceId")

    if (!workspaceId) {
      return NextResponse.json(
        { error: "workspaceId obrigatorio" },
        { status: 400 }
      )
    }

    console.log("[datasets] companyId:", companyId, "workspaceId:", workspaceId, "role:", context.role, "scope.workspaceRestricted:", scope.workspaceRestricted, "scope.datasetRestricted:", scope.datasetRestricted)

    if (!isWorkspaceAllowed(scope, { pbiWorkspaceId: workspaceId })) {
      console.log("[datasets] BLOQUEADO: workspace nao permitido no scope")
      return NextResponse.json(
        { error: "Workspace nao permitido para este usuario" },
        { status: 403 }
      )
    }

    const { data: workspace, error: wsError } = await supabase
      .from("workspaces")
      .select("id")
      .eq("company_id", companyId)
      .eq("pbi_workspace_id", workspaceId)
      .limit(1)
      .maybeSingle()

    console.log("[datasets] workspace DB check:", workspace, "error:", wsError)

    if (!workspace) {
      console.log("[datasets] BLOQUEADO: workspace nao encontrado no DB para companyId:", companyId)
      return NextResponse.json(
        { error: "Workspace nao pertence a empresa do usuario" },
        { status: 403 }
      )
    }

    console.log("[datasets] buscando token Power BI...")
    const token = await getAccessToken()
    console.log("[datasets] token OK, listando datasets do workspace:", workspaceId)
    const datasets = await listDatasets(token, workspaceId)
    console.log("[datasets] datasets retornados pela API PBI:", datasets.length)
    const filteredDatasets = scope.datasetRestricted
      ? datasets.filter((dataset) => scope.datasetIds.includes(String(dataset.id ?? "")))
      : datasets
    console.log("[datasets] filteredDatasets:", filteredDatasets.length)

    return NextResponse.json(filteredDatasets)
  } catch (error) {
    console.error("[datasets] ERRO:", error)
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Erro desconhecido" },
      { status: 500 }
    )
  }
}
