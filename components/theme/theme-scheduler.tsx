"use client"

import { useEffect } from "react"
import { useTheme } from "next-themes"

type Props = {
  enabled: boolean
  lightTime: string // "HH:MM"
  darkTime: string  // "HH:MM"
}

function getMinutes(time: string) {
  const [h, m] = time.split(":").map(Number)
  return h * 60 + m
}

function resolveTheme(lightTime: string, darkTime: string): "light" | "dark" {
  const now = new Date()
  const current = now.getHours() * 60 + now.getMinutes()
  const light = getMinutes(lightTime)
  const dark = getMinutes(darkTime)

  if (light < dark) {
    return current >= light && current < dark ? "light" : "dark"
  } else {
    // dark period crosses midnight
    return current >= dark && current < light ? "dark" : "light"
  }
}

const OVERRIDE_KEY = "theme-manual-override"

export function ThemeScheduler({ enabled, lightTime, darkTime }: Props) {
  const { theme, setTheme } = useTheme()

  useEffect(() => {
    if (!enabled) return

    const apply = () => {
      const desired = resolveTheme(lightTime, darkTime)
      const hasOverride = localStorage.getItem(OVERRIDE_KEY) === "1"

      if (hasOverride && theme !== desired) {
        // User manually chose a different theme — wait until next natural transition
        return
      }

      // No override, or the next transition arrived and themes now agree — resume scheduler
      if (hasOverride) localStorage.removeItem(OVERRIDE_KEY)
      setTheme(desired)
    }

    apply()
    const interval = setInterval(apply, 60_000)
    return () => clearInterval(interval)
  }, [enabled, lightTime, darkTime, setTheme, theme])

  return null
}

/** Call this when the user manually toggles the theme so the scheduler backs off. */
export function markThemeManualOverride() {
  localStorage.setItem(OVERRIDE_KEY, "1")
}
