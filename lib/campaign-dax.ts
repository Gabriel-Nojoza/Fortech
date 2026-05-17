import type { Campaign } from "@/lib/types"

export function buildCampaignDaxQuery(campaign: Pick<
  Campaign,
  "customer_table" | "date_column" | "days_inactive" | "dax_query" |
  "selected_columns" | "selected_measures" | "filters"
>): string | null {
  if (campaign.customer_table && campaign.date_column && campaign.days_inactive != null) {
    const table = campaign.customer_table
    const dateCol = campaign.date_column
    const days = campaign.days_inactive

    return [
      "EVALUATE",
      "FILTER(",
      `  '${table}',`,
      `  NOT ISBLANK('${table}'[${dateCol}])`,
      `    && DATEDIFF('${table}'[${dateCol}], TODAY(), DAY) >= ${days}`,
      ")",
    ].join("\n")
  }

  if (campaign.dax_query?.trim()) {
    return campaign.dax_query.trim()
  }

  return null
}
