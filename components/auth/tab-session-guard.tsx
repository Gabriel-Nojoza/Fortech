"use client"

import { useEffect, useRef, useState } from "react"
import { useRouter } from "next/navigation"
import { createClient } from "@/lib/supabase/client"
import {
  clearSupabaseAuthCookies,
  clearTabSessionMarker,
  getOrCreateTabSessionId,
  hasSupabaseAuthCookies,
  hasTabSessionMarker,
  markTabSessionActive,
  releaseTabSession,
  touchTabSession,
} from "@/lib/supabase/tab-session"

const TAB_REVALIDATE_INTERVAL_MS = 5 * 60 * 1000

function isNetworkError(err: unknown): boolean {
  if (err instanceof TypeError) return true
  if (err instanceof Error) {
    const msg = err.message.toLowerCase()
    return (
      msg.includes("failed to fetch") ||
      msg.includes("networkerror") ||
      msg.includes("network request failed") ||
      msg.includes("load failed") ||
      msg.includes("fetch")
    )
  }
  return false
}

export function TabSessionGuard({
  children,
}: {
  children: React.ReactNode
}) {
  const router = useRouter()
  const hasCheckedRef = useRef(false)
  const isValidatingRef = useRef(false)
  const hiddenAtRef = useRef<number | null>(null)
  const [isReady, setIsReady] = useState(false)

  useEffect(() => {
    if (hasCheckedRef.current) {
      return
    }

    hasCheckedRef.current = true
    let isMounted = true
    const tabId = getOrCreateTabSessionId()

    const redirectToLogin = () => {
      if (typeof window !== "undefined") {
        window.location.replace("/auth/login")
        return
      }

      router.replace("/auth/login")
      router.refresh()
    }

    const verifyTabSession = async ({
      forceValidate = false,
      refreshOnSuccess = false,
    }: {
      forceValidate?: boolean
      refreshOnSuccess?: boolean
    } = {}) => {
      if (isValidatingRef.current) {
        return
      }

      isValidatingRef.current = true

      try {
        if (!hasSupabaseAuthCookies()) {
          clearTabSessionMarker()
          if (tabId) {
            releaseTabSession(tabId)
          }

          if (isMounted) {
            setIsReady(true)
          }

          return
        }

        // Nova aba: tem cookies mas nunca foi inicializada nesta aba → vai para login
        if (!hasTabSessionMarker()) {
          redirectToLogin()
          return
        }

        if (tabId) {
          touchTabSession(tabId)
        }

        const shouldValidateWithSupabase = forceValidate || !hasTabSessionMarker()

        if (!shouldValidateWithSupabase) {
          if (isMounted) {
            setIsReady(true)
          }

          return
        }

        const supabase = createClient()
        const timeout = new Promise<never>((_, reject) =>
          setTimeout(() => reject(new Error("timeout")), 5000)
        )
        const { data, error } = await Promise.race([
          supabase.auth.getUser(),
          timeout,
        ])

        if (error || !data.user) {
          throw error ?? new Error("Sessao invalida")
        }

        markTabSessionActive()

        if (!isMounted) {
          return
        }

        setIsReady(true)

      } catch (err) {
        if (err instanceof Error && err.message === "timeout") {
          if (isMounted) {
            setIsReady(true)
          }
          isValidatingRef.current = false
          return
        }

        if (isNetworkError(err)) {
          if (isMounted) {
            setIsReady(true)
          }
          isValidatingRef.current = false
          return
        }

        const supabase = createClient()

        try {
          await supabase.auth.signOut()
        } catch {
          // Cookie cleanup below is enough for a fresh login.
        }

        clearSupabaseAuthCookies()
        clearTabSessionMarker()

        if (!isMounted) {
          return
        }

        redirectToLogin()
      } finally {
        isValidatingRef.current = false
      }
    }

    const handleVisibilityChange = () => {
      if (document.visibilityState === "hidden") {
        hiddenAtRef.current = Date.now()
        if (tabId) {
          touchTabSession(tabId)
        }
        return
      }

      const hiddenForLong =
        hiddenAtRef.current !== null &&
        Date.now() - hiddenAtRef.current >= TAB_REVALIDATE_INTERVAL_MS

      hiddenAtRef.current = null

      // Delay slightly so the network can stabilize after sleep/wake.
      setTimeout(
        () => {
          void verifyTabSession({
            forceValidate: true,
            refreshOnSuccess: hiddenForLong,
          })
        },
        hiddenForLong ? 2000 : 500
      )
    }

    const handleWindowFocus = () => {
      // Small delay: network may not be ready immediately after the OS wakes.
      setTimeout(() => {
        void verifyTabSession({ forceValidate: true })
      }, 1000)
    }

    const heartbeatInterval = window.setInterval(() => {
      if (tabId) {
        touchTabSession(tabId)
      }
    }, 10_000)

    const handlePageHide = () => {
      if (tabId) {
        releaseTabSession(tabId)
      }
    }

    document.addEventListener("visibilitychange", handleVisibilityChange)
    window.addEventListener("focus", handleWindowFocus)
    window.addEventListener("pagehide", handlePageHide)

    void verifyTabSession({ forceValidate: true })

    return () => {
      isMounted = false
      window.clearInterval(heartbeatInterval)
      document.removeEventListener("visibilitychange", handleVisibilityChange)
      window.removeEventListener("focus", handleWindowFocus)
      window.removeEventListener("pagehide", handlePageHide)
    }
  }, [router])

  if (!isReady) {
    return null
  }

  return <>{children}</>
}
