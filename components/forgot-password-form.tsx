"use client"

import { useState } from "react"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Loader2, KeyRound } from "lucide-react"
import { useToast } from "@/hooks/use-toast"
import { useAuthDialog } from "@/lib/contexts/auth-dialog-context"
import { backendTarget } from "@/lib/api/backend-target"

export default function ForgotPasswordForm() {
  const { toast } = useToast()
  const { openSignIn, close } = useAuthDialog()

  const [isLoading, setIsLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const handleSubmit = async (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault()
    setIsLoading(true)
    setError(null)

    const formData = new FormData(e.currentTarget)
    const email = String(formData.get("email") || "").trim()

    try {
      if (backendTarget("AUTH") === "dotnet") {
        // The .NET path has no self-service reset flow yet.
        setError("Password reset is handled by your administrator")
        return
      }

      const { createClient } = await import("@/lib/supabase/client")
      const supabase = createClient()

      const redirectTo = `${typeof window !== "undefined" ? window.location.origin : ""}/auth/login`

      // Important: we intentionally show a generic message to avoid account enumeration.
      const { error: resetError } = await supabase.auth.resetPasswordForEmail(email, { redirectTo })

      if (resetError) {
        // eslint-disable-next-line no-console
        console.error("resetPasswordForEmail failed", resetError)
        setError("Request processed. If the email exists, a reset link will be sent shortly.")
      } else {
        setError("Request processed. If the email exists, a reset link will be sent shortly.")
      }
    } catch (err: any) {
      // eslint-disable-next-line no-console
      console.error("Forgot password failed", err)
      setError("Something went wrong. Please try again.")
    } finally {
      setIsLoading(false)
    }
  }

  return (
    <div className="w-full">
      <header className="mb-6 flex flex-col items-center text-center">
        <div className="mb-4 flex h-14 w-14 items-center justify-center rounded-2xl bg-teal-600 text-white shadow-md shadow-teal-600/25">
          <KeyRound className="h-7 w-7" strokeWidth={2.5} aria-hidden />
        </div>
        <h2 className="font-display text-xl font-bold tracking-tight text-foreground">Reset your password</h2>
        <p className="mt-1.5 max-w-sm text-sm text-muted-foreground">
          Enter your email and we’ll send you a reset link.
        </p>
      </header>

      <form onSubmit={handleSubmit} className="space-y-4">
        {error && (
          <div
            role="status"
            className="rounded-lg border border-border bg-muted/30 px-4 py-3 text-sm text-foreground"
          >
            {error}
          </div>
        )}

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
            disabled={isLoading}
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
              Sending…
            </>
          ) : (
            "Send reset link"
          )}
        </Button>

        <div className="flex items-center justify-between gap-3 pt-1">
          <button
            type="button"
            onClick={() => openSignIn()}
            className="text-sm font-medium text-teal-600 hover:underline dark:text-teal-400"
          >
            Back to sign in
          </button>
          <button
            type="button"
            onClick={() => close()}
            className="text-sm font-medium text-muted-foreground hover:underline"
          >
            Close
          </button>
        </div>
      </form>
    </div>
  )
}

