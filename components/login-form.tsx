"use client"

import { useState, useEffect } from "react"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Loader2, Pill, Building2 } from "lucide-react"
import { useRouter } from "next/navigation"
import { createClient } from "@/lib/supabase/client"
import { useToast } from "@/hooks/use-toast"
import { AuthDialogLink } from "@/components/auth-dialog/auth-dialog-trigger"
import { useAuthDialog } from "@/lib/contexts/auth-dialog-context"

interface LoginFormProps {
  /** Pre-filled pharmacy code (slug) e.g. from /t/[slug]/login */
  initialPharmacyCode?: string
}

export default function LoginForm({ initialPharmacyCode }: LoginFormProps) {
  const router = useRouter()
  const { toast } = useToast()
  const { close } = useAuthDialog()
  const [isLoading, setIsLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [pharmacyCode, setPharmacyCode] = useState(initialPharmacyCode ?? "")
  const [resolvedPharmacyName, setResolvedPharmacyName] = useState<string | null>(null)

  useEffect(() => {
    setPharmacyCode((prev) => initialPharmacyCode ?? prev)
  }, [initialPharmacyCode])

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
        setError(signInError.message)
        return
      }

      if (!authData.user) {
        setError("Sign in failed. Please try again.")
        return
      }

      const { data: appUser, error: userError } = await supabase
        .from("users")
        .select("tenant_id, role")
        .eq("id", authData.user.id)
        .single()

      if (userError || !appUser) {
        setError("Account not found. Please contact your administrator.")
        return
      }

      if (codeInput && appUser.tenant_id) {
        const { data: tenant } = await supabase
          .from("tenants")
          .select("code")
          .eq("id", appUser.tenant_id)
          .single()
        if (tenant && tenant.code !== codeInput) {
          await supabase.auth.signOut()
          setError("You don't have access to this pharmacy. Use the correct pharmacy code or leave it blank.")
          return
        }
      }
      // Superadmin (tenant_id null) can sign in with or without pharmacy code

      toast({
        title: "Signed in",
        description: resolvedPharmacyName ? `Welcome to ${resolvedPharmacyName}` : "Redirecting to dashboard…",
        variant: "default",
      })

      setTimeout(() => {
        close()
        router.push("/dashboard")
        router.refresh()
      }, 500)
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
            role="alert"
            className="rounded-lg border border-destructive/20 bg-destructive/5 px-3 py-2.5 text-sm text-destructive"
          >
            {error}
          </div>
        )}

        <div className="space-y-2">
          <label htmlFor="pharmacyCode" className="text-sm font-medium text-foreground">
            Pharmacy code <span className="font-normal text-muted-foreground">(optional)</span>
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
              onChange={(e) => setPharmacyCode(e.target.value)}
              className="h-11 bg-muted/30 pl-9"
              autoComplete="organization"
            />
          </div>
          {resolvedPharmacyName && (
            <p className="text-xs font-medium text-teal-600 dark:text-teal-400">Logging in to: {resolvedPharmacyName}</p>
          )}
        </div>

        <div className="space-y-2">
          <label htmlFor="email" className="text-sm font-medium text-foreground">
            Email
          </label>
          <Input
            id="email"
            name="email"
            type="email"
            placeholder="you@example.com"
            required
            className="h-11 bg-muted/30"
            autoComplete="email"
          />
        </div>

        <div className="space-y-2">
          <label htmlFor="password" className="text-sm font-medium text-foreground">
            Password
          </label>
          <Input
            id="password"
            name="password"
            type="password"
            required
            className="h-11 bg-muted/30"
            autoComplete="current-password"
          />
        </div>

        <Button
          type="submit"
          disabled={isLoading}
          className="h-11 w-full bg-teal-600 font-semibold text-white shadow-sm hover:bg-teal-700"
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
