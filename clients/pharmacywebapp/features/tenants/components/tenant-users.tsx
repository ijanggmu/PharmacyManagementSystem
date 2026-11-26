"use client"

import { cn } from "@/lib/utils"
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
  DialogHeader,
  DialogScrollBody,
  DialogStickyFooter,
  DialogTitle,
  DIALOG_CONTENT_SCROLL_BODY_CLASS,
} from "@/components/ui/dialog"
import { useToast } from "@/hooks/use-toast"
import { apiRequestErrorMessage } from "@/lib/api/client-helpers"
import { tenantUsersApi, type TenantUser } from "@/features/tenants/users-api-client"
import type { DotnetRoleDto } from "@/lib/api/roles-api"
import { usernameFromEmail } from "@/lib/api/auth-api"
import { CheckCircle2, CircleSlash, Eye, EyeOff, KeyRound, Pencil, Plus, Search, Trash2, Users, Wand2 } from "lucide-react"
import { Switch } from "@/components/ui/switch"
import { ConfirmDialog } from "@/components/ui/confirm-dialog"
import { EmptyState } from "@/components/ui/empty-state"
import { ErrorState } from "@/components/ui/error-state"
import { SkeletonTable } from "@/components/ui/skeleton"
import { Pagination } from "@/components/ui/pagination"
import { PasswordStrength } from "@/components/get-started/password-strength"
import { RoleBadge } from "@/features/users/components/role-badge"
import { RoleChecklist } from "@/features/users/components/role-checklist"
import { SetPasswordDialog } from "@/features/users/components/set-password-dialog"
import { fieldErrorsOf } from "@/features/users/schemas/user-form"
import { generateStrongPassword, passwordPolicyError } from "@/lib/utils/password-policy"
import { z } from "zod"

const USERS_PAGE_SIZE = 20

const nameField = (label: string) =>
  z.string().trim().min(1, `Enter the ${label}`).max(100, `${label[0].toUpperCase()}${label.slice(1)} must be at most 100 characters`)

const phoneField = z
  .string()
  .trim()
  .refine((v) => v === "" || /^\+?[0-9\s-]{7,16}$/.test(v), "Enter a valid phone number, like 98XXXXXXXX")

const createSchema = z.object({
  firstName: nameField("first name"),
  lastName: z.string().trim().max(100, "Last name must be at most 100 characters"),
  email: z.string().trim().min(1, "Enter an email address").max(256).email("Enter a valid email, like name@pharmacy.com"),
  phoneNumber: phoneField,
  roles: z.array(z.string()).min(1, "Choose at least one role"),
  password: z
    .string()
    .max(128, "Password must be at most 128 characters")
    .superRefine((value, ctx) => {
      const error = passwordPolicyError(value)
      if (error) ctx.addIssue({ code: "custom", message: error })
    }),
})
type CreateForm = z.infer<typeof createSchema>

const editSchema = z.object({
  firstName: nameField("first name"),
  lastName: z.string().trim().max(100, "Last name must be at most 100 characters"),
  phoneNumber: phoneField,
  isActive: z.boolean(),
  roles: z.array(z.string()).min(1, "Choose at least one role"),
})
type EditForm = z.infer<typeof editSchema>

const EMPTY_CREATE: CreateForm = { firstName: "", lastName: "", email: "", phoneNumber: "", roles: [], password: "" }

function sameRoles(a: readonly string[], b: readonly string[]): boolean {
  const left = new Set(a.map((r) => r.toLowerCase()))
  const right = new Set(b.map((r) => r.toLowerCase()))
  return left.size === right.size && [...left].every((r) => right.has(r))
}

function FieldMessage({ id, message }: { id: string; message?: string }) {
  return message ? (
    <p id={id} className="text-sm text-destructive">
      {message}
    </p>
  ) : null
}

export function TenantUsers({ tenantId }: { tenantId: string }) {
  const { toast } = useToast()
  const [users, setUsers] = useState<TenantUser[]>([])
  const [userRoles, setUserRoles] = useState<Record<string, string[]>>({})
  const [roles, setRoles] = useState<DotnetRoleDto[]>([])
  const [rolesLoading, setRolesLoading] = useState(true)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [search, setSearch] = useState("")
  /** The search last submitted; the input can change without refetching until Search is pressed. */
  const [query, setQuery] = useState("")
  const [pageNumber, setPageNumber] = useState(1)
  const [totals, setTotals] = useState({ count: 0, pages: 0 })

  const [createOpen, setCreateOpen] = useState(false)
  const [creating, setCreating] = useState(false)
  const [createSubmitted, setCreateSubmitted] = useState(false)
  const [showPassword, setShowPassword] = useState(false)
  const [form, setForm] = useState<CreateForm>(EMPTY_CREATE)

  const [editUser, setEditUser] = useState<TenantUser | null>(null)
  const [savingEdit, setSavingEdit] = useState(false)
  const [editSubmitted, setEditSubmitted] = useState(false)
  const [editForm, setEditForm] = useState<EditForm>({ firstName: "", lastName: "", phoneNumber: "", isActive: true, roles: [] })

  const [removingId, setRemovingId] = useState<string | null>(null)
  const [confirmRemove, setConfirmRemove] = useState<TenantUser | null>(null)
  const [passwordUser, setPasswordUser] = useState<TenantUser | null>(null)

  const createErrors = createSubmitted ? fieldErrorsOf(createSchema, form) : {}
  const editErrors = editSubmitted ? fieldErrorsOf(editSchema, editForm) : {}

  useEffect(() => {
    let cancelled = false
    setRolesLoading(true)
    tenantUsersApi
      .listRoles(tenantId)
      .then((rows) => !cancelled && setRoles(rows))
      .catch(() => !cancelled && setRoles([]))
      .finally(() => !cancelled && setRolesLoading(false))
    return () => {
      cancelled = true
    }
  }, [tenantId])

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
      // Roles per row; a failure leaves that row's roles blank rather than failing the list.
      const entries = await Promise.all(
        page.items.map(async (u) => [u.id, await tenantUsersApi.userRoles(tenantId, u.id).catch(() => [])] as const),
      )
      setUserRoles(Object.fromEntries(entries))
    } catch (err) {
      setError(apiRequestErrorMessage(err))
    } finally {
      setLoading(false)
    }
  }, [tenantId, query, pageNumber])

  useEffect(() => {
    void load()
  }, [load])

  const openCreate = () => {
    setForm(EMPTY_CREATE)
    setCreateSubmitted(false)
    setShowPassword(false)
    setCreateOpen(true)
  }

  const handleCreate = async () => {
    setCreateSubmitted(true)
    const parsed = createSchema.safeParse(form)
    if (!parsed.success) return
    setCreating(true)
    try {
      await tenantUsersApi.create(tenantId, {
        firstName: parsed.data.firstName,
        lastName: parsed.data.lastName,
        email: parsed.data.email,
        userName: usernameFromEmail(parsed.data.email),
        password: parsed.data.password,
        phoneNumber: parsed.data.phoneNumber || null,
        roles: parsed.data.roles,
      })
      toast({ title: "User created", description: `${parsed.data.email} was added to this tenant.` })
      setCreateOpen(false)
      await load()
    } catch (err) {
      toast({ title: "Couldn't create the user", description: apiRequestErrorMessage(err), variant: "destructive" })
    } finally {
      setCreating(false)
    }
  }

  const openEdit = (user: TenantUser) => {
    setEditUser(user)
    setEditSubmitted(false)
    setEditForm({
      firstName: user.firstName ?? "",
      lastName: user.lastName ?? "",
      phoneNumber: user.phoneNumber ?? "",
      isActive: user.isActive,
      roles: userRoles[user.id] ?? [],
    })
  }

  const handleSaveEdit = async () => {
    if (!editUser) return
    setEditSubmitted(true)
    const parsed = editSchema.safeParse(editForm)
    if (!parsed.success) return
    setSavingEdit(true)
    try {
      await tenantUsersApi.update(tenantId, editUser.id, {
        firstName: parsed.data.firstName,
        lastName: parsed.data.lastName || null,
        phoneNumber: parsed.data.phoneNumber || null,
        isActive: parsed.data.isActive,
        // Only send roles when they changed: the server replaces the whole set.
        ...(!sameRoles(parsed.data.roles, userRoles[editUser.id] ?? []) ? { roles: parsed.data.roles } : {}),
      })
      toast({ title: "User updated" })
      setEditUser(null)
      await load()
    } catch (err) {
      toast({ title: "Couldn't update the user", description: apiRequestErrorMessage(err), variant: "destructive" })
    } finally {
      setSavingEdit(false)
    }
  }

  const confirmRemoveUser = async () => {
    const user = confirmRemove
    if (!user) return
    setConfirmRemove(null)
    setRemovingId(user.id)
    try {
      await tenantUsersApi.remove(tenantId, user.id)
      toast({ title: "User deleted", description: "They can no longer sign in. Their past records keep their name." })
      await load()
    } catch (err) {
      toast({ title: "Couldn't delete the user", description: apiRequestErrorMessage(err), variant: "destructive" })
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
            <CardDescription>People who can sign in to this pharmacy, and what each one can do.</CardDescription>
          </div>
          <Button onClick={openCreate}>
            <Plus aria-hidden />
            Add user
          </Button>
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
          <SkeletonTable rows={4} cols={5} />
        ) : error ? (
          <ErrorState size="compact" title="Couldn't load users" message={`${error} Try again in a moment.`} onRetry={() => void load()} />
        ) : users.length === 0 ? (
          <EmptyState
            size="compact"
            icon={Users}
            title={query ? "No users match your search" : "No users in this tenant yet"}
            description={query ? "Try a different name or email." : "Add the first user to give this pharmacy access."}
            action={query ? undefined : { label: "Add user", onClick: openCreate, icon: Plus }}
          />
        ) : (
          <div className="overflow-x-auto rounded-md border">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Name</TableHead>
                  <TableHead>Email</TableHead>
                  <TableHead>Roles</TableHead>
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
                      <div className="flex max-w-[240px] flex-wrap gap-1">
                        {(userRoles[user.id] ?? []).length ? (
                          userRoles[user.id].map((role) => <RoleBadge key={role} role={role} />)
                        ) : (
                          <span className="text-muted-foreground">—</span>
                        )}
                      </div>
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
                          size="sm"
                          variant="ghost"
                          onClick={() => setPasswordUser(user)}
                          aria-label={`Reset password for ${displayName(user)}`}
                        >
                          <KeyRound aria-hidden />
                          <span className="hidden lg:inline">Reset password</span>
                        </Button>
                        <Button
                          size="icon"
                          variant="ghost"
                          className="text-destructive hover:bg-destructive/10 hover:text-destructive"
                          loading={removingId === user.id}
                          onClick={() => setConfirmRemove(user)}
                          aria-label={`Delete ${user.email ?? user.userName}`}
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
      </CardContent>

      {/* Add user */}
      <Dialog open={createOpen} onOpenChange={(open) => !creating && setCreateOpen(open)}>
        <DialogContent className={cn(DIALOG_CONTENT_SCROLL_BODY_CLASS, "sm:max-w-xl")}>
          <DialogHeader className="px-6 pb-2 pt-6">
            <DialogTitle>Add user to tenant</DialogTitle>
            <DialogDescription>Creates a sign-in for this pharmacy. Fields marked * are required.</DialogDescription>
          </DialogHeader>
          <form
            className="flex min-h-0 flex-1 flex-col"
            noValidate
            onSubmit={(e) => {
              e.preventDefault()
              void handleCreate()
            }}
          >
            <DialogScrollBody className="space-y-4 py-4">
              <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
                <div className="space-y-1.5">
                  <Label htmlFor="tu-first-name">
                    First name <RequiredMark />
                  </Label>
                  <Input
                    id="tu-first-name"
                    value={form.firstName}
                    maxLength={100}
                    onChange={(e) => setForm((p) => ({ ...p, firstName: e.target.value }))}
                    aria-invalid={!!createErrors.firstName}
                    aria-describedby={createErrors.firstName ? "tu-first-name-error" : undefined}
                  />
                  <FieldMessage id="tu-first-name-error" message={createErrors.firstName} />
                </div>
                <div className="space-y-1.5">
                  <Label htmlFor="tu-last-name">Last name</Label>
                  <Input
                    id="tu-last-name"
                    value={form.lastName}
                    maxLength={100}
                    onChange={(e) => setForm((p) => ({ ...p, lastName: e.target.value }))}
                  />
                  <FieldMessage id="tu-last-name-error" message={createErrors.lastName} />
                </div>
              </div>
              <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
                <div className="space-y-1.5">
                  <Label htmlFor="tu-email">
                    Email <RequiredMark />
                  </Label>
                  <Input
                    id="tu-email"
                    type="email"
                    inputMode="email"
                    autoComplete="off"
                    maxLength={256}
                    value={form.email}
                    onChange={(e) => setForm((p) => ({ ...p, email: e.target.value }))}
                    aria-invalid={!!createErrors.email}
                    aria-describedby={createErrors.email ? "tu-email-error" : undefined}
                  />
                  <FieldMessage id="tu-email-error" message={createErrors.email} />
                </div>
                <div className="space-y-1.5">
                  <Label htmlFor="tu-phone">Phone</Label>
                  <Input
                    id="tu-phone"
                    type="tel"
                    inputMode="tel"
                    maxLength={20}
                    placeholder="98XXXXXXXX"
                    value={form.phoneNumber}
                    onChange={(e) => setForm((p) => ({ ...p, phoneNumber: e.target.value }))}
                    aria-invalid={!!createErrors.phoneNumber}
                    aria-describedby={createErrors.phoneNumber ? "tu-phone-error" : undefined}
                  />
                  <FieldMessage id="tu-phone-error" message={createErrors.phoneNumber} />
                </div>
              </div>
              <fieldset className="space-y-2">
                <legend className="text-sm font-medium">
                  Roles <RequiredMark />
                </legend>
                <RoleChecklist
                  id="tu-roles"
                  roles={roles}
                  value={form.roles}
                  onChange={(next) => setForm((p) => ({ ...p, roles: next }))}
                  isLoading={rolesLoading}
                  invalid={!!createErrors.roles}
                />
                <FieldMessage id="tu-roles-error" message={createErrors.roles} />
              </fieldset>
              <div className="space-y-1.5">
                <div className="flex items-center justify-between gap-2">
                  <Label htmlFor="tu-password">
                    Temporary password <RequiredMark />
                  </Label>
                  <Button
                    type="button"
                    variant="ghost"
                    size="sm"
                    onClick={() => {
                      setForm((p) => ({ ...p, password: generateStrongPassword() }))
                      setShowPassword(true)
                    }}
                  >
                    <Wand2 aria-hidden />
                    Generate
                  </Button>
                </div>
                <div className="relative">
                  <Input
                    id="tu-password"
                    type={showPassword ? "text" : "password"}
                    autoComplete="new-password"
                    maxLength={128}
                    className="pr-10 font-mono"
                    value={form.password}
                    onChange={(e) => setForm((p) => ({ ...p, password: e.target.value }))}
                    aria-invalid={!!createErrors.password}
                    aria-describedby="tu-password-rules"
                  />
                  <button
                    type="button"
                    onClick={() => setShowPassword((v) => !v)}
                    className="absolute inset-y-0 right-0 flex w-10 items-center justify-center rounded-r-md text-muted-foreground hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                    aria-label={showPassword ? "Hide password" : "Show password"}
                    aria-pressed={showPassword}
                  >
                    {showPassword ? <EyeOff className="size-4" aria-hidden /> : <Eye className="size-4" aria-hidden />}
                  </button>
                </div>
                <PasswordStrength id="tu-password-rules" password={form.password} />
                <FieldMessage id="tu-password-error" message={createErrors.password} />
              </div>
            </DialogScrollBody>
            <DialogStickyFooter className="flex-col-reverse sm:flex-row">
              <Button type="button" variant="outline" onClick={() => setCreateOpen(false)} disabled={creating}>
                Cancel
              </Button>
              <Button type="submit" loading={creating} loadingText="Creating…">
                Create user
              </Button>
            </DialogStickyFooter>
          </form>
        </DialogContent>
      </Dialog>

      {/* Edit user */}
      <Dialog open={editUser !== null} onOpenChange={(open) => !open && !savingEdit && setEditUser(null)}>
        <DialogContent className={cn(DIALOG_CONTENT_SCROLL_BODY_CLASS, "sm:max-w-xl")}>
          <DialogHeader className="px-6 pb-2 pt-6">
            <DialogTitle>Edit user</DialogTitle>
            <DialogDescription>{editUser?.email}</DialogDescription>
          </DialogHeader>
          <form
            className="flex min-h-0 flex-1 flex-col"
            noValidate
            onSubmit={(e) => {
              e.preventDefault()
              void handleSaveEdit()
            }}
          >
            <DialogScrollBody className="space-y-4 py-4">
              <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
                <div className="space-y-1.5">
                  <Label htmlFor="tu-edit-first-name">
                    First name <RequiredMark />
                  </Label>
                  <Input
                    id="tu-edit-first-name"
                    value={editForm.firstName}
                    maxLength={100}
                    onChange={(e) => setEditForm((p) => ({ ...p, firstName: e.target.value }))}
                    aria-invalid={!!editErrors.firstName}
                  />
                  <FieldMessage id="tu-edit-first-name-error" message={editErrors.firstName} />
                </div>
                <div className="space-y-1.5">
                  <Label htmlFor="tu-edit-last-name">Last name</Label>
                  <Input
                    id="tu-edit-last-name"
                    value={editForm.lastName}
                    maxLength={100}
                    onChange={(e) => setEditForm((p) => ({ ...p, lastName: e.target.value }))}
                  />
                </div>
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="tu-edit-phone">Phone number</Label>
                <Input
                  id="tu-edit-phone"
                  type="tel"
                  inputMode="tel"
                  maxLength={20}
                  value={editForm.phoneNumber}
                  onChange={(e) => setEditForm((p) => ({ ...p, phoneNumber: e.target.value }))}
                  aria-invalid={!!editErrors.phoneNumber}
                />
                <FieldMessage id="tu-edit-phone-error" message={editErrors.phoneNumber} />
              </div>
              <fieldset className="space-y-2">
                <legend className="text-sm font-medium">
                  Roles <RequiredMark />
                </legend>
                <RoleChecklist
                  id="tu-edit-roles"
                  roles={roles}
                  value={editForm.roles}
                  onChange={(next) => setEditForm((p) => ({ ...p, roles: next }))}
                  isLoading={rolesLoading}
                  invalid={!!editErrors.roles}
                />
                <FieldMessage id="tu-edit-roles-error" message={editErrors.roles} />
              </fieldset>
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
            </DialogScrollBody>
            <DialogStickyFooter className="flex-col-reverse sm:flex-row">
              <Button type="button" variant="outline" onClick={() => setEditUser(null)} disabled={savingEdit}>
                Cancel
              </Button>
              <Button type="submit" loading={savingEdit} loadingText="Saving…">
                Save changes
              </Button>
            </DialogStickyFooter>
          </form>
        </DialogContent>
      </Dialog>

      <SetPasswordDialog
        userName={passwordUser ? displayName(passwordUser) : "this user"}
        open={passwordUser !== null}
        onOpenChange={(open) => (open ? null : setPasswordUser(null))}
        onSubmit={async (password) => {
          if (!passwordUser) return null
          try {
            await tenantUsersApi.setPassword(tenantId, passwordUser.id, password)
            return null
          } catch (err) {
            return apiRequestErrorMessage(err)
          }
        }}
      />

      <ConfirmDialog
        isOpen={confirmRemove !== null}
        onClose={() => setConfirmRemove(null)}
        onConfirm={() => void confirmRemoveUser()}
        title="Delete user?"
        description={`${confirmRemove?.email ?? confirmRemove?.userName ?? "This user"} will be signed out and won't be able to sign in again. They leave the user list and their email can be reused. Past sales and audit entries keep their name. This can't be undone.`}
        confirmText="Delete user"
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
