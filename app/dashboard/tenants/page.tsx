"use client"

import { useState, useEffect } from "react"
import { useRouter } from "next/navigation"
import DashboardLayout from "@/components/dashboard-layout"
import { PageContainer, PageHeader, Section } from "@/components/layouts"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
  DIALOG_CONTENT_DETAIL_CLASS,
} from "@/components/ui/dialog"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table"
import { LoadingState } from "@/components/ui/loading-state"
import { createClient } from "@/lib/supabase/client"
import { getCSRFToken } from "@/lib/api/client-helpers"
import { Building2, Plus } from "lucide-react"

interface TenantRow {
  id: string
  name: string
  code: string
  country: string | null
  timezone: string | null
  currency: string | null
  is_active: boolean
  created_at: string
}

export default function TenantsPage() {
  const router = useRouter()
  const [tenants, setTenants] = useState<TenantRow[]>([])
  const [loading, setLoading] = useState(true)
  const [role, setRole] = useState<string | null>(null)
  const [createOpen, setCreateOpen] = useState(false)
  const [submitting, setSubmitting] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [form, setForm] = useState({
    pharmacyName: "",
    legalName: "",
    licenseNumber: "",
    country: "Nepal",
    timezone: "Asia/Kathmandu",
    currency: "NPR",
    fiscalYearStartMonth: 4,
    adminFullName: "",
    adminEmail: "",
    adminPassword: "",
    planCode: "",
  })

  useEffect(() => {
    const checkAndLoad = async () => {
      const supabase = createClient()
      const { data: { user } } = await supabase.auth.getUser()
      if (!user) {
        router.replace("/auth/login")
        return
      }
      const { data: appUser } = await supabase
        .from("users")
        .select("role")
        .eq("id", user.id)
        .single()
      const userRole = (appUser as { role?: string } | null)?.role ?? null
      setRole(userRole)
      if (userRole !== "superadmin") {
        router.replace("/dashboard")
        return
      }
      try {
        const res = await fetch("/api/tenants")
        const json = await res.json()
        if (!res.ok) throw new Error(json?.error?.message ?? "Failed to load tenants")
        setTenants(json.data ?? [])
      } catch (e: any) {
        setError(e?.message ?? "Failed to load tenants")
      } finally {
        setLoading(false)
      }
    }
    checkAndLoad()
  }, [router])

  const handleCreateTenant = async (e: React.FormEvent) => {
    e.preventDefault()
    setSubmitting(true)
    setError(null)
    try {
      const token = await getCSRFToken()
      const res = await fetch("/api/tenants", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "X-CSRF-Token": token,
        },
        body: JSON.stringify({
          pharmacyName: form.pharmacyName,
          legalName: form.legalName || undefined,
          licenseNumber: form.licenseNumber || undefined,
          country: form.country,
          timezone: form.timezone,
          currency: form.currency,
          fiscalYearStartMonth: form.fiscalYearStartMonth,
          adminFullName: form.adminFullName,
          adminEmail: form.adminEmail,
          adminPassword: form.adminPassword,
          planCode: form.planCode || undefined,
        }),
      })
      const json = await res.json()
      if (!res.ok) throw new Error(json?.error?.message ?? "Failed to create tenant")
      setCreateOpen(false)
      setForm({
        pharmacyName: "",
        legalName: "",
        licenseNumber: "",
        country: "Nepal",
        timezone: "Asia/Kathmandu",
        currency: "NPR",
        fiscalYearStartMonth: 4,
        adminFullName: "",
        adminEmail: "",
        adminPassword: "",
        planCode: "",
      })
      const listRes = await fetch("/api/tenants")
      const listJson = await listRes.json()
      if (listRes.ok && Array.isArray(listJson.data)) setTenants(listJson.data)
    } catch (e: any) {
      setError(e?.message ?? "Failed to create tenant")
    } finally {
      setSubmitting(false)
    }
  }

  if (role !== null && role !== "superadmin") {
    return null
  }

  if (loading) {
    return (
      <DashboardLayout>
        <PageContainer>
          <LoadingState size="lg" text="Loading tenants..." />
        </PageContainer>
      </DashboardLayout>
    )
  }

  return (
    <DashboardLayout>
      <PageContainer>
        <PageHeader
          title="Tenants"
          description="Create and manage pharmacy tenants (Super Admin)"
        />
        <Section spacing="lg">
          {error && (
            <div className="rounded-md bg-destructive/10 text-destructive px-4 py-2 text-sm mb-4">
              {error}
            </div>
          )}
          <Card>
            <CardHeader className="flex flex-row items-center justify-between space-y-0">
              <div>
                <CardTitle>All tenants</CardTitle>
                <CardDescription>List of all pharmacy tenants in the platform</CardDescription>
              </div>
              <Dialog open={createOpen} onOpenChange={setCreateOpen}>
                <DialogTrigger asChild>
                  <Button>
                    <Plus className="w-4 h-4 mr-2" />
                    Create tenant
                  </Button>
                </DialogTrigger>
                <DialogContent className={DIALOG_CONTENT_DETAIL_CLASS}>
                  <DialogHeader>
                    <DialogTitle>Create tenant</DialogTitle>
                    <DialogDescription>
                      Create a new pharmacy tenant and its first admin user.
                    </DialogDescription>
                  </DialogHeader>
                  <form onSubmit={handleCreateTenant} className="space-y-4">
                    <div className="grid gap-2">
                      <Label htmlFor="pharmacyName">Pharmacy name *</Label>
                      <Input
                        id="pharmacyName"
                        value={form.pharmacyName}
                        onChange={(e) => setForm((f) => ({ ...f, pharmacyName: e.target.value }))}
                        required
                        placeholder="Acme Pharmacy"
                      />
                    </div>
                    <div className="grid gap-2">
                      <Label htmlFor="legalName">Legal name</Label>
                      <Input
                        id="legalName"
                        value={form.legalName}
                        onChange={(e) => setForm((f) => ({ ...f, legalName: e.target.value }))}
                        placeholder="Acme Pharmacy Pvt Ltd"
                      />
                    </div>
                    <div className="grid gap-2">
                      <Label htmlFor="licenseNumber">License number</Label>
                      <Input
                        id="licenseNumber"
                        value={form.licenseNumber}
                        onChange={(e) => setForm((f) => ({ ...f, licenseNumber: e.target.value }))}
                        placeholder="Optional"
                      />
                    </div>
                    <div className="grid grid-cols-2 gap-4">
                      <div className="grid gap-2">
                        <Label htmlFor="country">Country</Label>
                        <Input
                          id="country"
                          value={form.country}
                          onChange={(e) => setForm((f) => ({ ...f, country: e.target.value }))}
                        />
                      </div>
                      <div className="grid gap-2">
                        <Label htmlFor="currency">Currency</Label>
                        <Input
                          id="currency"
                          value={form.currency}
                          onChange={(e) => setForm((f) => ({ ...f, currency: e.target.value }))}
                        />
                      </div>
                    </div>
                    <div className="grid gap-2">
                      <Label htmlFor="timezone">Timezone</Label>
                      <Input
                        id="timezone"
                        value={form.timezone}
                        onChange={(e) => setForm((f) => ({ ...f, timezone: e.target.value }))}
                      />
                    </div>
                    <div className="grid gap-2">
                      <Label htmlFor="adminFullName">Admin full name *</Label>
                      <Input
                        id="adminFullName"
                        value={form.adminFullName}
                        onChange={(e) => setForm((f) => ({ ...f, adminFullName: e.target.value }))}
                        required
                        placeholder="John Doe"
                      />
                    </div>
                    <div className="grid gap-2">
                      <Label htmlFor="adminEmail">Admin email *</Label>
                      <Input
                        id="adminEmail"
                        type="email"
                        value={form.adminEmail}
                        onChange={(e) => setForm((f) => ({ ...f, adminEmail: e.target.value }))}
                        required
                        placeholder="admin@pharmacy.com"
                      />
                    </div>
                    <div className="grid gap-2">
                      <Label htmlFor="adminPassword">Admin password *</Label>
                      <Input
                        id="adminPassword"
                        type="password"
                        value={form.adminPassword}
                        onChange={(e) => setForm((f) => ({ ...f, adminPassword: e.target.value }))}
                        required
                        placeholder="••••••••"
                      />
                    </div>
                    <div className="grid gap-2">
                      <Label htmlFor="planCode">Plan code</Label>
                      <Input
                        id="planCode"
                        value={form.planCode}
                        onChange={(e) => setForm((f) => ({ ...f, planCode: e.target.value }))}
                        placeholder="e.g. standard (optional)"
                      />
                    </div>
                    <DialogFooter>
                      <Button
                        type="button"
                        variant="outline"
                        onClick={() => setCreateOpen(false)}
                        disabled={submitting}
                      >
                        Cancel
                      </Button>
                      <Button type="submit" disabled={submitting}>
                        {submitting ? "Creating..." : "Create tenant"}
                      </Button>
                    </DialogFooter>
                  </form>
                </DialogContent>
              </Dialog>
            </CardHeader>
            <CardContent>
              {tenants.length === 0 ? (
                <div className="flex flex-col items-center justify-center py-12 text-muted-foreground">
                  <Building2 className="w-12 h-12 mb-2" />
                  <p>No tenants yet. Create one to get started.</p>
                </div>
              ) : (
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Name</TableHead>
                      <TableHead>Code</TableHead>
                      <TableHead>Country</TableHead>
                      <TableHead>Currency</TableHead>
                      <TableHead>Status</TableHead>
                      <TableHead>Created</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {tenants.map((t) => (
                      <TableRow key={t.id}>
                        <TableCell className="font-medium">{t.name}</TableCell>
                        <TableCell>{t.code}</TableCell>
                        <TableCell>{t.country ?? "—"}</TableCell>
                        <TableCell>{t.currency ?? "—"}</TableCell>
                        <TableCell>{t.is_active ? "Active" : "Inactive"}</TableCell>
                        <TableCell className="text-muted-foreground">
                          {new Date(t.created_at).toLocaleDateString()}
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              )}
            </CardContent>
          </Card>
        </Section>
      </PageContainer>
    </DashboardLayout>
  )
}
