"use client"

import { useState } from "react"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { Loader2, Pill } from "lucide-react"
import { useToast } from "@/hooks/use-toast"
import { useAuthDialog } from "@/lib/contexts/auth-dialog-context"
import { AuthDialogLink } from "@/components/auth-dialog/auth-dialog-trigger"
import { backendTarget } from "@/lib/api/backend-target"
import { signUpWithDotnet, usernameFromEmail } from "@/lib/api/auth-api"

export default function SignUpForm() {
  const { toast } = useToast()
  const { openSignIn } = useAuthDialog()
  const [isLoading, setIsLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [success, setSuccess] = useState<string | null>(null)

  const handleSubmit = async (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault()
    setIsLoading(true)
    setError(null)
    setSuccess(null)

    const formData = new FormData(e.currentTarget)
    const fullName = formData.get("fullName") as string
    const email = formData.get("email") as string
    const role = formData.get("role") as string
    const password = formData.get("password") as string

    try {
      if (backendTarget("AUTH") === "dotnet") {
        const parts = fullName.trim().split(/\s+/)
        const firstName = parts[0] ?? ""
        const lastName = parts.slice(1).join(" ")
        if (!firstName || !lastName) {
          setError("Please enter your first and last name.")
          return
        }
        const result = await signUpWithDotnet({ firstName, lastName, email, userName: usernameFromEmail(email), password })
        if (!result.ok) {
          setError(result.message)
          return
        }
        setSuccess("Account created. Please check your email to verify before signing in.")
        toast({
          title: "Account created",
          description: "Check your email to verify your account.",
          variant: "default",
        })
        setTimeout(() => openSignIn(), 3000)
        return
      }

      const { createClient } = await import("@/lib/supabase/client")
      const supabase = createClient()
      const { error } = await supabase.auth.signUp({
        email,
        password,
        options: {
          data: { full_name: fullName, role },
        },
      })

      if (error) {
        setError(error.message)
        return
      }

      setSuccess("Account created. Please check your email to verify.")
      toast({
        title: "Account created",
        description: "Check your email to verify your account.",
        variant: "default",
      })
      setTimeout(() => openSignIn(), 3000)
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
        <CardTitle className="text-xl font-bold text-[#0f172a]">Create account</CardTitle>
        <CardDescription className="text-[#64748b]">
          For existing pharmacies. New pharmacy? Use Get started.
        </CardDescription>
      </CardHeader>
      <CardContent>
        <form onSubmit={handleSubmit} className="space-y-4">
          {error && (
            <div className="rounded-lg border border-[#fecaca] bg-[#fef2f2] px-3 py-2.5 text-sm text-[#b91c1c]">
              {error}
            </div>
          )}
          {success && (
            <div className="rounded-lg border border-[#bbf7d0] bg-[#f0fdf4] px-3 py-2.5 text-sm text-[#166534]">
              {success}
            </div>
          )}

          <div className="space-y-2">
            <label htmlFor="fullName" className="text-sm font-medium text-[#334155]">
              Full name
            </label>
            <Input
              id="fullName"
              name="fullName"
              type="text"
              placeholder="John Smith"
              required
              className="h-11 border-[#e2e8f0] bg-[#f8fafb]"
            />
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
            />
          </div>
          <div className="space-y-2">
            <label htmlFor="role" className="text-sm font-medium text-[#334155]">
              Role
            </label>
            <Select name="role" required>
              <SelectTrigger className="h-11 border-[#e2e8f0] bg-[#f8fafb]">
                <SelectValue placeholder="Select role" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="admin">Administrator</SelectItem>
                <SelectItem value="pharmacist">Pharmacist</SelectItem>
                <SelectItem value="cashier">Cashier</SelectItem>
              </SelectContent>
            </Select>
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
                Creating account…
              </>
            ) : (
              "Create account"
            )}
          </Button>

          <p className="text-center text-sm text-[#64748b]">
            Already have an account?{" "}
            <AuthDialogLink mode="signin" className="font-medium text-[#0d9488] hover:underline">
              Sign in
            </AuthDialogLink>
          </p>
        </form>
      </CardContent>
    </Card>
  )
}
