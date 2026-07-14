import { redirect } from "next/navigation"
import { createClient } from "@/lib/supabase/server"
import { createServiceClient } from "@/lib/supabase/server"
import {
  getCompanyPlanFeatureDefaults,
  normalizeCompanySubscriptionSettings,
} from "@/lib/company-plan"
import { parseWhatsAppProviderSetting } from "@/lib/whatsapp-provider"

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
    const [{ data: featuresRow }, { data: subscriptionRow }, { data: providerRow }] = await Promise.all([
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
      service
        .from("company_settings")
        .select("value")
        .eq("company_id", companyId)
        .eq("key", "whatsapp_provider")
        .maybeSingle(),
    ])

    const features = featuresRow?.value as Record<string, unknown> | null
    const subscription = normalizeCompanySubscriptionSettings(subscriptionRow?.value)
    const whatsappProvider = parseWhatsAppProviderSetting(providerRow?.value)
    const planFeatures = await getCompanyPlanFeatureDefaults(service, subscription.plan_code)
    const campaignsEnabled =
      typeof features?.campaigns === "boolean"
        ? features.campaigns
        : planFeatures.campaigns

    if (!campaignsEnabled || whatsappProvider !== "bot") redirect("/")
  } catch {
    redirect("/")
  }

  return <>{children}</>
}
