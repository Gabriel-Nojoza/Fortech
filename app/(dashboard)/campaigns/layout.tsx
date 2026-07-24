import { redirect } from "next/navigation"
import { createClient } from "@/lib/supabase/server"
import { createServiceClient } from "@/lib/supabase/server"
import {
  getCompanyPlanFeatureDefaults,
  normalizeCompanySubscriptionSettings,
} from "@/lib/company-plan"

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
    const [{ data: featuresRow }, { data: subscriptionRow }] = await Promise.all([
      service
        .from("company_settings")
        .select("value")
        .eq("company_id", companyId)
        .eq("key", "features")
        .maybeSingle(),
      service
        .from("company_settings")
        .select("value")
        .eq("company_id", companyId)
        .eq("key", "subscription")
        .maybeSingle(),
    ])

    const features = featuresRow?.value as Record<string, unknown> | null
    const subscription = normalizeCompanySubscriptionSettings(subscriptionRow?.value)
    const planFeatures = await getCompanyPlanFeatureDefaults(service, subscription.plan_code)
    const campaignsEnabled =
      typeof features?.campaigns === "boolean"
        ? features.campaigns
        : planFeatures.campaigns

    if (!campaignsEnabled) redirect("/")
  } catch {
    redirect("/")
  }

  return <>{children}</>
}
