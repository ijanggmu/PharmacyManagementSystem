"use client"

import { useState, useEffect } from "react"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Loader2, Pill, Building2 } from "lucide-react"
import Link from "next/link"
import { useRouter } from "next/navigation"
import { createClient } from "@/lib/supabase/client"
import { useToast } from "@/hooks/use-toast"

interface LoginFormProps {
  /** Pre-filled pharmacy code (slug) e.g. from /t/[slug]/login */
  initialPharmacyCode?: string
}

export default function LoginForm({ initialPharmacyCode }: LoginFormProps) {
  const router = useRouter()
  const { toast } = useToast()
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
    <Card className="w-full border-[#e2e8f0] bg-white shadow-lg shadow-[#0f172a]/5">
      <CardHeader className="space-y-1 text-center pb-2">
        <div className="mx-auto flex h-12 w-12 items-center justify-center rounded-xl bg-[#0d9488] text-white shadow-md">
          <Pill className="h-6 w-6" strokeWidth={2.5} />
        </div>
        <CardTitle className="text-xl font-bold text-[#0f172a]">Sign in</CardTitle>
        <CardDescription className="text-[#64748b]">
          {resolvedPharmacyName ? `Log in to ${resolvedPharmacyName}` : "Enter your credentials"}
        </CardDescription>
      </CardHeader>
      <CardContent>
        <form onSubmit={handleSubmit} className="space-y-4">
          {error && (
            <div className="rounded-lg border border-[#fecaca] bg-[#fef2f2] px-3 py-2.5 text-sm text-[#b91c1c]">
              {error}
            </div>
          )}

          <div className="space-y-2">
            <label htmlFor="pharmacyCode" className="text-sm font-medium text-[#334155]">
              Pharmacy code <span className="text-[#94a3b8]">(optional)</span>
            </label>
            <div className="relative">
              <Building2 className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-[#94a3b8]" />
              <Input
                id="pharmacyCode"
                name="pharmacyCode"
                type="text"
                placeholder="e.g. acme-pharmacy"
                value={pharmacyCode}
                onChange={(e) => setPharmacyCode(e.target.value)}
                className="h-11 pl-9 border-[#e2e8f0] bg-[#f8fafb]"
                autoComplete="organization"
              />
            </div>
            {resolvedPharmacyName && (
              <p className="text-xs text-[#0d9488]">Logging in to: {resolvedPharmacyName}</p>
            )}
          </div>

          <div className="space-y-2">
            <label htmlFor="email" className="text-sm font-medium text-[#334155]">
              Email
            </label>
            <Input
              id="email"
              name="email"
              type="email"
              placeholder="you@example.com"
              required
              className="h-11 border-[#e2e8f0] bg-[#f8fafb]"
              autoComplete="email"
            />
          </div>

          <div className="space-y-2">
            <label htmlFor="password" className="text-sm font-medium text-[#334155]">
              Password
            </label>
            <Input
              id="password"
              name="password"
              type="password"
              required
              className="h-11 border-[#e2e8f0] bg-[#f8fafb]"
              autoComplete="current-password"
            />
          </div>

          <Button
            type="submit"
            disabled={isLoading}
            className="w-full h-11 bg-[#0d9488] font-semibold text-white hover:bg-[#0f766e]"
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

          <p className="text-center text-sm text-[#64748b]">
            Don't have an account?{" "}
            <Link href="/auth/sign-up" className="font-medium text-[#0d9488] hover:underline">
              Sign up
            </Link>
          </p>
        </form>
      </CardContent>
    </Card>
  )
}
