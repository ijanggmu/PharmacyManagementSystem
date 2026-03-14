"use client"

import { useState } from "react"
import { useRouter } from "next/navigation"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card"
import { Loader2 } from "lucide-react"

export default function OnboardingPage() {
  const router = useRouter()
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

      const tenantCode = data?.data?.tenantCode
      if (tenantCode) {
        router.push(`/t/${encodeURIComponent(tenantCode)}/login`)
      } else {
        router.push("/auth/login")
      }
    } catch (err: any) {
      setError(err?.message || "Unexpected error during onboarding")
      setIsLoading(false)
    }
  }

  return (
    <div className="min-h-screen flex items-center justify-center bg-[#f8fafb] px-4 py-12">
      <Card className="w-full max-w-2xl border-[#e2e8f0] shadow-lg">
        <CardHeader>
          <CardTitle className="text-[#0f172a]">Get started with your pharmacy</CardTitle>
          <CardDescription className="text-[#64748b]">
            Create your workspace and first admin account. Your pharmacy code is used for the login URL (e.g. /t/your-code/login).
          </CardDescription>
        </CardHeader>
        <CardContent>
          <form onSubmit={handleSubmit} className="space-y-6">
            {error && (
              <div className="rounded-lg border border-[#fecaca] bg-[#fef2f2] px-4 py-3 text-sm text-[#b91c1c]">{error}</div>
            )}

            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div>
                <label className="block text-sm font-medium mb-1 text-[#334155]" htmlFor="pharmacyName">
                  Pharmacy name *
                </label>
                <Input id="pharmacyName" name="pharmacyName" required className="border-[#e2e8f0] bg-[#f8fafb]" />
              </div>
              <div>
                <label className="block text-sm font-medium mb-1 text-[#334155]" htmlFor="pharmacyCode">
                  Pharmacy code <span className="text-[#94a3b8]">(optional)</span>
                </label>
                <Input
                  id="pharmacyCode"
                  name="pharmacyCode"
                  placeholder="e.g. acme-pharmacy"
                  className="border-[#e2e8f0] bg-[#f8fafb]"
                />
                <p className="mt-1 text-xs text-[#64748b]">Used in login URL: /t/your-code/login</p>
              </div>
              <div>
                <label className="block text-sm font-medium mb-1 text-[#334155]" htmlFor="legalName">
                  Legal name
                </label>
                <Input id="legalName" name="legalName" className="border-[#e2e8f0] bg-[#f8fafb]" />
              </div>
              <div>
                <label className="block text-sm font-medium mb-1" htmlFor="licenseNumber">
                  License Number
                </label>
                <Input id="licenseNumber" name="licenseNumber" />
              </div>
              <div>
                <label className="block text-sm font-medium mb-1" htmlFor="country">
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
                <label className="block text-sm font-medium mb-1" htmlFor="timezone">
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
                <label className="block text-sm font-medium mb-1" htmlFor="currency">
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
                <label className="block text-sm font-medium mb-1" htmlFor="fiscalYearStartMonth">
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

            <div className="border-t pt-4 space-y-4">
              <h3 className="text-sm font-semibold">Admin User</h3>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div>
                  <label className="block text-sm font-medium mb-1" htmlFor="adminFullName">
                    Full Name *
                  </label>
                  <Input id="adminFullName" name="adminFullName" required />
                </div>
                <div>
                  <label className="block text-sm font-medium mb-1" htmlFor="adminEmail">
                    Email *
                  </label>
                  <Input id="adminEmail" name="adminEmail" type="email" required />
                </div>
                <div>
                  <label className="block text-sm font-medium mb-1" htmlFor="adminPassword">
                    Password *
                  </label>
                  <Input id="adminPassword" name="adminPassword" type="password" required />
                </div>
              </div>
            </div>

            <div className="border-t pt-4 space-y-4">
              <h3 className="text-sm font-semibold">Plan</h3>
              <div>
                <label className="block text-sm font-medium mb-1" htmlFor="planCode">
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
              className="w-full h-12 bg-[#0d9488] font-semibold hover:bg-[#0f766e]"
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
          </form>
        </CardContent>
      </Card>
    </div>
  )
}

