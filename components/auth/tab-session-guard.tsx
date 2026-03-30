"use client"

import { useEffect, useRef, useState } from "react"
import { useRouter } from "next/navigation"
import { createClient } from "@/lib/supabase/client"
import {
  clearFreshLoginRequirement,
  clearSupabaseAuthCookies,
  registerProtectedTab,
  clearTabSessionMarker,
  hasSupabaseAuthCookies,
  hasTabSessionMarker,
  markTabSessionActive,
  shouldRequireFreshLoginAfterClose,
  unregisterProtectedTab,
} from "@/lib/supabase/tab-session"

const TAB_REVALIDATE_INTERVAL_MS = 5 * 60 * 1000

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
          clearFreshLoginRequirement()
          clearTabSessionMarker()

          if (isMounted) {
            setIsReady(true)
          }

          return
        }

        if (!hasTabSessionMarker() && shouldRequireFreshLoginAfterClose()) {
          throw new Error("Sessao encerrada ao fechar a ultima janela")
        }

        const shouldValidateWithSupabase = forceValidate || !hasTabSessionMarker()

        if (!shouldValidateWithSupabase) {
          if (isMounted) {
            setIsReady(true)
          }

          return
        }

        const supabase = createClient()
        const { data, error } = await supabase.auth.getUser()

        if (error || !data.user) {
          throw error ?? new Error("Sessao invalida")
        }

        markTabSessionActive()

        if (!isMounted) {
          return
        }

        registerProtectedTab()
        setIsReady(true)

        if (refreshOnSuccess && typeof window !== "undefined") {
          window.location.reload()
        }
      } catch {
        const supabase = createClient()

        try {
          await supabase.auth.signOut()
        } catch {
          // The local cookie cleanup below is enough to force a fresh login.
        }

        clearSupabaseAuthCookies()
        clearFreshLoginRequirement()
        clearTabSessionMarker()
        unregisterProtectedTab()

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
        return
      }

      const hiddenForLong =
        hiddenAtRef.current !== null &&
        Date.now() - hiddenAtRef.current >= TAB_REVALIDATE_INTERVAL_MS

      hiddenAtRef.current = null
      void verifyTabSession({
        forceValidate: true,
        refreshOnSuccess: hiddenForLong,
      })
    }

    const handleWindowFocus = () => {
      void verifyTabSession({ forceValidate: true })
    }

    const handlePageHide = () => {
      unregisterProtectedTab()
    }

    document.addEventListener("visibilitychange", handleVisibilityChange)
    window.addEventListener("focus", handleWindowFocus)
    window.addEventListener("pagehide", handlePageHide)

    void verifyTabSession({ forceValidate: true })

    return () => {
      isMounted = false
      document.removeEventListener("visibilitychange", handleVisibilityChange)
      window.removeEventListener("focus", handleWindowFocus)
      window.removeEventListener("pagehide", handlePageHide)
      unregisterProtectedTab()
    }
  }, [router])

  if (!isReady) {
    return null
  }

  return <>{children}</>
}
