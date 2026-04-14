import { SidebarInset, SidebarProvider } from "@/components/ui/sidebar"
import { AppSidebar } from "@/components/dashboard/sidebar-nav"
import { TabSessionGuard } from "@/components/auth/tab-session-guard"
import { createClient } from "@/lib/supabase/server"
import { createServiceClient } from "@/lib/supabase/server"
import { PowerBIAutoSyncWatcher } from "@/components/powerbi/auto-sync-watcher"
import { MiniChat } from "@/components/chat/mini-chat"

export default async function DashboardLayout({
  children,
}: {
  children: React.ReactNode
}) {
  const supabase = await createClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()

  // Verifica se o chat está habilitado para a empresa
  const companyId =
    (user?.app_metadata?.company_id as string) ??
    (user?.user_metadata?.company_id as string) ??
    null

  let chatEnabled = false
  if (companyId) {
    const serviceClient = createServiceClient()
    const { data: setting } = await serviceClient
      .from("company_settings")
      .select("value")
      .eq("company_id", companyId)
      .eq("key", "general")
      .maybeSingle()
    const val = setting?.value as Record<string, unknown> | null
    chatEnabled = Boolean(val?.chat_enabled)
  }

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

  return (
    <TabSessionGuard>
      <PowerBIAutoSyncWatcher />
      <SidebarProvider>
        <AppSidebar currentUser={currentUser} />
        <SidebarInset>{children}</SidebarInset>
      </SidebarProvider>
      {chatEnabled && <MiniChat />}
    </TabSessionGuard>
  )
}
