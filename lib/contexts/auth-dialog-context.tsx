"use client"

import { createContext, useCallback, useContext, useEffect, useMemo, useState } from "react"
import { usePathname, useRouter } from "next/navigation"
import { createClient } from "@/lib/supabase/client"

export type AuthDialogMode = "signin" | "onboarding" | "forgot"

interface AuthDialogContextValue {
  open: boolean
  mode: AuthDialogMode
  pharmacyCode?: string
  openSignIn: (pharmacyCode?: string) => void
  openGetStarted: () => void
  openForgotPassword: () => void
  close: () => void
}

const AuthDialogContext = createContext<AuthDialogContextValue | undefined>(undefined)

export function AuthDialogProvider({ children }: { children: React.ReactNode }) {
  const [open, setOpen] = useState(false)
  const [mode, setMode] = useState<AuthDialogMode>("signin")
  const [pharmacyCode, setPharmacyCode] = useState<string | undefined>(undefined)

  const router = useRouter()
  const pathname = usePathname()

  // Open modal when redirected with query params (e.g. middleware -> /?auth=signin).
  useEffect(() => {
    if (typeof window === "undefined") return

    const params = new URLSearchParams(window.location.search)
    const auth = params.get("auth")
    if (!auth) return

    ;(async () => {
      try {
        const { data } = await createClient().auth.getUser()
        if (data?.user) {
          router.replace("/dashboard", { scroll: false })
          return
        }

        if (auth === "signin") {
          const code = params.get("code") ?? undefined
          setMode("signin")
          setPharmacyCode(code ? code.trim().toLowerCase() : undefined)
          setOpen(true)
          return
        }

        if (auth === "onboarding") {
          setMode("onboarding")
          setPharmacyCode(undefined)
          setOpen(true)
          return
        }

        if (auth === "forgot" || auth === "forgot-password") {
          setMode("forgot")
          setOpen(true)
          return
        }
      } catch {
        // If session check fails, fall back to opening the modal.
        if (auth === "signin") {
          const code = params.get("code") ?? undefined
          setMode("signin")
          setPharmacyCode(code ? code.trim().toLowerCase() : undefined)
          setOpen(true)
          return
        }
        if (auth === "onboarding") {
          setMode("onboarding")
          setPharmacyCode(undefined)
          setOpen(true)
          return
        }

        if (auth === "forgot" || auth === "forgot-password") {
          setMode("forgot")
          setOpen(true)
          return
        }
      }
    })()
  }, [])

  const clearAuthParams = useCallback(() => {
    if (typeof window === "undefined") return

    const params = new URLSearchParams(window.location.search)
    const hasAuthParams = params.has("auth") || params.has("code")
    if (!hasAuthParams) return

    params.delete("auth")
    params.delete("code")

    const query = params.toString()
    const nextUrl = query ? `${pathname}?${query}` : pathname
    router.replace(nextUrl, { scroll: false })
  }, [pathname, router])

  const close = useCallback(() => {
    setOpen(false)
    clearAuthParams()
  }, [clearAuthParams])

  const openSignIn = useCallback((code?: string) => {
    ;(async () => {
      const { data } = await createClient().auth.getUser()
      if (data?.user) {
        router.replace("/dashboard", { scroll: false })
        return
      }

      setMode("signin")
      setPharmacyCode(code ? code.trim().toLowerCase() : undefined)
      setOpen(true)
    })()
  }, [])

  const openGetStarted = useCallback(() => {
    ;(async () => {
      const { data } = await createClient().auth.getUser()
      if (data?.user) {
        router.replace("/dashboard", { scroll: false })
        return
      }

      setMode("onboarding")
      setPharmacyCode(undefined)
      setOpen(true)
    })()
  }, [])

  const openForgotPassword = useCallback(() => {
    ;(async () => {
      const { data } = await createClient().auth.getUser()
      if (data?.user) {
        router.replace("/dashboard", { scroll: false })
        return
      }

      setMode("forgot")
      setOpen(true)
    })()
  }, [])

  const value = useMemo<AuthDialogContextValue>(
    () => ({
      open,
      mode,
      pharmacyCode,
      openSignIn,
      openGetStarted,
      openForgotPassword,
      close,
    }),
    [close, mode, open, openForgotPassword, openGetStarted, openSignIn, pharmacyCode],
  )

  return <AuthDialogContext.Provider value={value}>{children}</AuthDialogContext.Provider>
}

export function useAuthDialog() {
  const context = useContext(AuthDialogContext)
  if (!context) {
    throw new Error("useAuthDialog must be used within an AuthDialogProvider")
  }
  return context
}

