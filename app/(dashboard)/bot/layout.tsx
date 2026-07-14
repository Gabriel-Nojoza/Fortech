import { redirect } from "next/navigation"
import { createClient, createServiceClient } from "@/lib/supabase/server"
import { normalizeBotModuleSettings } from "@/lib/bot"

export default async function BotLayout({ children }: { children: React.ReactNode }) {
  const supabase = await createClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()

  const companyId =
    typeof user?.app_metadata?.company_id === "string"
      ? user.app_metadata.company_id
      : typeof user?.user_metadata?.company_id === "string"
        ? user.user_metadata.company_id
        : null

  if (!companyId) redirect("/")

  try {
    const service = createServiceClient()
    const { data: botModuleRow } = await service
      .from("company_settings")
      .select("value")
      .eq("company_id", companyId)
      .eq("key", "bot_module")
      .maybeSingle()

    const botModuleEnabled = normalizeBotModuleSettings(botModuleRow?.value).enabled

    if (!botModuleEnabled) redirect("/")
  } catch {
    redirect("/")
  }

  return <>{children}</>
}
