"use client"

import { useRef, useState, useEffect } from "react"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Loader2, Pill, Building2, Mail, Lock, Eye, EyeOff } from "lucide-react"
import { useRouter } from "next/navigation"
import { createClient } from "@/lib/supabase/client"
import { useToast } from "@/hooks/use-toast"
import { AuthDialogLink } from "@/components/auth-dialog/auth-dialog-trigger"
import { useAuthDialog } from "@/lib/contexts/auth-dialog-context"
import { getCSRFToken } from "@/lib/api/client-helpers"

function friendlyAuthError(message: string): string {
  if (/email.*not.*confirmed/i.test(message)) {
    return "We couldn't verify your account. Please contact your pharmacy admin for access."
  }
  if (/invalid.*credentials|invalid login/i.test(message)) {
    return "Incorrect email or password. Please try again."
  }
  return message
}

interface LoginFormProps {
  /** Pre-filled pharmacy code (slug) e.g. from /t/[slug]/login or tenant subdomain */
  initialPharmacyCode?: string
  /** When true, pharmacy code field is read-only (tenant URL / subdomain) */
  lockPharmacyCode?: boolean
}

export default function LoginForm({ initialPharmacyCode, lockPharmacyCode }: LoginFormProps) {
  const router = useRouter()
  const { toast } = useToast()
  const { close, openForgotPassword } = useAuthDialog()
  const [isLoading, setIsLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [pharmacyCode, setPharmacyCode] = useState(initialPharmacyCode ?? "")
  const [resolvedPharmacyName, setResolvedPharmacyName] = useState<string | null>(null)
  const [showPassword, setShowPassword] = useState(false)
  const emailRef = useRef<HTMLInputElement>(null)
  const passwordRef = useRef<HTMLInputElement>(null)
  const errorRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    setPharmacyCode((prev) => initialPharmacyCode ?? prev)
  }, [initialPharmacyCode])

  useEffect(() => {
    if (error) errorRef.current?.focus()
  }, [error])

  useEffect(() => {
    const code = (pharmacyCode ?? "").trim().toLowerCase()
    if (!code) {
      setResolvedPharmacyName(null)
      return
    }
    const t = setTimeout(() => {
      fetch(`/api/tenants/by-code/${encodeURIComponent(code)}`)
        .then((r) => r.json())
        .then((data) => setResolvedPharmacyName(data?.name ?? null))
        .catch(() => setResolvedPharmacyName(null))
    }, 300)
    return () => clearTimeout(t)
  }, [pharmacyCode])

  const handleSubmit = async (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault()
    setIsLoading(true)
    setError(null)

    const formData = new FormData(e.currentTarget)
    const email = formData.get("email") as string
    const password = formData.get("password") as string
    const codeInput = (formData.get("pharmacyCode") as string)?.trim().toLowerCase() || null

    try {
      const supabase = createClient()
      const { data: authData, error: signInError } = await supabase.auth.signInWithPassword({
        email,
        password,
      })

      if (signInError) {
        setError(friendlyAuthError(signInError.message))
        passwordRef.current?.focus()
        return
      }

      if (!authData.user) {
        setError("Sign in failed. Please try again.")
        return
      }

      const token = await getCSRFToken()
      const checkResponse = await fetch("/api/auth/post-login-check", {
        method: "POST",
        headers: { "Content-Type": "application/json", "X-CSRF-Token": token },
        body: JSON.stringify({ pharmacyCode: codeInput }),
      })
      if (!checkResponse.ok) {
        const body = await checkResponse.json().catch(() => null)
        await supabase.auth.signOut()
        setError(body?.error?.message || "Sign-in validation failed.")
        return
      }

      toast({
        title: "Signed in",
        description: resolvedPharmacyName ? `Welcome to ${resolvedPharmacyName}` : "Redirecting to dashboard…",
        variant: "default",
      })

      // Full navigation avoids a race between dialog close (router.replace) and client push to /dashboard.
      setTimeout(() => {
        if (typeof window !== "undefined") {
          window.location.assign("/dashboard")
        } else {
          close()
          router.push("/dashboard")
          router.refresh()
        }
      }, 400)
    } catch {
      setError("Something went wrong. Please try again.")
    } finally {
      setIsLoading(false)
    }
  }

  return (
    <div className="w-full">
      <header className="mb-6 flex flex-col items-center text-center">
        <div className="mb-4 flex h-14 w-14 items-center justify-center rounded-2xl bg-teal-600 text-white shadow-md shadow-teal-600/25">
          <Pill className="h-7 w-7" strokeWidth={2.5} aria-hidden />
        </div>
        <h2 className="font-display text-xl font-bold tracking-tight text-foreground">Sign in</h2>
        <p className="mt-1.5 max-w-sm text-sm text-muted-foreground">
          {resolvedPharmacyName ? `Log in to ${resolvedPharmacyName}` : "Enter your credentials to continue"}
        </p>
      </header>

      <form onSubmit={handleSubmit} className="space-y-4">
        {error && (
          <div
            ref={errorRef}
            role="alert"
            aria-live="assertive"
            tabIndex={-1}
            className="rounded-lg border border-destructive/20 bg-destructive/5 px-3 py-2.5 text-sm text-destructive outline-none animate-in fade-in slide-in-from-top-1 duration-200"
          >
            {error}
          </div>
        )}

        <div className="space-y-2">
          <label htmlFor="pharmacyCode" className="text-sm font-medium text-foreground">
            Pharmacy code{" "}
            <span className="font-normal text-muted-foreground">
              {lockPharmacyCode ? "(from your login link)" : "(required for pharmacy staff)"}
            </span>
          </label>
          <div className="relative">
            <Building2
              className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground"
              aria-hidden
            />
            <Input
              id="pharmacyCode"
              name="pharmacyCode"
              type="text"
              placeholder="e.g. acme-pharmacy"
              value={pharmacyCode}
              onChange={(e) => !lockPharmacyCode && setPharmacyCode(e.target.value)}
              readOnly={lockPharmacyCode}
              className="h-11 bg-muted/30 pl-9 read-only:opacity-90"
              autoComplete="organization"
            />
          </div>
          {resolvedPharmacyName && (
            <p className="text-xs font-medium text-teal-600 dark:text-teal-400">Logging in to: {resolvedPharmacyName}</p>
          )}
          {!lockPharmacyCode && (
            <p className="text-xs text-muted-foreground">
              Superadmin can leave this blank. Pharmacy users must use <span className="font-mono">/t/your-code/login</span>{" "}
              or enter their code.
            </p>
          )}
        </div>

        <div className="space-y-2">
          <label htmlFor="email" className="text-sm font-medium text-foreground">
            Email
          </label>
          <div className="relative">
            <Mail
              className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground"
              aria-hidden
            />
            <Input
              ref={emailRef}
              id="email"
              name="email"
              type="email"
              placeholder="you@example.com"
              required
              aria-invalid={!!error}
              className="h-11 bg-muted/30 pl-9"
              autoComplete="email"
              autoFocus
            />
          </div>
        </div>

        <div className="space-y-2">
          <label htmlFor="password" className="text-sm font-medium text-foreground">
            Password
          </label>
          <div className="relative">
            <Lock
              className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground"
              aria-hidden
            />
            <Input
              ref={passwordRef}
              id="password"
              name="password"
              type={showPassword ? "text" : "password"}
              required
              aria-invalid={!!error}
              className="h-11 bg-muted/30 pl-9 pr-10"
              autoComplete="current-password"
            />
            <button
              type="button"
              onClick={() => setShowPassword((prev) => !prev)}
              aria-label={showPassword ? "Hide password" : "Show password"}
              aria-pressed={showPassword}
              className="absolute right-1.5 top-1/2 flex h-8 w-8 -translate-y-1/2 cursor-pointer items-center justify-center rounded-md text-muted-foreground transition-colors hover:bg-muted hover:text-foreground focus-visible:outline-none focus-visible:ring-[3px] focus-visible:ring-ring/50"
            >
              {showPassword ? <EyeOff className="h-4 w-4" aria-hidden /> : <Eye className="h-4 w-4" aria-hidden />}
            </button>
          </div>
        </div>

        <div className="flex items-center justify-end">
          <button
            type="button"
            onClick={() => openForgotPassword()}
            className="cursor-pointer text-sm font-medium text-teal-600 hover:underline dark:text-teal-400"
          >
            Forgot password?
          </button>
        </div>

        <Button
          type="submit"
          disabled={isLoading}
          className="h-11 w-full cursor-pointer bg-teal-600 font-semibold text-white shadow-sm transition-colors hover:bg-teal-700 disabled:cursor-not-allowed"
        >
          {isLoading ? (
            <>
              <Loader2 className="mr-2 h-4 w-4 animate-spin" />
              Signing in…
            </>
          ) : (
            "Sign in"
          )}
        </Button>

        <p className="text-center text-sm text-muted-foreground">
          New pharmacy?{" "}
          <AuthDialogLink mode="onboarding" className="font-medium text-teal-600 hover:underline dark:text-teal-400">
            Create your pharmacy
          </AuthDialogLink>
        </p>
      </form>
    </div>
  )
}
