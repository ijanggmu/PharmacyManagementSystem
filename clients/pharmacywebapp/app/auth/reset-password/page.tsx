"use client"

/**
 * Reset-password landing page. Reached from the emailed reset link, which UserPasswordService
 * (backend) builds as `${origin}/reset-password?token=...&email=...&tenant=...` — see
 * ForgotPasswordAsync in Modules.Identity/Services/UserPasswordService.cs. This route lives under
 * /auth to match the other standalone auth pages (login, sign-up); the backend's "origin" is the
 * app's own base URL, so the emailed path segment matches regardless of where under it we mount.
 */

import { Suspense, useState } from "react"
import { useRouter, useSearchParams } from "next/navigation"
import Link from "next/link"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Loader2, KeyRound, CheckCircle2, Eye, EyeOff } from "lucide-react"
import { resetPasswordWithDotnet } from "@/lib/api/auth-api"

function ResetPasswordForm() {
  const router = useRouter()
  const params = useSearchParams()
  const token = params.get("token") ?? ""
  const email = params.get("email") ?? ""
  const tenant = params.get("tenant") ?? undefined

  const [password, setPassword] = useState("")
  const [confirmPassword, setConfirmPassword] = useState("")
  const [showPassword, setShowPassword] = useState(false)
  const [isLoading, setIsLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [done, setDone] = useState(false)

  const missingLink = !token || !email

  const handleSubmit = async (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault()
    setError(null)

    if (password.length < 8) {
      setError("Password must be at least 8 characters.")
      return
    }
    if (password !== confirmPassword) {
      setError("Passwords don't match.")
      return
    }

    setIsLoading(true)
    try {
      const result = await resetPasswordWithDotnet({ email, token, password, tenant })
      if (!result.ok) {
        setError(result.message || "This reset link is invalid or has expired. Please request a new one.")
        return
      }
      setDone(true)
    } catch {
      setError("Something went wrong. Please try again.")
    } finally {
      setIsLoading(false)
    }
  }

  return (
    <div className="flex min-h-screen items-center justify-center bg-muted/30 px-4 py-12">
      <div className="w-full max-w-sm rounded-2xl border bg-card p-6 shadow-sm">
        <header className="mb-6 flex flex-col items-center text-center">
          <div className="mb-4 flex h-14 w-14 items-center justify-center rounded-2xl bg-teal-600 text-white shadow-md shadow-teal-600/25">
            <KeyRound className="h-7 w-7" strokeWidth={2.5} aria-hidden />
          </div>
          <h1 className="font-display text-xl font-bold tracking-tight text-foreground">
            {done ? "Password updated" : "Set a new password"}
          </h1>
          {!done && (
            <p className="mt-1.5 max-w-sm text-sm text-muted-foreground">
              {email ? <>For <span className="font-medium text-foreground">{email}</span>.</> : "Choose a new password for your account."}
            </p>
          )}
        </header>

        {missingLink && !done ? (
          <div role="alert" className="rounded-lg border border-destructive/20 bg-destructive/5 px-4 py-3 text-sm text-destructive">
            This reset link is missing required information. Please request a new one from the sign-in screen.
          </div>
        ) : done ? (
          <div className="flex flex-col items-center gap-4 text-center">
            <CheckCircle2 className="h-10 w-10 text-success" aria-hidden />
            <p className="text-sm text-muted-foreground">Your password has been reset. You can now sign in.</p>
            <Button className="h-11 w-full font-semibold" onClick={() => router.push(tenant ? `/?auth=signin&code=${encodeURIComponent(tenant)}` : "/?auth=signin")}>
              Back to sign in
            </Button>
          </div>
        ) : (
          <form onSubmit={handleSubmit} className="space-y-4">
            {error && (
              <div role="alert" className="rounded-lg border border-destructive/20 bg-destructive/5 px-4 py-3 text-sm text-destructive">
                {error}
              </div>
            )}

            <div className="space-y-2">
              <label htmlFor="password" className="text-sm font-medium text-foreground">
                New password
              </label>
              <div className="relative">
                <Input
                  id="password"
                  type={showPassword ? "text" : "password"}
                  required
                  minLength={8}
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  className="h-11 bg-muted/30 pr-10"
                  autoComplete="new-password"
                  autoFocus
                />
                <button
                  type="button"
                  onClick={() => setShowPassword((prev) => !prev)}
                  aria-label={showPassword ? "Hide password" : "Show password"}
                  className="absolute right-1.5 top-1/2 flex h-8 w-8 -translate-y-1/2 items-center justify-center rounded-md text-muted-foreground hover:bg-muted hover:text-foreground"
                >
                  {showPassword ? <EyeOff className="h-4 w-4" aria-hidden /> : <Eye className="h-4 w-4" aria-hidden />}
                </button>
              </div>
            </div>

            <div className="space-y-2">
              <label htmlFor="confirmPassword" className="text-sm font-medium text-foreground">
                Confirm new password
              </label>
              <Input
                id="confirmPassword"
                type={showPassword ? "text" : "password"}
                required
                minLength={8}
                value={confirmPassword}
                onChange={(e) => setConfirmPassword(e.target.value)}
                className="h-11 bg-muted/30"
                autoComplete="new-password"
              />
            </div>

            <Button type="submit" disabled={isLoading} className="h-11 w-full bg-teal-600 font-semibold text-white shadow-sm hover:bg-teal-700">
              {isLoading ? (
                <>
                  <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                  Updating…
                </>
              ) : (
                "Reset password"
              )}
            </Button>
          </form>
        )}

        <p className="mt-6 text-center text-sm text-muted-foreground">
          <Link href="/?auth=signin" className="font-medium text-teal-600 hover:underline dark:text-teal-400">
            Back to sign in
          </Link>
        </p>
      </div>
    </div>
  )
}

// useSearchParams() needs a Suspense boundary, otherwise the static prerender of this
// route fails the production build ("missing-suspense-with-csr-bailout").
export default function ResetPasswordPage() {
  return (
    <Suspense
      fallback={
        <div className="flex min-h-screen items-center justify-center bg-muted/30 px-4 py-12" role="status" aria-live="polite">
          <Loader2 className="h-6 w-6 animate-spin text-primary" aria-hidden />
          <span className="sr-only">Loading…</span>
        </div>
      }
    >
      <ResetPasswordForm />
    </Suspense>
  )
}
