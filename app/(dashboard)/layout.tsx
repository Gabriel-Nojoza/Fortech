import { SidebarInset, SidebarProvider } from "@/components/ui/sidebar"
import { AppSidebar } from "@/components/dashboard/sidebar-nav"
import { TabSessionGuard } from "@/components/auth/tab-session-guard"
import { createClient } from "@/lib/supabase/server"
import { createServiceClient } from "@/lib/supabase/server"
import { PowerBIAutoSyncWatcher } from "@/components/powerbi/auto-sync-watcher"
import { FloatingChatLauncher } from "@/components/chat/floating-chat-launcher"

export default async function DashboardLayout({
  children,
}: {
  children: React.ReactNode
}) {
  const supabase = await createClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()

  const currentUser = user
    ? {
        email: user.email ?? null,
        name:
          typeof user.user_metadata?.name === "string"
            ? user.user_metadata.name
            : null,
        role:
          typeof user.app_metadata?.role === "string"
            ? user.app_metadata.role
            : typeof user.user_metadata?.role === "string"
              ? user.user_metadata.role
              : null,
      }
    : null

  // Busca feature flag do construtor de relatórios
  let reportBuilderEnabled = false
  const companyId =
    typeof user?.app_metadata?.company_id === "string"
      ? user.app_metadata.company_id
      : typeof user?.user_metadata?.company_id === "string"
        ? user.user_metadata.company_id
        : null

  if (companyId) {
    try {
      const service = createServiceClient()
      const { data } = await service
        .from("company_settings")
        .select("value")
        .eq("company_id", companyId)
        .eq("key", "features")
        .maybeSingle()
      reportBuilderEnabled = (data?.value as Record<string, unknown>)?.report_builder === true
    } catch {
      // silently fallback
    }
  }

  return (
    <TabSessionGuard>
      <PowerBIAutoSyncWatcher />
      <SidebarProvider>
        <AppSidebar currentUser={currentUser} reportBuilderEnabled={reportBuilderEnabled} />
        <SidebarInset className="min-w-0 overflow-x-hidden">
          {children}
          <FloatingChatLauncher />
        </SidebarInset>
      </SidebarProvider>
    </TabSessionGuard>
  )
}
