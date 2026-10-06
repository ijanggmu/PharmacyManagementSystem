"use client"

import { useState, useEffect, useMemo } from "react"
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
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { Label } from "@/components/ui/label"
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table"
import { Pagination } from "@/components/ui/pagination"
import { LoadingState } from "@/components/ui/loading-state"
import { getCSRFToken } from "@/lib/api/client-helpers"
import { useToast } from "@/hooks/use-toast"
import { Building2, Plus, Edit2, Trash2, Eye } from "lucide-react"
import { SUPPORTED_CURRENCIES } from "@/lib/contexts/currency-context"

// Countries this system has a timezone preset for — keep in step with the
// timezone options below so country/timezone/currency stay a sane combination.
const COUNTRIES = [
  "Nepal",
  "India",
  "Bangladesh",
  "United Arab Emirates",
  "United Kingdom",
  "United States",
] as const

interface TenantRow {
  id: string
  name: string
  code: string
  country: string | null
  timezone: string | null
  currency: string | null
  is_active: boolean
  created_at: string | null
}

interface TenantDependencySummary {
  users: number
  sales: number
  medicines: number
  customers: number
  prescriptions: number
  purchaseOrders: number
}

function getErrorMessage(error: unknown, fallback: string): string {
  return error instanceof Error ? error.message : fallback
}

export default function TenantsPage() {
  const router = useRouter()
  const [tenants, setTenants] = useState<TenantRow[]>([])
  const [loading, setLoading] = useState(true)
  const [role, setRole] = useState<string | null>(null)
  const [createOpen, setCreateOpen] = useState(false)
  const [submitting, setSubmitting] = useState(false)
  const [tableError, setTableError] = useState<string | null>(null)
  const [createError, setCreateError] = useState<string | null>(null)
  const [editError, setEditError] = useState<string | null>(null)
  const [deleteError, setDeleteError] = useState<string | null>(null)
  const [search, setSearch] = useState("")
  const [currentPage, setCurrentPage] = useState(1)
  const [itemsPerPage, setItemsPerPage] = useState(10)
  const [editOpen, setEditOpen] = useState(false)
  const [deleteOpen, setDeleteOpen] = useState(false)
  const [editingTenant, setEditingTenant] = useState<TenantRow | null>(null)
  const [deletingTenant, setDeletingTenant] = useState<TenantRow | null>(null)
  const [dependencySummary, setDependencySummary] = useState<TenantDependencySummary | null>(null)
  const [confirmPassword, setConfirmPassword] = useState("")
  const [editForm, setEditForm] = useState<{
    name: string
    country: string
    timezone: string
    currency: string
    is_active: boolean
  }>({
    name: "",
    country: "",
    timezone: "Asia/Kathmandu",
    currency: "NPR",
    is_active: true,
  })
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
  const { toast } = useToast()

  useEffect(() => {
    const checkAndLoad = async () => {
      const sessionRes = await fetch("/api/dashboard/context", { cache: "no-store" })
      if (!sessionRes.ok) {
        router.replace("/?auth=signin")
        return
      }
      const sessionJson = await sessionRes.json()
      const userRole = sessionJson?.data?.user?.rawRole ?? null
      setRole(userRole)
      if (userRole !== "superadmin") {
        router.replace("/dashboard")
        return
      }
      try {
        const res = await fetch("/api/tenants")
        const contentType = res.headers.get("content-type") || ""
        if (!contentType.includes("application/json")) {
          const text = await res.text()
          throw new Error("Unexpected response while loading tenants. Please sign in again.")
        }
        const json = await res.json()
        if (!res.ok) throw new Error(json?.error?.message ?? "Failed to load tenants")
        setTenants(json.data ?? [])
      } catch (e: unknown) {
        setTableError(getErrorMessage(e, "Failed to load tenants"))
      } finally {
        setLoading(false)
      }
    }
    checkAndLoad()
  }, [router])

  const handleCreateTenant = async (e: React.FormEvent) => {
    e.preventDefault()
    setSubmitting(true)
    setCreateError(null)
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
      const contentType = res.headers.get("content-type") || ""
      if (!contentType.includes("application/json")) {
        const text = await res.text()
        throw new Error("Unexpected response while creating tenant. Please sign in again.")
      }
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
      const listContentType = listRes.headers.get("content-type") || ""
      if (!listContentType.includes("application/json")) {
        // If we can't parse the refreshed list, just leave the existing table as-is.
        return
      }
      const listJson = await listRes.json()
      if (listRes.ok && Array.isArray(listJson.data)) setTenants(listJson.data)
      if (json?.data?.settingsSeedWarning) {
        toast({
          title: "Tenant created with warning",
          description: json.data.settingsSeedWarning,
          variant: "destructive",
        })
      } else {
        toast({
          title: "Tenant created",
          description: "Tenant and admin user were created successfully.",
        })
      }
    } catch (e: unknown) {
      setCreateError(getErrorMessage(e, "Failed to create tenant"))
    } finally {
      setSubmitting(false)
    }
  }

  const filteredTenants = useMemo(() => {
    const term = search.trim().toLowerCase()
    if (!term) return tenants
    return tenants.filter((t) => {
      const fields = [
        t.name,
        t.code,
        t.country ?? "",
        t.currency ?? "",
        t.timezone ?? "",
      ]
      return fields.some((field) => field.toLowerCase().includes(term))
    })
  }, [search, tenants])

  const totalItems = filteredTenants.length
  const totalPages = Math.max(1, Math.ceil(totalItems / itemsPerPage))
  const startIndex = (currentPage - 1) * itemsPerPage
  const paginatedTenants = filteredTenants.slice(startIndex, startIndex + itemsPerPage)

  const openEditTenant = (tenant: TenantRow) => {
    setEditingTenant(tenant)
    setEditForm({
      name: tenant.name,
      country: tenant.country ?? "",
      timezone: tenant.timezone ?? "Asia/Kathmandu",
      currency: tenant.currency ?? "NPR",
      is_active: tenant.is_active,
    })
    setEditOpen(true)
  }

  const refreshTenants = async () => {
    const res = await fetch("/api/tenants")
    const contentType = res.headers.get("content-type") || ""
    if (!contentType.includes("application/json")) return
    const json = await res.json()
    if (res.ok && Array.isArray(json.data)) {
      setTenants(json.data)
    }
  }

  const handleUpdateTenant = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!editingTenant) return
    setSubmitting(true)
    setEditError(null)
    try {
      const token = await getCSRFToken()
      const res = await fetch(`/api/tenants/${editingTenant.id}`, {
        method: "PATCH",
        headers: {
          "Content-Type": "application/json",
          "X-CSRF-Token": token,
        },
        body: JSON.stringify({
          name: editForm.name,
          country: editForm.country,
          timezone: editForm.timezone,
          currency: editForm.currency,
          is_active: editForm.is_active,
        }),
      })
      const contentType = res.headers.get("content-type") || ""
      if (!contentType.includes("application/json")) {
        await res.text()
        throw new Error("Unexpected response while updating tenant. Please sign in again.")
      }
      const json = await res.json()
      if (!res.ok) throw new Error(json?.error?.message ?? "Failed to update tenant")

      await refreshTenants()
      setEditOpen(false)
      setEditingTenant(null)
    } catch (e: unknown) {
      setEditError(getErrorMessage(e, "Failed to update tenant"))
    } finally {
      setSubmitting(false)
    }
  }

  const handleDeleteTenant = async () => {
    if (!deletingTenant) return
    setSubmitting(true)
    setDeleteError(null)
    try {
      const token = await getCSRFToken()
      const res = await fetch(`/api/tenants/${deletingTenant.id}`, {
        method: "DELETE",
        headers: {
          "Content-Type": "application/json",
          "X-CSRF-Token": token,
        },
        body: JSON.stringify(confirmPassword ? { confirmPassword } : {}),
      })
      const contentType = res.headers.get("content-type") || ""
      if (!contentType.includes("application/json")) {
        await res.text()
        throw new Error("Unexpected response while deleting tenant. Please sign in again.")
      }
      const json = await res.json()

      if (!res.ok) {
        if (json?.error?.code === "CONFIRMATION_REQUIRED") {
          setDependencySummary(json.error.details?.summary ?? null)
          return
        }
        throw new Error(json?.error?.message ?? "Failed to delete tenant")
      }

      await refreshTenants()
      setDeleteOpen(false)
      setDeletingTenant(null)
      setDependencySummary(null)
      setConfirmPassword("")
    } catch (e: unknown) {
      setDeleteError(getErrorMessage(e, "Failed to delete tenant"))
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
          {tableError && (
            <div className="rounded-md bg-destructive/10 text-destructive px-4 py-2 text-sm mb-4">
              {tableError}
            </div>
          )}
          <Card>
            <CardHeader className="flex flex-col gap-4 space-y-0 sm:flex-row sm:items-center sm:justify-between">
              <div>
                <CardTitle>All tenants</CardTitle>
                <CardDescription>List of all pharmacy tenants in the platform</CardDescription>
              </div>
              <div className="flex w-full flex-col gap-2 sm:w-auto sm:flex-row sm:items-center">
                <Input
                  placeholder="Search by name, code, country, currency, or timezone"
                  value={search}
                  onChange={(e) => {
                    setSearch(e.target.value)
                    setCurrentPage(1)
                  }}
                  className="w-full sm:w-80"
                />
                <Dialog
                  open={createOpen}
                  onOpenChange={(open) => {
                    setCreateOpen(open)
                    if (!open) setCreateError(null)
                  }}
                >
                  <DialogTrigger asChild>
                    <Button className="whitespace-nowrap">
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
                    {createError && (
                      <div className="rounded-md bg-destructive/10 text-destructive px-3 py-2 text-sm">{createError}</div>
                    )}
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
                        <Select
                          value={form.country}
                          onValueChange={(value) => setForm((f) => ({ ...f, country: value }))}
                        >
                          <SelectTrigger id="country" className="w-full">
                            <SelectValue placeholder="Select country" />
                          </SelectTrigger>
                          <SelectContent>
                            {COUNTRIES.map((country) => (
                              <SelectItem key={country} value={country}>
                                {country}
                              </SelectItem>
                            ))}
                          </SelectContent>
                        </Select>
                      </div>
                      <div className="grid gap-2">
                        <Label htmlFor="currency">Currency</Label>
                        <Select
                          value={form.currency}
                          onValueChange={(value) => setForm((f) => ({ ...f, currency: value }))}
                        >
                          <SelectTrigger id="currency" className="w-full">
                            <SelectValue placeholder="Select currency" />
                          </SelectTrigger>
                          <SelectContent>
                            {SUPPORTED_CURRENCIES.map((currency) => (
                              <SelectItem key={currency.code} value={currency.code}>
                                {currency.code} ({currency.symbol}) - {currency.name}
                              </SelectItem>
                            ))}
                          </SelectContent>
                        </Select>
                      </div>
                    </div>
                    <div className="grid gap-2">
                      <Label htmlFor="timezone">Timezone</Label>
                      <Select
                        value={form.timezone}
                        onValueChange={(value) => setForm((f) => ({ ...f, timezone: value }))}
                      >
                        <SelectTrigger className="w-full">
                          <SelectValue placeholder="Select timezone" />
                        </SelectTrigger>
                        <SelectContent>
                          <SelectItem value="Asia/Kathmandu">Asia/Kathmandu (GMT+5:45)</SelectItem>
                          <SelectItem value="Asia/Kolkata">Asia/Kolkata (GMT+5:30)</SelectItem>
                          <SelectItem value="Asia/Dhaka">Asia/Dhaka (GMT+6:00)</SelectItem>
                          <SelectItem value="Asia/Dubai">Asia/Dubai (GMT+4:00)</SelectItem>
                          <SelectItem value="Europe/London">Europe/London (GMT±0:00)</SelectItem>
                          <SelectItem value="America/New_York">America/New_York (GMT-5:00)</SelectItem>
                          <SelectItem value="America/Los_Angeles">America/Los_Angeles (GMT-8:00)</SelectItem>
                        </SelectContent>
                      </Select>
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
              </div>
            </CardHeader>
            <CardContent>
              {tenants.length === 0 ? (
                <div className="flex flex-col items-center justify-center py-12 text-muted-foreground">
                  <Building2 className="w-12 h-12 mb-2" />
                  <p>No tenants yet. Create one to get started.</p>
                </div>
              ) : (
                <>
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead className="w-12 text-center">SN</TableHead>
                        <TableHead>Name</TableHead>
                        <TableHead>Code</TableHead>
                        <TableHead>Country</TableHead>
                        <TableHead>Currency</TableHead>
                        <TableHead>Status</TableHead>
                        <TableHead>Created</TableHead>
                        <TableHead className="w-[120px] text-right">Actions</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {paginatedTenants.map((t, index) => (
                        <TableRow key={t.id}>
                          <TableCell className="w-12 text-center">
                            {startIndex + index + 1}
                          </TableCell>
                          <TableCell className="font-medium">{t.name}</TableCell>
                          <TableCell>{t.code}</TableCell>
                          <TableCell>{t.country ?? "—"}</TableCell>
                          <TableCell>{t.currency ?? "—"}</TableCell>
                          <TableCell>{t.is_active ? "Active" : "Inactive"}</TableCell>
                          <TableCell className="text-muted-foreground">
                            {t.created_at ? new Date(t.created_at).toLocaleDateString() : "—"}
                          </TableCell>
                          <TableCell className="text-right space-x-2">
                            <Button
                              variant="outline"
                              size="icon"
                              className="h-8 w-8"
                              title="View tenant overview"
                              aria-label="View tenant overview"
                              onClick={() => router.push(`/dashboard/tenants/${t.id}/overview`)}
                            >
                              <Eye className="h-4 w-4" />
                            </Button>
                            <Button
                              variant="outline"
                              size="icon"
                              className="h-8 w-8"
                              onClick={() => openEditTenant(t)}
                            >
                              <Edit2 className="h-4 w-4" />
                            </Button>
                            <Button
                              variant="outline"
                              size="icon"
                              className="h-8 w-8 text-destructive border-destructive/40"
                              onClick={() => {
                                setDeletingTenant(t)
                                setDeleteOpen(true)
                              }}
                            >
                              <Trash2 className="h-4 w-4" />
                            </Button>
                          </TableCell>
                        </TableRow>
                      ))}
                    </TableBody>
                  </Table>
                  <Pagination
                    currentPage={currentPage}
                    totalPages={totalPages}
                    totalItems={totalItems}
                    itemsPerPage={itemsPerPage}
                    startIndex={startIndex}
                    onPageChange={setCurrentPage}
                    className="mt-4"
                  />
                </>
              )}
            </CardContent>
          </Card>
        </Section>

        {/* Edit tenant dialog */}
        <Dialog
          open={editOpen}
          onOpenChange={(open) => {
            setEditOpen(open)
            if (!open) {
              setEditError(null)
              setEditingTenant(null)
            }
          }}
        >
          <DialogContent className={DIALOG_CONTENT_DETAIL_CLASS}>
            <DialogHeader>
              <DialogTitle>Edit tenant</DialogTitle>
              <DialogDescription>Update basic information for this tenant.</DialogDescription>
            </DialogHeader>
            {editError && (
              <div className="rounded-md bg-destructive/10 text-destructive px-3 py-2 text-sm">{editError}</div>
            )}
            <form onSubmit={handleUpdateTenant} className="space-y-4">
              <div className="grid gap-2">
                <Label htmlFor="editName">Name</Label>
                <Input
                  id="editName"
                  value={editForm.name}
                  onChange={(e) => setEditForm((f) => ({ ...f, name: e.target.value }))}
                  required
                />
              </div>
              <div className="grid grid-cols-2 gap-4">
                <div className="grid gap-2">
                  <Label htmlFor="editCountry">Country</Label>
                  <Select
                    value={editForm.country}
                    onValueChange={(value) => setEditForm((f) => ({ ...f, country: value }))}
                  >
                    <SelectTrigger id="editCountry" className="w-full">
                      <SelectValue placeholder="Select country" />
                    </SelectTrigger>
                    <SelectContent>
                      {COUNTRIES.map((country) => (
                        <SelectItem key={country} value={country}>
                          {country}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
                <div className="grid gap-2">
                  <Label htmlFor="editCurrency">Currency</Label>
                  <Select
                    value={editForm.currency}
                    onValueChange={(value) => setEditForm((f) => ({ ...f, currency: value }))}
                  >
                    <SelectTrigger id="editCurrency" className="w-full">
                      <SelectValue placeholder="Select currency" />
                    </SelectTrigger>
                    <SelectContent>
                      {SUPPORTED_CURRENCIES.map((currency) => (
                        <SelectItem key={currency.code} value={currency.code}>
                          {currency.code} ({currency.symbol}) - {currency.name}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
              </div>
              <div className="grid gap-2">
                <Label htmlFor="editTimezone">Timezone</Label>
                <Select
                  value={editForm.timezone}
                  onValueChange={(value) => setEditForm((f) => ({ ...f, timezone: value }))}
                >
                  <SelectTrigger id="editTimezone" className="w-full">
                    <SelectValue placeholder="Select timezone" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="Asia/Kathmandu">Asia/Kathmandu (GMT+5:45)</SelectItem>
                    <SelectItem value="Asia/Kolkata">Asia/Kolkata (GMT+5:30)</SelectItem>
                    <SelectItem value="Asia/Dhaka">Asia/Dhaka (GMT+6:00)</SelectItem>
                    <SelectItem value="Asia/Dubai">Asia/Dubai (GMT+4:00)</SelectItem>
                    <SelectItem value="Europe/London">Europe/London (GMT±0:00)</SelectItem>
                    <SelectItem value="America/New_York">America/New_York (GMT-5:00)</SelectItem>
                    <SelectItem value="America/Los_Angeles">America/Los_Angeles (GMT-8:00)</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div className="grid gap-2">
                <Label htmlFor="editStatus">Status</Label>
                <Select
                  value={editForm.is_active ? "active" : "inactive"}
                  onValueChange={(value) => setEditForm((f) => ({ ...f, is_active: value === "active" }))}
                >
                  <SelectTrigger id="editStatus" className="w-full">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="active">Active</SelectItem>
                    <SelectItem value="inactive">Inactive</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <DialogFooter>
                <Button
                  type="button"
                  variant="outline"
                  onClick={() => {
                    setEditOpen(false)
                    setEditingTenant(null)
                  }}
                  disabled={submitting}
                >
                  Cancel
                </Button>
                <Button type="submit" disabled={submitting}>
                  {submitting ? "Saving..." : "Save changes"}
                </Button>
              </DialogFooter>
            </form>
          </DialogContent>
        </Dialog>

        {/* Delete tenant confirmation */}
        <Dialog
          open={deleteOpen}
          onOpenChange={(open) => {
            setDeleteOpen(open)
            if (!open) {
              setDeleteError(null)
              setDeletingTenant(null)
              setDependencySummary(null)
              setConfirmPassword("")
            }
          }}
        >
          <DialogContent className={DIALOG_CONTENT_DETAIL_CLASS}>
            {dependencySummary ? (
              <>
                <DialogHeader>
                  <DialogTitle className="text-destructive">This tenant has existing data</DialogTitle>
                  <DialogDescription>
                    Deleting <span className="font-semibold">{deletingTenant?.name}</span> will permanently
                    erase everything below. This cannot be undone.
                  </DialogDescription>
                </DialogHeader>
                <ul className="text-sm text-muted-foreground space-y-1 rounded-md border px-3 py-2">
                  <li>{dependencySummary.users} users</li>
                  <li>{dependencySummary.sales} sales</li>
                  <li>{dependencySummary.medicines} medicines</li>
                  <li>{dependencySummary.customers} customers</li>
                  <li>{dependencySummary.prescriptions} prescriptions</li>
                  <li>{dependencySummary.purchaseOrders} purchase orders</li>
                </ul>
                <div className="grid gap-2">
                  <Label htmlFor="confirmPassword">Confirm your password to proceed</Label>
                  <Input
                    id="confirmPassword"
                    type="password"
                    value={confirmPassword}
                    onChange={(e) => setConfirmPassword(e.target.value)}
                    placeholder="••••••••"
                    autoFocus
                  />
                </div>
                {deleteError && (
                  <div className="rounded-md bg-destructive/10 text-destructive px-3 py-2 text-sm">{deleteError}</div>
                )}
                <DialogFooter>
                  <Button
                    type="button"
                    variant="outline"
                    onClick={() => {
                      setDeleteOpen(false)
                      setDeletingTenant(null)
                      setDependencySummary(null)
                      setConfirmPassword("")
                    }}
                    disabled={submitting}
                  >
                    Cancel
                  </Button>
                  <Button
                    type="button"
                    variant="destructive"
                    onClick={handleDeleteTenant}
                    disabled={submitting || !confirmPassword}
                  >
                    {submitting ? "Deleting..." : "Permanently delete everything"}
                  </Button>
                </DialogFooter>
              </>
            ) : (
              <>
                <DialogHeader>
                  <DialogTitle>Delete tenant</DialogTitle>
                  <DialogDescription>
                    This will permanently delete the tenant{" "}
                    <span className="font-semibold">{deletingTenant?.name}</span>. This action cannot be undone.
                  </DialogDescription>
                </DialogHeader>
                {deleteError && (
                  <div className="rounded-md bg-destructive/10 text-destructive px-3 py-2 text-sm">{deleteError}</div>
                )}
                <DialogFooter>
                  <Button
                    type="button"
                    variant="outline"
                    onClick={() => {
                      setDeleteOpen(false)
                      setDeletingTenant(null)
                    }}
                    disabled={submitting}
                  >
                    Cancel
                  </Button>
                  <Button
                    type="button"
                    variant="destructive"
                    onClick={handleDeleteTenant}
                    disabled={submitting}
                  >
                    {submitting ? "Deleting..." : "Delete tenant"}
                  </Button>
                </DialogFooter>
              </>
            )}
          </DialogContent>
        </Dialog>
      </PageContainer>
    </DashboardLayout>
  )
}

