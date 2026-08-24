"use client"

import { useEffect, useMemo, useState } from "react"
import { useParams, useRouter } from "next/navigation"
import DashboardLayout from "@/components/dashboard-layout"
import { PageContainer, PageHeader, Section } from "@/components/layouts"
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { LoadingState } from "@/components/ui/loading-state"
import { useToast } from "@/hooks/use-toast"
import { ConfirmDialog } from "@/components/ui/confirm-dialog"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select"
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DIALOG_CONTENT_DETAIL_CLASS,
} from "@/components/ui/dialog"
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table"
import { getCSRFToken } from "@/lib/api/client-helpers"
import { Eye, KeyRound, Pencil, Search, Trash2, Plus } from "lucide-react"

interface TenantOverviewResponse {
  tenant: {
    id: string
    name: string
    code: string
    country: string | null
    timezone: string | null
    currency: string | null
  }
  stats: {
    users: number
    medicines: number
    customers: number
    sales: number
    branches: number
  }
  users: Array<{
    id: string
    email: string
    full_name: string
    role: string
    phone: string | null
    created_at: string
  }>
}

type TenantUserRole = "admin" | "pharmacist" | "cashier" | "manager" | "staff"

function toTenantUserRole(value: string): TenantUserRole {
  return (["admin", "pharmacist", "cashier", "manager", "staff"] as const).includes(value as TenantUserRole)
    ? (value as TenantUserRole)
    : "staff"
}

function getErrorMessage(error: unknown, fallback: string): string {
  return error instanceof Error ? error.message : fallback
}

export default function TenantOverviewPage() {
  const params = useParams<{ tenantId: string }>()
  const router = useRouter()
  const { toast } = useToast()
  const [data, setData] = useState<TenantOverviewResponse | null>(null)
  const [isLoading, setIsLoading] = useState(true)
  const [userSearch, setUserSearch] = useState("")
  const [roleFilter, setRoleFilter] = useState<"all" | TenantUserRole>("all")
  const [resettingUserId, setResettingUserId] = useState<string | null>(null)
  const [resetTargetUserId, setResetTargetUserId] = useState<string | null>(null)
  const [isUserSaving, setIsUserSaving] = useState(false)

  const [createOpen, setCreateOpen] = useState(false)
  const [editOpen, setEditOpen] = useState(false)
  const [deleteOpen, setDeleteOpen] = useState(false)

  const [createForm, setCreateForm] = useState({
    email: "",
    fullName: "",
    phone: "",
    role: "pharmacist" as "admin" | "pharmacist" | "cashier" | "manager" | "staff",
    password: "",
  })

  const [editForm, setEditForm] = useState({
    userId: "",
    fullName: "",
    phone: "",
    role: "pharmacist" as "admin" | "pharmacist" | "cashier" | "manager" | "staff",
  })

  const [deleteTarget, setDeleteTarget] = useState<{
    userId: string
    fullName: string
    role: string
  } | null>(null)

  const reload = async () => {
    try {
      const res = await fetch(`/api/superadmin/tenant-overview/${params.tenantId}`)
      if (!res.ok) {
        const body = await res.json().catch(() => null)
        throw new Error(body?.error?.message || "Failed to load tenant overview")
      }
      const json = await res.json()
      setData(json.data)
    } catch (error: unknown) {
      toast({
        title: "Error",
        description: getErrorMessage(error, "Failed to load tenant overview."),
        variant: "destructive",
      })
    }
  }

  const usersForTable = useMemo(() => {
    if (!data) return []
    const term = userSearch.trim().toLowerCase()

    return (data.users ?? [])
      .filter((u) => {
        if (roleFilter !== "all" && u.role !== roleFilter) return false
        return true
      })
      .filter((u) => {
        if (!term) return true
        const haystack = [u.full_name, u.email, u.role].filter(Boolean).join(" ").toLowerCase()
        return haystack.includes(term)
      })
  }, [data, roleFilter, userSearch])

  const handleSendReset = async (userId: string) => {
    if (!params.tenantId) return
    const target = (data?.users ?? []).find((u) => u.id === userId)
    if (!target) return

    if (target.role !== "admin") {
      toast({
        title: "Not allowed",
        description: "Only tenant admin users can receive a forced reset email.",
        variant: "destructive",
      })
      return
    }

    setResetTargetUserId(userId)
  }

  const handleConfirmSendReset = async () => {
    if (!params.tenantId || !resetTargetUserId) return
    const userId = resetTargetUserId
    setResetTargetUserId(null)

    setResettingUserId(userId)
    try {
      const csrfToken = await getCSRFToken()
      const redirectTo = `${window.location.origin}/auth/login`

      const res = await fetch(
        `/api/superadmin/tenants/${params.tenantId}/users/${userId}/send-password-reset`,
        {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            "X-CSRF-Token": csrfToken,
          },
          body: JSON.stringify({ redirectTo }),
        }
      )

      const json = await res.json().catch(() => null)
      if (!res.ok) {
        throw new Error(json?.error?.message || "Failed to send reset email")
      }

      toast({
        title: "Reset email sent",
        description: "Tenant admin will receive a password reset link shortly.",
      })
    } catch (e: unknown) {
      toast({
        title: "Failed to send reset email",
        description: getErrorMessage(e, "Please try again."),
        variant: "destructive",
      })
    } finally {
      setResettingUserId(null)
    }
  }

  useEffect(() => {
    const load = async () => {
      setIsLoading(true)
      await reload()
      setIsLoading(false)
    }
    load()
  }, [params.tenantId, toast])

  return (
    <DashboardLayout>
      <PageContainer>
        <PageHeader
          title="Tenant Overview"
          description="Tenant overview and user management for superadmin."
        />

        <Section spacing="lg">
          <Button variant="outline" size="sm" onClick={() => router.push("/dashboard/tenants")}>
            Back to Tenants
          </Button>

          {isLoading ? (
            <LoadingState size="lg" text="Loading tenant overview..." />
          ) : !data ? (
            <div className="py-6 text-sm text-muted-foreground">
              No data available for this tenant.
            </div>
          ) : (
            <div className="space-y-8">
              <div className="grid gap-6 md:grid-cols-2 lg:grid-cols-3">
                <Card className="md:col-span-2">
                  <CardHeader>
                    <CardTitle>{data.tenant.name}</CardTitle>
                    <CardDescription>
                      Code: {data.tenant.code} • Country: {data.tenant.country || "N/A"} • Currency:{" "}
                      {data.tenant.currency || "N/A"}
                    </CardDescription>
                  </CardHeader>
                  <CardContent>
                    <p className="text-sm text-muted-foreground">Timezone: {data.tenant.timezone || "N/A"}</p>
                  </CardContent>
                </Card>

                <Card>
                  <CardHeader>
                    <CardTitle>Users</CardTitle>
                  </CardHeader>
                  <CardContent>
                    <div className="text-3xl font-semibold">{data.stats.users}</div>
                    <p className="text-xs text-muted-foreground">Total users in this tenant</p>
                  </CardContent>
                </Card>

                <Card>
                  <CardHeader>
                    <CardTitle>Medicines</CardTitle>
                  </CardHeader>
                  <CardContent>
                    <div className="text-3xl font-semibold">{data.stats.medicines}</div>
                    <p className="text-xs text-muted-foreground">Tracked medicines</p>
                  </CardContent>
                </Card>

                <Card>
                  <CardHeader>
                    <CardTitle>Customers</CardTitle>
                  </CardHeader>
                  <CardContent>
                    <div className="text-3xl font-semibold">{data.stats.customers}</div>
                    <p className="text-xs text-muted-foreground">Registered customers</p>
                  </CardContent>
                </Card>

                <Card>
                  <CardHeader>
                    <CardTitle>Sales</CardTitle>
                  </CardHeader>
                  <CardContent>
                    <div className="text-3xl font-semibold">{data.stats.sales}</div>
                    <p className="text-xs text-muted-foreground">Sales records</p>
                  </CardContent>
                </Card>

                <Card>
                  <CardHeader>
                    <CardTitle>Branches</CardTitle>
                  </CardHeader>
                  <CardContent>
                    <div className="text-3xl font-semibold">{data.stats.branches}</div>
                    <p className="text-xs text-muted-foreground">Active branches</p>
                  </CardContent>
                </Card>
              </div>

              <Card>
                <CardHeader>
                  <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
                    <div>
                      <CardTitle>Tenant users</CardTitle>
                      <CardDescription>Latest users (max 50) for this tenant.</CardDescription>
                    </div>
                    <div className="flex flex-col gap-2 sm:flex-row sm:items-center">
                      <div className="relative w-full sm:w-64">
                        <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
                        <Input
                          value={userSearch}
                          onChange={(e) => setUserSearch(e.target.value)}
                          placeholder="Search name/email"
                          className="h-10 bg-muted/30 pl-9"
                        />
                      </div>
                      <Select
                        value={roleFilter}
                        onValueChange={(v) => setRoleFilter(v === "all" ? "all" : toTenantUserRole(v))}
                      >
                        <SelectTrigger className="h-10 w-full sm:w-44">
                          <SelectValue placeholder="Filter role" />
                        </SelectTrigger>
                        <SelectContent>
                          <SelectItem value="all">All roles</SelectItem>
                          <SelectItem value="admin">Admin</SelectItem>
                          <SelectItem value="pharmacist">Pharmacist</SelectItem>
                          <SelectItem value="cashier">Cashier</SelectItem>
                          <SelectItem value="manager">Manager</SelectItem>
                          <SelectItem value="staff">Staff</SelectItem>
                        </SelectContent>
                      </Select>

                      <Button
                        type="button"
                        className="h-10"
                        onClick={() => {
                          setCreateOpen(true)
                          setCreateForm({
                            email: "",
                            fullName: "",
                            phone: "",
                            role: "pharmacist",
                            password: "",
                          })
                        }}
                      >
                        <Plus className="mr-2 h-4 w-4" />
                        Add user
                      </Button>
                    </div>
                  </div>
                </CardHeader>

                <CardContent>
                  {usersForTable.length === 0 ? (
                    <div className="py-10 text-center text-sm text-muted-foreground">
                      No users match your filters.
                    </div>
                  ) : (
                    <Table>
                      <TableHeader>
                        <TableRow>
                          <TableHead>Name</TableHead>
                          <TableHead>Email</TableHead>
                          <TableHead>Role</TableHead>
                          <TableHead className="hidden sm:table-cell">Phone</TableHead>
                          <TableHead className="hidden md:table-cell">Joined</TableHead>
                          <TableHead className="w-[180px] text-right">Actions</TableHead>
                        </TableRow>
                      </TableHeader>
                      <TableBody>
                        {usersForTable.map((u) => (
                          <TableRow key={u.id}>
                            <TableCell className="font-medium">{u.full_name}</TableCell>
                            <TableCell>{u.email}</TableCell>
                            <TableCell>
                              <span className="inline-flex items-center rounded-md bg-muted/30 px-2 py-1 text-xs font-medium text-foreground">
                                {u.role}
                              </span>
                            </TableCell>
                            <TableCell className="hidden sm:table-cell">{u.phone ?? "—"}</TableCell>
                            <TableCell className="hidden md:table-cell">
                              {u.created_at ? new Date(u.created_at).toLocaleDateString() : "—"}
                            </TableCell>
                            <TableCell className="text-right">
                              <div className="inline-flex items-center gap-2">
                                {u.role === "admin" ? (
                                  <Button
                                    variant="outline"
                                    size="sm"
                                    className="gap-2"
                                    disabled={resettingUserId === u.id}
                                    onClick={() => handleSendReset(u.id)}
                                  >
                                    <KeyRound className="h-4 w-4" />
                                    {resettingUserId === u.id ? "Sending..." : "Reset"}
                                  </Button>
                                ) : null}

                                <Button
                                  variant="outline"
                                  size="sm"
                                  disabled={isUserSaving}
                                  onClick={() => {
                                    setEditForm({
                                      userId: u.id,
                                      fullName: u.full_name,
                                      phone: u.phone ?? "",
                                      role: toTenantUserRole(u.role),
                                    })
                                    setEditOpen(true)
                                  }}
                                >
                                  <Pencil className="h-4 w-4" />
                                </Button>

                                <Button
                                  variant="outline"
                                  size="sm"
                                  disabled={isUserSaving}
                                  className="text-destructive border-destructive/40"
                                  onClick={() => {
                                    setDeleteTarget({
                                      userId: u.id,
                                      fullName: u.full_name,
                                      role: u.role,
                                    })
                                    setDeleteOpen(true)
                                  }}
                                >
                                  <Trash2 className="h-4 w-4" />
                                </Button>
                              </div>
                            </TableCell>
                          </TableRow>
                        ))}
                      </TableBody>
                    </Table>
                  )}
                </CardContent>
              </Card>
            </div>
          )}
        </Section>
      </PageContainer>

      {/* Create user */}
      <Dialog open={createOpen} onOpenChange={setCreateOpen}>
        <DialogContent className={DIALOG_CONTENT_DETAIL_CLASS}>
          <DialogHeader>
            <DialogTitle>Create tenant user</DialogTitle>
            <DialogDescription>Add a user to this tenant (superadmin only).</DialogDescription>
          </DialogHeader>

          <form
            className="space-y-4"
            onSubmit={async (e) => {
              e.preventDefault()
              if (!params.tenantId) return

              setIsUserSaving(true)
              try {
                const csrfToken = await getCSRFToken()

                const res = await fetch(`/api/superadmin/tenants/${params.tenantId}/users`, {
                  method: "POST",
                  headers: {
                    "Content-Type": "application/json",
                    "X-CSRF-Token": csrfToken,
                  },
                  body: JSON.stringify({
                    email: createForm.email,
                    fullName: createForm.fullName,
                    phone: createForm.phone || null,
                    role: createForm.role,
                    password: createForm.password,
                  }),
                })

                const json = await res.json().catch(() => null)
                if (!res.ok) {
                  throw new Error(json?.error?.message || "Failed to create user")
                }

                toast({
                  title: "User created",
                  description: "Tenant user was added successfully.",
                })
                setCreateOpen(false)
                await reload()
              } catch (err: unknown) {
                toast({
                  title: "Failed to create user",
                  description: getErrorMessage(err, "Please try again."),
                  variant: "destructive",
                })
              } finally {
                setIsUserSaving(false)
              }
            }}
          >
            <div className="grid gap-4 md:grid-cols-2">
              <div className="space-y-2">
                <Label htmlFor="createEmail">Email</Label>
                <Input
                  id="createEmail"
                  type="email"
                  required
                  value={createForm.email}
                  onChange={(e) => setCreateForm((f) => ({ ...f, email: e.target.value }))}
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="createRole">Role</Label>
                <Select
                  value={createForm.role}
                  onValueChange={(v) => setCreateForm((f) => ({ ...f, role: toTenantUserRole(v) }))}
                >
                  <SelectTrigger id="createRole">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="admin">Admin</SelectItem>
                    <SelectItem value="pharmacist">Pharmacist</SelectItem>
                    <SelectItem value="cashier">Cashier</SelectItem>
                    <SelectItem value="manager">Manager</SelectItem>
                    <SelectItem value="staff">Staff</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            </div>

            <div className="grid gap-4 md:grid-cols-2">
              <div className="space-y-2">
                <Label htmlFor="createFullName">Full name</Label>
                <Input
                  id="createFullName"
                  required
                  value={createForm.fullName}
                  onChange={(e) => setCreateForm((f) => ({ ...f, fullName: e.target.value }))}
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="createPhone">Phone</Label>
                <Input
                  id="createPhone"
                  value={createForm.phone}
                  onChange={(e) => setCreateForm((f) => ({ ...f, phone: e.target.value }))}
                />
              </div>
            </div>

            <div className="space-y-2">
              <Label htmlFor="createPassword">Temporary password</Label>
              <Input
                id="createPassword"
                type="password"
                required
                value={createForm.password}
                onChange={(e) => setCreateForm((f) => ({ ...f, password: e.target.value }))}
                placeholder="Enter an initial password"
              />
            </div>

            <DialogFooter>
              <Button type="button" variant="outline" disabled={isUserSaving} onClick={() => setCreateOpen(false)}>
                Cancel
              </Button>
              <Button type="submit" disabled={isUserSaving}>
                {isUserSaving ? "Creating..." : "Create user"}
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>

      {/* Edit user */}
      <Dialog open={editOpen} onOpenChange={setEditOpen}>
        <DialogContent className={DIALOG_CONTENT_DETAIL_CLASS}>
          <DialogHeader>
            <DialogTitle>Edit tenant user</DialogTitle>
            <DialogDescription>Update role and contact details for this tenant.</DialogDescription>
          </DialogHeader>

          <form
            className="space-y-4"
            onSubmit={async (e) => {
              e.preventDefault()
              if (!params.tenantId) return

              setIsUserSaving(true)
              try {
                const csrfToken = await getCSRFToken()

                const res = await fetch(`/api/superadmin/tenants/${params.tenantId}/users/${editForm.userId}`, {
                  method: "PATCH",
                  headers: {
                    "Content-Type": "application/json",
                    "X-CSRF-Token": csrfToken,
                  },
                  body: JSON.stringify({
                    fullName: editForm.fullName,
                    phone: editForm.phone || null,
                    role: editForm.role,
                  }),
                })

                const json = await res.json().catch(() => null)
                if (!res.ok) {
                  throw new Error(json?.error?.message || "Failed to update user")
                }

                toast({
                  title: "User updated",
                  description: "Tenant user changes were saved.",
                })
                setEditOpen(false)
                await reload()
              } catch (err: unknown) {
                toast({
                  title: "Failed to update user",
                  description: getErrorMessage(err, "Please try again."),
                  variant: "destructive",
                })
              } finally {
                setIsUserSaving(false)
              }
            }}
          >
            <div className="grid gap-4 md:grid-cols-2">
              <div className="space-y-2">
                <Label htmlFor="editFullName">Full name</Label>
                <Input
                  id="editFullName"
                  required
                  value={editForm.fullName}
                  onChange={(e) => setEditForm((f) => ({ ...f, fullName: e.target.value }))}
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="editPhone">Phone</Label>
                <Input
                  id="editPhone"
                  value={editForm.phone}
                  onChange={(e) => setEditForm((f) => ({ ...f, phone: e.target.value }))}
                />
              </div>
            </div>

            <div className="space-y-2">
              <Label htmlFor="editRole">Role</Label>
              <Select value={editForm.role} onValueChange={(v) => setEditForm((f) => ({ ...f, role: toTenantUserRole(v) }))}>
                <SelectTrigger id="editRole">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="admin">Admin</SelectItem>
                  <SelectItem value="pharmacist">Pharmacist</SelectItem>
                  <SelectItem value="cashier">Cashier</SelectItem>
                  <SelectItem value="manager">Manager</SelectItem>
                  <SelectItem value="staff">Staff</SelectItem>
                </SelectContent>
              </Select>
            </div>

            <DialogFooter>
              <Button type="button" variant="outline" disabled={isUserSaving} onClick={() => setEditOpen(false)}>
                Cancel
              </Button>
              <Button type="submit" disabled={isUserSaving}>
                {isUserSaving ? "Saving..." : "Save changes"}
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>

      {/* Delete user */}
      <Dialog open={deleteOpen} onOpenChange={setDeleteOpen}>
        <DialogContent className="sm:max-w-xl">
          <DialogHeader>
            <DialogTitle>Delete tenant user</DialogTitle>
            <DialogDescription>
              {deleteTarget
                ? `Delete ${deleteTarget.fullName} (${deleteTarget.role}) from this tenant. This cannot be undone.`
                : "Delete this user from this tenant."}
            </DialogDescription>
          </DialogHeader>

          <DialogFooter>
            <Button type="button" variant="outline" disabled={isUserSaving} onClick={() => setDeleteOpen(false)}>
              Cancel
            </Button>
            <Button
              type="button"
              variant="destructive"
              disabled={!deleteTarget || isUserSaving}
              onClick={async () => {
                if (!deleteTarget || !params.tenantId) return
                setIsUserSaving(true)
                try {
                  const csrfToken = await getCSRFToken()
                  const res = await fetch(
                    `/api/superadmin/tenants/${params.tenantId}/users/${deleteTarget.userId}`,
                    {
                      method: "DELETE",
                      headers: {
                        "Content-Type": "application/json",
                        "X-CSRF-Token": csrfToken,
                      },
                    }
                  )

                  const json = await res.json().catch(() => null)
                  if (!res.ok) {
                    throw new Error(json?.error?.message || "Failed to delete user")
                  }

                  toast({
                    title: "User deleted",
                    description: "Tenant user was removed successfully.",
                  })
                  setDeleteOpen(false)
                  setDeleteTarget(null)
                  await reload()
                } catch (err: unknown) {
                  toast({
                    title: "Failed to delete user",
                    description: getErrorMessage(err, "Please try again."),
                    variant: "destructive",
                  })
                } finally {
                  setIsUserSaving(false)
                }
              }}
            >
              {isUserSaving ? "Deleting..." : "Delete"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <ConfirmDialog
        isOpen={!!resetTargetUserId}
        onClose={() => setResetTargetUserId(null)}
        onConfirm={handleConfirmSendReset}
        title="Send password reset?"
        description={`Send a password reset email to ${
          (data?.users ?? []).find((u) => u.id === resetTargetUserId)?.full_name ?? "this user"
        }?`}
        confirmText="Send"
        variant="default"
      />
    </DashboardLayout>
  )
}

