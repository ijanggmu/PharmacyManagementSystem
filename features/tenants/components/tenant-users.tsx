"use client"

import { useCallback, useEffect, useState } from "react"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Badge } from "@/components/ui/badge"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table"
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog"
import { useToast } from "@/hooks/use-toast"
import { DotnetApiError } from "@/lib/api/dotnet-client"
import { tenantUsersApi, type TenantUser } from "@/features/tenants/users-api-client"
import { CheckCircle2, CircleSlash, Pencil, Plus, Search, Trash2, Users } from "lucide-react"
import { Switch } from "@/components/ui/switch"
import { ConfirmDialog } from "@/components/ui/confirm-dialog"
import { EmptyState } from "@/components/ui/empty-state"
import { ErrorState } from "@/components/ui/error-state"
import { SkeletonTable } from "@/components/ui/skeleton"
import { Pagination } from "@/components/ui/pagination"

const USERS_PAGE_SIZE = 20

function errorMessage(error: unknown): string {
  return error instanceof DotnetApiError ? error.normalized.message : "Request failed"
}

export function TenantUsers({ tenantId }: { tenantId: string }) {
  const { toast } = useToast()
  const [users, setUsers] = useState<TenantUser[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [search, setSearch] = useState("")
  /** The search last submitted; the input can change without refetching until Search is pressed. */
  const [query, setQuery] = useState("")
  const [pageNumber, setPageNumber] = useState(1)
  const [totals, setTotals] = useState({ count: 0, pages: 0 })

  const [createOpen, setCreateOpen] = useState(false)
  const [creating, setCreating] = useState(false)
  const [form, setForm] = useState({ firstName: "", lastName: "", email: "", userName: "", password: "" })

  const [editUser, setEditUser] = useState<TenantUser | null>(null)
  const [savingEdit, setSavingEdit] = useState(false)
  const [editForm, setEditForm] = useState({ firstName: "", lastName: "", phoneNumber: "", isActive: true })

  const [removingId, setRemovingId] = useState<string | null>(null)
  const [confirmRemove, setConfirmRemove] = useState<TenantUser | null>(null)

  const createDisabled = creating || !form.email || !form.userName || !form.password || !form.firstName

  const load = useCallback(async () => {
    setLoading(true)
    setError(null)
    try {
      const page = await tenantUsersApi.list(tenantId, query, pageNumber, USERS_PAGE_SIZE)
      // A removal can empty the last page; step back to the new last page instead of showing nothing.
      if (page.items.length === 0 && pageNumber > 1 && page.totalPages < pageNumber) {
        setPageNumber(Math.max(1, page.totalPages))
        return
      }
      setUsers(page.items)
      setTotals({ count: page.totalCount, pages: page.totalPages })
    } catch (err) {
      setError(errorMessage(err))
    } finally {
      setLoading(false)
    }
  }, [tenantId, query, pageNumber])

  useEffect(() => {
    void load()
  }, [load])

  const handleCreate = async () => {
    setCreating(true)
    try {
      await tenantUsersApi.create(tenantId, form)
      toast({ title: "User created", description: `${form.email} was added to this tenant.` })
      setCreateOpen(false)
      setForm({ firstName: "", lastName: "", email: "", userName: "", password: "" })
      await load()
    } catch (err) {
      toast({ title: "Failed to create user", description: errorMessage(err), variant: "destructive" })
    } finally {
      setCreating(false)
    }
  }

  const openEdit = (user: TenantUser) => {
    setEditUser(user)
    setEditForm({
      firstName: user.firstName ?? "",
      lastName: user.lastName ?? "",
      phoneNumber: user.phoneNumber ?? "",
      isActive: user.isActive,
    })
  }

  const handleSaveEdit = async () => {
    if (!editUser) return
    setSavingEdit(true)
    try {
      await tenantUsersApi.update(tenantId, editUser.id, editForm)
      toast({ title: "User updated" })
      setEditUser(null)
      await load()
    } catch (err) {
      toast({ title: "Failed to update user", description: errorMessage(err), variant: "destructive" })
    } finally {
      setSavingEdit(false)
    }
  }

  const handleRemove = (user: TenantUser) => {
    setConfirmRemove(user)
  }

  const confirmRemoveUser = async () => {
    const user = confirmRemove
    if (!user) return
    setConfirmRemove(null)
    setRemovingId(user.id)
    try {
      await tenantUsersApi.remove(tenantId, user.id)
      toast({ title: "User removed" })
      await load()
    } catch (err) {
      toast({ title: "Failed to remove user", description: errorMessage(err), variant: "destructive" })
    } finally {
      setRemovingId(null)
    }
  }

  const displayName = (user: TenantUser) =>
    [user.firstName, user.lastName].filter(Boolean).join(" ") || user.userName || "—"

  return (
    <Card>
      <CardHeader>
        <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
          <div>
            <CardTitle className="font-display text-base">Users</CardTitle>
            <CardDescription>
              Users in this tenant&apos;s own Identity database, managed from the root/admin area.
            </CardDescription>
          </div>
          <Dialog open={createOpen} onOpenChange={(open) => !creating && setCreateOpen(open)}>
            <DialogTrigger asChild>
              <Button>
                <Plus aria-hidden />
                Add user
              </Button>
            </DialogTrigger>
            <DialogContent>
              <DialogHeader>
                <DialogTitle>Add user to tenant</DialogTitle>
                <DialogDescription>Creates a new user directly in this tenant. Fields marked * are required.</DialogDescription>
              </DialogHeader>
              <form
                className="space-y-3"
                onSubmit={(e) => {
                  e.preventDefault()
                  if (!createDisabled) void handleCreate()
                }}
              >
                <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
                  <div className="space-y-1.5">
                    <Label htmlFor="tu-first-name">
                      First name <RequiredMark />
                    </Label>
                    <Input id="tu-first-name" value={form.firstName} onChange={(e) => setForm((p) => ({ ...p, firstName: e.target.value }))} required />
                  </div>
                  <div className="space-y-1.5">
                    <Label htmlFor="tu-last-name">Last name</Label>
                    <Input id="tu-last-name" value={form.lastName} onChange={(e) => setForm((p) => ({ ...p, lastName: e.target.value }))} />
                  </div>
                </div>
                <div className="space-y-1.5">
                  <Label htmlFor="tu-email">
                    Email <RequiredMark />
                  </Label>
                  <Input id="tu-email" type="email" autoComplete="off" value={form.email} onChange={(e) => setForm((p) => ({ ...p, email: e.target.value }))} required />
                </div>
                <div className="space-y-1.5">
                  <Label htmlFor="tu-username">
                    Username <RequiredMark />
                  </Label>
                  <Input id="tu-username" autoComplete="off" value={form.userName} onChange={(e) => setForm((p) => ({ ...p, userName: e.target.value }))} required />
                </div>
                <div className="space-y-1.5">
                  <Label htmlFor="tu-password">
                    Temporary password <RequiredMark />
                  </Label>
                  <Input
                    id="tu-password"
                    type="password"
                    autoComplete="new-password"
                    value={form.password}
                    onChange={(e) => setForm((p) => ({ ...p, password: e.target.value }))}
                    aria-describedby="tu-password-help"
                    required
                  />
                  <p id="tu-password-help" className="text-xs text-muted-foreground">
                    Share privately; the user should change it after signing in.
                  </p>
                </div>
                <DialogFooter className="pt-2">
                  <Button type="button" variant="outline" onClick={() => setCreateOpen(false)} disabled={creating}>
                    Cancel
                  </Button>
                  <Button type="submit" disabled={createDisabled} loading={creating} loadingText="Creating…">
                    Create user
                  </Button>
                </DialogFooter>
              </form>
            </DialogContent>
          </Dialog>
        </div>
      </CardHeader>
      <CardContent className="space-y-4">
        <form
          className="flex flex-wrap gap-2"
          role="search"
          onSubmit={(e) => {
            e.preventDefault()
            const next = search.trim()
            if (next === query && pageNumber === 1) void load()
            else {
              setQuery(next)
              setPageNumber(1)
            }
          }}
        >
          <div className="relative min-w-0 flex-1">
            <Search className="pointer-events-none absolute left-2.5 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" aria-hidden />
            <Input
              aria-label="Search tenant users by name or email"
              placeholder="Search by name or email"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              className="pl-8"
            />
          </div>
          <Button type="submit" variant="outline" loading={loading}>
            Search
          </Button>
        </form>

        {loading ? (
          <SkeletonTable rows={4} cols={4} />
        ) : error ? (
          <ErrorState size="compact" title="Couldn't load users" message={`${error}. Try again in a moment.`} onRetry={() => void load()} />
        ) : users.length === 0 ? (
          <EmptyState
            size="compact"
            icon={Users}
            title={query ? "No users match your search" : "No users in this tenant yet"}
            description={query ? "Try a different name or email." : "Add the first user to give this pharmacy access."}
            action={query ? undefined : { label: "Add user", onClick: () => setCreateOpen(true), icon: Plus }}
          />
        ) : (
          <div className="overflow-x-auto rounded-md border">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Name</TableHead>
                  <TableHead>Email</TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead className="text-right">Actions</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {users.map((user) => (
                  <TableRow key={user.id}>
                    <TableCell className="font-medium">{displayName(user)}</TableCell>
                    <TableCell className="max-w-[240px] truncate text-muted-foreground" title={user.email ?? undefined}>
                      {user.email}
                    </TableCell>
                    <TableCell>
                      {user.isActive ? (
                        <Badge variant="success">
                          <CheckCircle2 aria-hidden />
                          Active
                        </Badge>
                      ) : (
                        <Badge variant="muted">
                          <CircleSlash aria-hidden />
                          Inactive
                        </Badge>
                      )}
                    </TableCell>
                    <TableCell className="text-right">
                      <div className="flex justify-end gap-1">
                        <Button size="sm" variant="ghost" onClick={() => openEdit(user)} aria-label={`Edit ${displayName(user)}`}>
                          <Pencil aria-hidden />
                          Edit
                        </Button>
                        <Button
                          size="icon"
                          variant="ghost"
                          className="text-destructive hover:bg-destructive/10 hover:text-destructive"
                          loading={removingId === user.id}
                          onClick={() => handleRemove(user)}
                          aria-label={`Remove ${user.email ?? user.userName}`}
                        >
                          {removingId === user.id ? null : <Trash2 aria-hidden />}
                        </Button>
                      </div>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>
        )}

        {!loading && !error ? (
          <Pagination
            currentPage={pageNumber}
            totalPages={totals.pages}
            totalItems={totals.count}
            itemsPerPage={USERS_PAGE_SIZE}
            startIndex={(pageNumber - 1) * USERS_PAGE_SIZE}
            onPageChange={setPageNumber}
          />
        ) : null}

        <p className="text-xs text-muted-foreground">
          Password reset for another tenant&apos;s user is not available: the Identity module only has a
          token-based self-service reset flow (emailed link), with no admin-initiated variant.
        </p>
      </CardContent>

      <Dialog open={editUser !== null} onOpenChange={(open) => !open && !savingEdit && setEditUser(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Edit user</DialogTitle>
            <DialogDescription>{editUser?.email}</DialogDescription>
          </DialogHeader>
          <form
            className="space-y-3"
            onSubmit={(e) => {
              e.preventDefault()
              void handleSaveEdit()
            }}
          >
            <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
              <div className="space-y-1.5">
                <Label htmlFor="tu-edit-first-name">First name</Label>
                <Input id="tu-edit-first-name" value={editForm.firstName} onChange={(e) => setEditForm((p) => ({ ...p, firstName: e.target.value }))} />
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="tu-edit-last-name">Last name</Label>
                <Input id="tu-edit-last-name" value={editForm.lastName} onChange={(e) => setEditForm((p) => ({ ...p, lastName: e.target.value }))} />
              </div>
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="tu-edit-phone">Phone number</Label>
              <Input id="tu-edit-phone" type="tel" value={editForm.phoneNumber} onChange={(e) => setEditForm((p) => ({ ...p, phoneNumber: e.target.value }))} />
            </div>
            <div className="flex items-center justify-between gap-4 rounded-lg border p-3">
              <div className="space-y-0.5">
                <Label htmlFor="tu-edit-active">Active</Label>
                <p id="tu-edit-active-help" className="text-xs text-muted-foreground">Inactive users can&apos;t sign in.</p>
              </div>
              <Switch
                id="tu-edit-active"
                aria-describedby="tu-edit-active-help"
                checked={editForm.isActive}
                onCheckedChange={(checked) => setEditForm((p) => ({ ...p, isActive: checked }))}
              />
            </div>
            <DialogFooter className="pt-2">
              <Button type="button" variant="outline" onClick={() => setEditUser(null)} disabled={savingEdit}>
                Cancel
              </Button>
              <Button type="submit" loading={savingEdit} loadingText="Saving…">
                Save changes
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>

      <ConfirmDialog
        isOpen={confirmRemove !== null}
        onClose={() => setConfirmRemove(null)}
        onConfirm={() => void confirmRemoveUser()}
        title="Remove user?"
        description={`Remove ${confirmRemove?.email ?? confirmRemove?.userName ?? "this user"} from this tenant? They will lose access immediately. This cannot be undone.`}
        confirmText="Remove user"
        variant="destructive"
      />
    </Card>
  )
}

function RequiredMark() {
  return (
    <span className="text-destructive" aria-hidden>
      *
    </span>
  )
}
