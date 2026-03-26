type DispatchLogLike = {
  status?: unknown
  error_message?: unknown
  created_at?: unknown
  started_at?: unknown
  completed_at?: unknown
}

function toValidDate(value: unknown) {
  if (typeof value !== "string" || !value.trim()) {
    return null
  }

  const parsed = new Date(value)
  return Number.isNaN(parsed.getTime()) ? null : parsed
}

export function getDispatchLogEffectiveDate(log: DispatchLogLike) {
  return (
    toValidDate(log.created_at) ??
    toValidDate(log.started_at) ??
    toValidDate(log.completed_at)
  )
}

export function getDispatchLogOutcome(log: DispatchLogLike) {
  const status = typeof log.status === "string" ? log.status.trim().toLowerCase() : ""
  const hasError =
    typeof log.error_message === "string" && log.error_message.trim().length > 0

  if (status === "delivered") {
    return "delivered" as const
  }

  if (status === "failed" || hasError) {
    return "failed" as const
  }

  return "ongoing" as const
}
