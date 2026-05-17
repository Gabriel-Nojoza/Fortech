import { redirect } from "next/navigation"
import { createClient } from "@/lib/supabase/server"
import { createServiceClient } from "@/lib/supabase/server"

export default async function CampaignsLayout({ children }: { children: React.ReactNode }) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()

  const companyId =
    typeof user?.app_metadata?.company_id === "string"
      ? user.app_metadata.company_id
      : typeof user?.user_metadata?.company_id === "string"
        ? user.user_metadata.company_id
        : null

  if (!companyId) redirect("/")

  try {
    const service = createServiceClient()
    const { data } = await service
      .from("company_settings")
      .select("value")
      .eq("company_id", companyId)
      .eq("key", "features")
      .maybeSingle()

    const features = data?.value as Record<string, unknown> | null
    if (features?.campaigns !== true) redirect("/")
  } catch {
    redirect("/")
  }

  return <>{children}</>
}
