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

export function ThemeScheduler({ enabled, lightTime, darkTime }: Props) {
  const { setTheme } = useTheme()

  useEffect(() => {
    if (!enabled) return

    const apply = () => setTheme(resolveTheme(lightTime, darkTime))
    apply()

    const interval = setInterval(apply, 60_000)
    return () => clearInterval(interval)
  }, [enabled, lightTime, darkTime, setTheme])

  return null
}
