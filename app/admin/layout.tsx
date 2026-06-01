import { Suspense } from "react"
import { SidebarInset, SidebarProvider } from "@/components/ui/sidebar"
import { AdminSidebar } from "@/components/admin/admin-sidebar"
import { TabSessionGuard } from "@/components/auth/tab-session-guard"
import { createClient } from "@/lib/supabase/server"
import { createServiceClient } from "@/lib/supabase/server"
import { ThemeScheduler } from "@/components/theme/theme-scheduler"

export default async function AdminLayout({
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

  let themeSchedule = { enabled: false, light_time: "06:00", dark_time: "18:00" }
  try {
    const service = createServiceClient()
    const themeResult = await service
      .from("company_settings")
      .select("value")
      .eq("key", "theme_schedule")
      .maybeSingle()
    const ts = themeResult.data?.value as Record<string, unknown> | null
    if (ts) {
      themeSchedule = {
        enabled: ts.enabled === true,
        light_time: typeof ts.light_time === "string" ? ts.light_time : "06:00",
        dark_time: typeof ts.dark_time === "string" ? ts.dark_time : "18:00",
      }
    }
  } catch {
    // silently fallback
  }

  return (
    <TabSessionGuard>
      <ThemeScheduler enabled={themeSchedule.enabled} lightTime={themeSchedule.light_time} darkTime={themeSchedule.dark_time} />
      <SidebarProvider>
        <AdminSidebar currentUser={currentUser} />
        <SidebarInset>
          <Suspense>
            {children}
          </Suspense>
        </SidebarInset>
      </SidebarProvider>
    </TabSessionGuard>
  )
}
