"use client"

import { useState } from "react"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select"
import { Loader2 } from "lucide-react"
import { useAuthDialog } from "@/lib/contexts/auth-dialog-context"

export function GetStartedForm() {
  const { openSignIn } = useAuthDialog()

  const [isLoading, setIsLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const handleSubmit = async (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault()
    setIsLoading(true)
    setError(null)

    const formData = new FormData(e.currentTarget)

    const payload = {
      pharmacyName: formData.get("pharmacyName"),
      pharmacyCode: formData.get("pharmacyCode") || undefined,
      legalName: formData.get("legalName"),
      licenseNumber: formData.get("licenseNumber"),
      country: formData.get("country"),
      timezone: formData.get("timezone"),
      currency: formData.get("currency"),
      fiscalYearStartMonth: Number(formData.get("fiscalYearStartMonth") || 4),
      adminFullName: formData.get("adminFullName"),
      adminEmail: formData.get("adminEmail"),
      adminPassword: formData.get("adminPassword"),
      planCode: formData.get("planCode") || "starter",
    }

    try {
      const res = await fetch("/api/onboarding", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify(payload),
      })

      const data = await res.json()

      if (!res.ok) {
        setError(data?.message || "Failed to complete onboarding")
        setIsLoading(false)
        return
      }

      const tenantCode = data?.data?.tenantCode as string | undefined
      openSignIn(tenantCode ? tenantCode : undefined)
    } catch (err: any) {
      setError(err?.message || "Unexpected error during onboarding")
      setIsLoading(false)
    }
  }

  return (
    <div className="w-full">
      <header className="mb-6 border-b border-border pb-5">
        <h2 className="font-display text-xl font-bold tracking-tight text-foreground">Get started</h2>
        <p className="mt-2 text-sm leading-relaxed text-muted-foreground">
          Create your workspace and first admin account. Your pharmacy code is used for the login URL (e.g.{" "}
          <span className="font-mono text-xs text-foreground/80">/t/your-code/login</span>).
        </p>
      </header>

      <form onSubmit={handleSubmit} className="space-y-6">
        {error && (
          <div
            role="alert"
            className="rounded-lg border border-destructive/20 bg-destructive/5 px-4 py-3 text-sm text-destructive"
          >
            {error}
          </div>
        )}

        <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
            <div>
              <label className="mb-1 block text-sm font-medium text-foreground" htmlFor="pharmacyName">
                Pharmacy name *
              </label>
              <Input id="pharmacyName" name="pharmacyName" required className="bg-muted/30" />
            </div>

            <div>
              <label className="mb-1 block text-sm font-medium text-foreground" htmlFor="pharmacyCode">
                Pharmacy code <span className="font-normal text-muted-foreground">(optional)</span>
              </label>
              <Input
                id="pharmacyCode"
                name="pharmacyCode"
                placeholder="e.g. acme-pharmacy"
                className="bg-muted/30"
              />
              <p className="mt-1 text-xs text-muted-foreground">Used in login URL: /t/your-code/login</p>
            </div>

            <div>
              <label className="mb-1 block text-sm font-medium text-foreground" htmlFor="legalName">
                Legal name
              </label>
              <Input id="legalName" name="legalName" className="bg-muted/30" />
            </div>

            <div>
              <label className="mb-1 block text-sm font-medium text-foreground" htmlFor="licenseNumber">
                License Number
              </label>
              <Input id="licenseNumber" name="licenseNumber" className="bg-muted/30" />
            </div>

            <div>
              <label className="mb-1 block text-sm font-medium text-foreground" htmlFor="country">
                Country *
              </label>
              <Select name="country" defaultValue="Nepal">
                <SelectTrigger>
                  <SelectValue placeholder="Select country" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="Nepal">Nepal</SelectItem>
                  <SelectItem value="India">India</SelectItem>
                  <SelectItem value="Other">Other</SelectItem>
                </SelectContent>
              </Select>
            </div>

            <div>
              <label className="mb-1 block text-sm font-medium text-foreground" htmlFor="timezone">
                Timezone *
              </label>
              <Select name="timezone" defaultValue="Asia/Kathmandu">
                <SelectTrigger>
                  <SelectValue placeholder="Select timezone" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="Asia/Kathmandu">Asia/Kathmandu (UTC +5:45)</SelectItem>
                  <SelectItem value="Asia/Kolkata">Asia/Kolkata (UTC +5:30)</SelectItem>
                  <SelectItem value="UTC">UTC</SelectItem>
                </SelectContent>
              </Select>
            </div>

            <div>
              <label className="mb-1 block text-sm font-medium text-foreground" htmlFor="currency">
                Currency *
              </label>
              <Select name="currency" defaultValue="NPR">
                <SelectTrigger>
                  <SelectValue placeholder="Select currency" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="NPR">NPR (रू)</SelectItem>
                  <SelectItem value="USD">USD ($)</SelectItem>
                  <SelectItem value="INR">INR (₹)</SelectItem>
                </SelectContent>
              </Select>
            </div>

            <div>
              <label className="mb-1 block text-sm font-medium text-foreground" htmlFor="fiscalYearStartMonth">
                Fiscal Year Start Month
              </label>
              <Select name="fiscalYearStartMonth" defaultValue="4">
                <SelectTrigger>
                  <SelectValue placeholder="Select month" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="1">January</SelectItem>
                  <SelectItem value="4">April</SelectItem>
                  <SelectItem value="7">July</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </div>

          <div className="space-y-4 border-t border-border pt-6">
            <h3 className="text-sm font-semibold text-foreground">Admin user</h3>

            <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
              <div>
                <label className="mb-1 block text-sm font-medium text-foreground" htmlFor="adminFullName">
                  Full Name *
                </label>
                <Input id="adminFullName" name="adminFullName" required className="bg-muted/30" />
              </div>

              <div>
                <label className="mb-1 block text-sm font-medium text-foreground" htmlFor="adminEmail">
                  Email *
                </label>
                <Input
                  id="adminEmail"
                  name="adminEmail"
                  type="email"
                  required
                  className="bg-muted/30"
                />
              </div>

              <div>
                <label className="mb-1 block text-sm font-medium text-foreground" htmlFor="adminPassword">
                  Password *
                </label>
                <Input id="adminPassword" name="adminPassword" type="password" required className="bg-muted/30" />
              </div>
            </div>
          </div>

          <div className="space-y-4 border-t border-border pt-6">
            <h3 className="text-sm font-semibold text-foreground">Plan</h3>

            <div>
              <label className="mb-1 block text-sm font-medium text-foreground" htmlFor="planCode">
                Subscription Plan
              </label>
              <Select name="planCode" defaultValue="starter">
                <SelectTrigger>
                  <SelectValue placeholder="Choose a plan" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="starter">Starter (Single pharmacy)</SelectItem>
                  <SelectItem value="standard">Standard (Growing pharmacy)</SelectItem>
                  <SelectItem value="pro">Pro (High volume)</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </div>

          <Button
            type="submit"
            disabled={isLoading}
            className="h-12 w-full bg-teal-600 font-semibold text-white shadow-sm hover:bg-teal-700"
          >
            {isLoading ? (
              <>
                <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                Creating pharmacy…
              </>
            ) : (
              "Create pharmacy"
            )}
          </Button>

          <p className="text-center text-sm text-muted-foreground">
            Already have an account?{" "}
            <button
              type="button"
              className="font-medium text-teal-600 hover:underline dark:text-teal-400"
              onClick={() => openSignIn()}
            >
              Sign in
            </button>
          </p>
        </form>
    </div>
  )
}

