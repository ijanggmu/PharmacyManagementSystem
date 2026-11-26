"use client"

import { cn } from "@/lib/utils"
import type React from "react"

import { useEffect, useState } from "react"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogScrollBody,
  DialogStickyFooter,
  DialogTitle,
  DialogTrigger,
  DIALOG_CONTENT_SCROLL_BODY_CLASS,
} from "@/components/ui/dialog"
import {
  MoreHorizontal,
  Edit,
  Eye,
  EyeOff,
  UserX,
  UserCheck,
  Plus,
  UserPlus,
  CheckCircle2,
  CircleSlash,
  Building2,
  Globe2,
  KeyRound,
  ShieldCheck,
  ShieldOff,
  Trash2,
  Wand2,
} from "lucide-react"
import { useQuery } from "@tanstack/react-query"
import { loadDotnetCurrentUser } from "@/lib/api/auth-api"
import { useHydrated } from "@/lib/hooks/use-hydrated"
import { currentUserQueryKey } from "@/features/branches/hooks/use-branch-access"
import { useResetTwoFactor } from "@/features/users/hooks/use-reset-two-factor"
import { showResetTwoFactorAction } from "@/features/users/lib/two-factor-access"
import { canAddUsers, canChangeUsers, canDeleteUsers } from "@/features/users/lib/user-access"
import { RoleBadge, roleLabel } from "@/features/users/components/role-badge"
import { RoleChecklist } from "@/features/users/components/role-checklist"
import { SetPasswordDialog } from "@/features/users/components/set-password-dialog"
import { PasswordStrength } from "@/components/get-started/password-strength"
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu"
import { DataTable, Column } from "@/components/ui/data-table"
import { ConfirmDialog } from "@/components/ui/confirm-dialog"
import { useUsers, useCreateUser, useUpdateUser, useDeleteUser, useSetUserPassword } from "@/features/users/hooks/use-users"
import { usersApi, type User } from "@/features/users/api-client"
import { addUserSchema, editUserSchema, fieldErrorsOf, type AddUserForm, type EditUserForm } from "@/features/users/schemas/user-form"
import { useDebounce } from "@/lib/utils/performance"
import { generateStrongPassword } from "@/lib/utils/password-policy"
import { useRolesBranchAccess, useRoles } from "@/features/users/hooks/use-roles"
import { branchLabel, useBranches } from "@/features/branches/hooks/use-branches"
import type { Branch } from "@/lib/api/branches-api"

interface UserManagementProps {
  users?: User[] // Optional for backward compatibility
}

const ITEMS_PER_PAGE = 10

type View = "active" | "deleted"

/** yyyy-MM-dd, so exported dates sort and read the same in every spreadsheet. */
function isoDate(value: string | null | undefined): string {
  if (!value) return ""
  const date = new Date(value)
  return Number.isNaN(date.getTime()) ? "" : date.toISOString().slice(0, 10)
}

function rolesText(user: User): string {
  return (user.roles.length ? user.roles : [user.role]).filter(Boolean).map(roleLabel).join(", ")
}

export default function UserManagement(_props: UserManagementProps) {
  const [searchTerm, setSearchTerm] = useState("")
  const [currentPage, setCurrentPage] = useState(1)
  const [view, setView] = useState<View>("active")
  const [editingUser, setEditingUser] = useState<User | null>(null)
  const [isAddDialogOpen, setIsAddDialogOpen] = useState(false)
  const [userToDeactivate, setUserToDeactivate] = useState<User | null>(null)
  const [userToDelete, setUserToDelete] = useState<User | null>(null)
  const [userToResetPassword, setUserToResetPassword] = useState<User | null>(null)
  const [userToResetTwoFactor, setUserToResetTwoFactor] = useState<User | null>(null)
  const { data: branches = [] } = useBranches()
  const resetTwoFactorMutation = useResetTwoFactor()
  // Same cached query as useBranchAccess: the signed-in user's permission claims.
  const { data: currentUser } = useQuery({
    queryKey: currentUserQueryKey,
    queryFn: () => loadDotnetCurrentUser(),
    staleTime: 5 * 60 * 1000,
  })
  // Empty during the server and hydration renders: the server has no cached user, so a client that already
  // holds one would otherwise render the action buttons the server left out and fail hydration.
  const hydrated = useHydrated()
  const grantedPermissions = hydrated ? (currentUser?.info.permissions ?? []) : []
  // The manager sees staff but may not add, edit or switch them off (the API would refuse).
  const mayAddUsers = canAddUsers(grantedPermissions)
  const mayChangeUsers = canChangeUsers(grantedPermissions)
  const mayDeleteUsers = canDeleteUsers(grantedPermissions)
  const isSelf = (user: User) => hydrated && !!currentUser && currentUser.id === user.id

  // Server-side search, debounced so typing doesn't fire a request (plus a roles call per row) on
  // every keystroke; the trimmed term keeps "ram " and "ram" on the same cache entry.
  const debouncedSearch = useDebounce(searchTerm.trim(), 300)
  const filters = { search: debouncedSearch || undefined, deleted: view === "deleted" || undefined }
  const { data: usersResponse, isLoading, error } = useUsers({ ...filters, page: currentPage, limit: ITEMS_PER_PAGE })
  const updateUserMutation = useUpdateUser()
  const deleteUserMutation = useDeleteUser()
  const setPasswordMutation = useSetUserPassword()

  const users = usersResponse?.data || []
  const usersError = usersResponse?.error

  // Server-side paging: the API's totalCount, not this page's row count.
  const totalUsers = usersResponse?.total ?? users.length
  const totalPages = Math.max(1, Math.ceil(totalUsers / ITEMS_PER_PAGE))

  const handleConfirmDeactivate = async () => {
    const user = userToDeactivate
    if (!user) return
    const result = await updateUserMutation.mutateAsync({ id: user.id, updates: { is_active: false } })
    if (!result.error) setUserToDeactivate(null)
  }

  const handleActivateUser = async (user: User) => {
    await updateUserMutation.mutateAsync({ id: user.id, updates: { is_active: true } })
  }

  const handleConfirmDelete = async () => {
    const user = userToDelete
    if (!user) return
    const result = await deleteUserMutation.mutateAsync(user.id)
    if (!result.error) setUserToDelete(null)
  }

  const handleConfirmResetTwoFactor = async () => {
    const user = userToResetTwoFactor
    if (!user) return
    const result = await resetTwoFactorMutation.mutateAsync(user.id)
    if (!result.error) setUserToResetTwoFactor(null)
  }

  const handleSearch = (value: string) => {
    setSearchTerm(value)
    setCurrentPage(1)
  }

  const columns: Column<User>[] = [
    {
      key: "user",
      header: "User",
      cell: (user) => (
        <div className="max-w-[220px] truncate font-medium" title={user.full_name}>
          {user.full_name}
          {isSelf(user) ? <span className="ml-1.5 text-xs font-normal text-muted-foreground">(you)</span> : null}
        </div>
      ),
      exportValue: (user) => user.full_name,
    },
    {
      key: "email",
      header: "Email",
      cell: (user) => (
        <div className="max-w-[240px] truncate text-muted-foreground" title={user.email}>
          {user.deleted_at ? "—" : user.email}
        </div>
      ),
      exportValue: (user) => (user.deleted_at ? "" : user.email),
    },
    {
      key: "role",
      header: "Roles",
      cell: (user) => (
        <div className="flex max-w-[260px] flex-wrap gap-1">
          {(user.roles.length ? user.roles : [user.role]).map((role) => (
            <RoleBadge key={role} role={role} />
          ))}
        </div>
      ),
      exportValue: rolesText,
    },
    {
      key: "branch",
      header: "Branch",
      cell: (user) => (
        <div className="flex items-center gap-1.5 text-muted-foreground">
          <Building2 className="h-3.5 w-3.5 shrink-0" aria-hidden />
          <span className="truncate">{branches.length ? branchLabel(branches, user.branch_id) : "—"}</span>
        </div>
      ),
      exportValue: (user) => (branches.length ? branchLabel(branches, user.branch_id) : ""),
    },
    {
      key: "phone",
      header: "Phone",
      cell: (user) => <div className="num">{user.phone || "—"}</div>,
      exportValue: (user) => user.phone || "",
    },
    {
      key: "status",
      header: "Status",
      cell: (user) =>
        user.deleted_at ? (
          <Badge variant="danger">
            <Trash2 aria-hidden />
            Deleted
          </Badge>
        ) : user.is_active === false ? (
          <Badge variant="muted">
            <CircleSlash aria-hidden />
            Inactive
          </Badge>
        ) : (
          <Badge variant="success">
            <CheckCircle2 aria-hidden />
            Active
          </Badge>
        ),
      exportValue: (user) => (user.deleted_at ? "Deleted" : user.is_active === false ? "Inactive" : "Active"),
    },
    {
      key: "two_factor",
      header: "2FA",
      cell: (user) =>
        user.two_factor_enabled ? (
          <Badge variant="success" title="Two-step verification is on">
            <ShieldCheck aria-hidden />
            On
          </Badge>
        ) : (
          <Badge variant="muted" title="Two-step verification is off">
            <ShieldOff aria-hidden />
            Off
          </Badge>
        ),
      exportValue: (user) => (user.two_factor_enabled ? "On" : "Off"),
    },
    {
      key: "joined",
      header: view === "deleted" ? "Deleted" : "Joined",
      cell: (user) => {
        const value = view === "deleted" ? user.deleted_at : user.created_at
        return <div className="num">{value ? new Date(value).toLocaleDateString() : "—"}</div>
      },
      exportValue: (user) => isoDate(view === "deleted" ? user.deleted_at : user.created_at),
    },
    {
      key: "actions",
      header: "",
      className: "w-[50px]",
      cell: (user) => {
        if (user.deleted_at) return null
        const self = isSelf(user)
        const canEdit = mayChangeUsers
        const canResetPassword = mayChangeUsers && !self
        const canDelete = mayDeleteUsers && !self
        const canTwoFactor = showResetTwoFactorAction(user, grantedPermissions)
        if (!canEdit && !canTwoFactor && !canDelete) return null
        return (
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button variant="ghost" size="icon" aria-label={`Actions for ${user.full_name}`}>
                <MoreHorizontal className="h-4 w-4" aria-hidden />
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end">
              {canEdit && (
                <DropdownMenuItem onClick={() => setEditingUser(user)}>
                  <Edit className="mr-2 h-4 w-4" aria-hidden />
                  Edit user
                </DropdownMenuItem>
              )}
              {canResetPassword && (
                <DropdownMenuItem onClick={() => setUserToResetPassword(user)}>
                  <KeyRound className="mr-2 h-4 w-4" aria-hidden />
                  Reset password
                </DropdownMenuItem>
              )}
              {canTwoFactor && (
                <DropdownMenuItem onClick={() => setUserToResetTwoFactor(user)}>
                  <ShieldOff className="mr-2 h-4 w-4" aria-hidden />
                  Reset 2FA
                </DropdownMenuItem>
              )}
              {canEdit && !self && user.is_active === false ? (
                <DropdownMenuItem onClick={() => void handleActivateUser(user)}>
                  <UserCheck className="mr-2 h-4 w-4" aria-hidden />
                  Reactivate user
                </DropdownMenuItem>
              ) : null}
              {(canEdit && !self && user.is_active !== false) || canDelete ? <DropdownMenuSeparator /> : null}
              {canEdit && !self && user.is_active !== false ? (
                <DropdownMenuItem
                  className="text-destructive focus:bg-destructive/10 focus:text-destructive"
                  onClick={() => setUserToDeactivate(user)}
                >
                  <UserX className="mr-2 h-4 w-4" aria-hidden />
                  Deactivate user
                </DropdownMenuItem>
              ) : null}
              {canDelete && (
                <DropdownMenuItem
                  className="text-destructive focus:bg-destructive/10 focus:text-destructive"
                  onClick={() => setUserToDelete(user)}
                >
                  <Trash2 className="mr-2 h-4 w-4" aria-hidden />
                  Delete user
                </DropdownMenuItem>
              )}
            </DropdownMenuContent>
          </DropdownMenu>
        )
      },
    },
  ]

  return (
    <div className="space-y-4">
      <DataTable
        data={users}
        columns={columns}
        isLoading={isLoading}
        error={error || usersError}
        emptyMessage={
          view === "deleted"
            ? "No deleted users"
            : searchTerm
              ? "No users match your search"
              : "No staff users yet — add your first user to give them access"
        }
        searchPlaceholder="Search by name or email…"
        searchValue={searchTerm}
        onSearch={handleSearch}
        currentPage={currentPage}
        totalPages={totalPages}
        totalItems={totalUsers}
        itemsPerPage={ITEMS_PER_PAGE}
        onPageChange={setCurrentPage}
        showSerialNumber
        serialOffset={(currentPage - 1) * ITEMS_PER_PAGE}
        enableExport
        exportFilename={view === "deleted" ? "deleted-users" : "users"}
        exportTitle={view === "deleted" ? "Deleted users" : "Users"}
        onExportAll={() => usersApi.getAllUsers(filters)}
        filters={
          <Select
            value={view}
            onValueChange={(next) => {
              setView(next as View)
              setCurrentPage(1)
            }}
          >
            <SelectTrigger className="w-full sm:w-[170px]" aria-label="Which users to show">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="active">Current staff</SelectItem>
              <SelectItem value="deleted">Deleted users</SelectItem>
            </SelectContent>
          </Select>
        }
        actions={
          mayAddUsers && (
            <Dialog open={isAddDialogOpen} onOpenChange={setIsAddDialogOpen}>
              <DialogTrigger asChild>
                <Button>
                  <Plus aria-hidden />
                  Add user
                </Button>
              </DialogTrigger>
              <DialogContent className={cn(DIALOG_CONTENT_SCROLL_BODY_CLASS, "sm:max-w-xl")}>
                <DialogHeader className="px-6 pb-2 pt-6">
                  <DialogTitle>Add user</DialogTitle>
                  <DialogDescription>Create a sign-in for a staff member. Fields marked * are required.</DialogDescription>
                </DialogHeader>
                {isAddDialogOpen ? <AddUserFormView onDone={() => setIsAddDialogOpen(false)} /> : null}
              </DialogContent>
            </Dialog>
          )
        }
      />

      <Dialog open={editingUser !== null} onOpenChange={(open) => (open ? null : setEditingUser(null))}>
        <DialogContent className={cn(DIALOG_CONTENT_SCROLL_BODY_CLASS, "sm:max-w-xl")}>
          <DialogHeader className="px-6 pb-2 pt-6">
            <DialogTitle>Edit user</DialogTitle>
            <DialogDescription>Update {editingUser?.full_name || "this user"}&apos;s details and roles.</DialogDescription>
          </DialogHeader>
          {editingUser && (
            <EditUserFormView
              key={editingUser.id}
              user={editingUser}
              isSelf={isSelf(editingUser)}
              onDone={() => setEditingUser(null)}
            />
          )}
        </DialogContent>
      </Dialog>

      <SetPasswordDialog
        userName={userToResetPassword?.full_name || "this user"}
        open={userToResetPassword !== null}
        onOpenChange={(open) => (open ? null : setUserToResetPassword(null))}
        onSubmit={async (password) => {
          if (!userToResetPassword) return null
          const result = await setPasswordMutation.mutateAsync({ id: userToResetPassword.id, password })
          return result.error
        }}
      />

      <ConfirmDialog
        isOpen={userToDeactivate !== null}
        onClose={() => setUserToDeactivate(null)}
        onConfirm={() => void handleConfirmDeactivate()}
        title="Deactivate user?"
        description={`Deactivate ${userToDeactivate?.full_name || "this user"}? They will immediately lose access, but their sales and dispensing history stay attributed to them. You can reactivate them later.`}
        confirmText="Deactivate user"
        cancelText="Cancel"
        variant="destructive"
        loading={updateUserMutation.isPending}
      />

      <ConfirmDialog
        isOpen={userToDelete !== null}
        onClose={() => setUserToDelete(null)}
        onConfirm={() => void handleConfirmDelete()}
        title="Delete user?"
        description={
          <>
            <span className="font-medium text-foreground">{userToDelete?.full_name || "This user"}</span> will be signed
            out and won&apos;t be able to sign in again. They disappear from this list (find them under &ldquo;Deleted
            users&rdquo;), and their email can be used for a new account. Past sales, prescriptions and audit entries keep
            their name. This can&apos;t be undone. To pause access instead, deactivate them.
          </>
        }
        confirmText="Delete user"
        cancelText="Cancel"
        variant="destructive"
        loading={deleteUserMutation.isPending}
      />

      <ConfirmDialog
        isOpen={userToResetTwoFactor !== null}
        onClose={() => setUserToResetTwoFactor(null)}
        onConfirm={() => void handleConfirmResetTwoFactor()}
        title="Reset two-step verification?"
        description={
          <>
            This turns off two-step verification for{" "}
            <span className="font-medium text-foreground">{userToResetTwoFactor?.full_name || "this user"}</span>, deletes
            their recovery codes and signs them out of every device. They&apos;ll sign in with just their password and
            must set up 2FA again. Only do this after confirming who is asking.
          </>
        }
        confirmText="Reset 2FA"
        cancelText="Cancel"
        variant="destructive"
        loading={resetTwoFactorMutation.isPending}
      />
    </div>
  )
}

function RequiredMark() {
  return (
    <span className="text-destructive" aria-hidden>
      {" "}*
    </span>
  )
}

function FieldMessage({ id, message }: { id: string; message?: string }) {
  return message ? (
    <p id={id} className="text-sm text-destructive">
      {message}
    </p>
  ) : null
}

/** Explains, next to the branch picker, whether the chosen roles limit this person to that branch. */
function BranchAccessNote({ id, roleNames, branchHelp }: { id: string; roleNames: string[]; branchHelp: string }) {
  const { access } = useRolesBranchAccess(roleNames)
  const subject = roleNames.length === 1 ? `The ${roleLabel(roleNames[0])} role` : "One of these roles"
  return (
    <div id={id} className="space-y-1.5 text-xs text-muted-foreground">
      <p>{branchHelp}</p>
      {access && (
        <p className="flex items-start gap-1.5 rounded-md border bg-muted/40 px-2.5 py-2 text-foreground">
          {access === "all" ? (
            <Globe2 className="mt-px h-3.5 w-3.5 shrink-0 text-primary" aria-hidden />
          ) : (
            <Building2 className="mt-px h-3.5 w-3.5 shrink-0 text-muted-foreground" aria-hidden />
          )}
          <span>
            {access === "all" ? (
              <>
                <span className="font-medium">Sees all branches.</span> {subject} can view every branch&apos;s records.
              </>
            ) : (
              <>
                <span className="font-medium">Sees this branch only.</span> To widen access, set Branch access to
                &ldquo;All branches&rdquo; on one of the roles.
              </>
            )}
          </span>
        </p>
      )}
    </div>
  )
}

/** Active branches only; the default branch is marked. Disabled while loading or when there are none. */
function BranchSelect({
  id,
  value,
  onChange,
  branches,
  isLoading,
  invalid,
}: {
  id: string
  value: string
  onChange: (value: string) => void
  branches: Branch[]
  isLoading: boolean
  invalid?: boolean
}) {
  const active = branches.filter((b) => b.isActive)
  return (
    <Select value={value} onValueChange={onChange} disabled={isLoading || active.length === 0}>
      <SelectTrigger id={id} aria-describedby={`${id}-help`} aria-invalid={invalid || undefined}>
        <SelectValue placeholder={isLoading ? "Loading branches…" : "Choose a branch"} />
      </SelectTrigger>
      <SelectContent>
        {active.map((branch) => (
          <SelectItem key={branch.id} value={branch.id}>
            {branch.name}
            <span className="text-muted-foreground">
              {" · "}
              {branch.code}
              {branch.isDefault ? " · default" : ""}
            </span>
          </SelectItem>
        ))}
      </SelectContent>
    </Select>
  )
}

/** Picks the tenant default once branches load, unless something is already chosen. */
function useDefaultBranch(branches: Branch[], current: string, set: (id: string) => void) {
  useEffect(() => {
    if (current) return
    const fallback = branches.find((b) => b.isActive && b.isDefault) ?? branches.find((b) => b.isActive)
    if (fallback) set(fallback.id)
  }, [branches, current, set])
}

const EMPTY_ADD: AddUserForm = { email: "", fullName: "", roles: [], phone: "", password: "", branchId: "" }

function AddUserFormView({ onDone }: { onDone: () => void }) {
  const createUserMutation = useCreateUser()
  const { data: branches = [], isLoading: branchesLoading } = useBranches()
  const { data: roles = [], isLoading: rolesLoading } = useRoles()
  const [showPassword, setShowPassword] = useState(false)
  const [submitted, setSubmitted] = useState(false)
  const [formData, setFormData] = useState<AddUserForm>(EMPTY_ADD)
  const [setBranchId] = useState(() => (id: string) => setFormData((prev) => ({ ...prev, branchId: id })))
  useDefaultBranch(branches, formData.branchId, setBranchId)

  const errors = submitted ? fieldErrorsOf(addUserSchema, formData) : {}
  const set = <K extends keyof AddUserForm>(key: K, value: AddUserForm[K]) => setFormData((prev) => ({ ...prev, [key]: value }))

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    setSubmitted(true)
    const parsed = addUserSchema.safeParse(formData)
    if (!parsed.success) return
    const result = await createUserMutation.mutateAsync({
      email: parsed.data.email,
      full_name: parsed.data.fullName,
      roles: parsed.data.roles,
      phone: parsed.data.phone || null,
      password: parsed.data.password,
      branch_id: parsed.data.branchId,
    })
    if (!result.error) onDone()
  }

  return (
    <form onSubmit={handleSubmit} className="flex min-h-0 flex-1 flex-col" noValidate>
      <DialogScrollBody className="space-y-4 py-4">
        <div className="space-y-2">
          <Label htmlFor="add-fullName">
            Full name
            <RequiredMark />
          </Label>
          <Input
            id="add-fullName"
            value={formData.fullName}
            onChange={(e) => set("fullName", e.target.value)}
            autoComplete="name"
            maxLength={100}
            aria-invalid={!!errors.fullName}
            aria-describedby={errors.fullName ? "add-fullName-error" : undefined}
          />
          <FieldMessage id="add-fullName-error" message={errors.fullName} />
        </div>
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
          <div className="space-y-2">
            <Label htmlFor="add-email">
              Email
              <RequiredMark />
            </Label>
            <Input
              id="add-email"
              type="email"
              inputMode="email"
              value={formData.email}
              onChange={(e) => set("email", e.target.value)}
              autoComplete="email"
              maxLength={256}
              aria-invalid={!!errors.email}
              aria-describedby={errors.email ? "add-email-error" : undefined}
            />
            <FieldMessage id="add-email-error" message={errors.email} />
          </div>
          <div className="space-y-2">
            <Label htmlFor="add-phone">Phone</Label>
            <Input
              id="add-phone"
              type="tel"
              inputMode="tel"
              value={formData.phone}
              onChange={(e) => set("phone", e.target.value)}
              placeholder="98XXXXXXXX"
              maxLength={20}
              aria-invalid={!!errors.phone}
              aria-describedby={errors.phone ? "add-phone-error" : undefined}
            />
            <FieldMessage id="add-phone-error" message={errors.phone} />
          </div>
        </div>
        <fieldset className="space-y-2">
          <legend className="text-sm font-medium">
            Roles
            <RequiredMark />
          </legend>
          <RoleChecklist
            id="add-roles"
            roles={roles}
            value={formData.roles}
            onChange={(next) => set("roles", next)}
            isLoading={rolesLoading}
            invalid={!!errors.roles}
            describedBy="add-roles-help"
          />
          <p id="add-roles-help" className="text-xs text-muted-foreground">
            Pick one or more. Permissions add up: someone with two roles can do everything either allows.
          </p>
          <FieldMessage id="add-roles-error" message={errors.roles} />
        </fieldset>
        <div className="space-y-2">
          <Label htmlFor="add-branch">
            Branch
            <RequiredMark />
          </Label>
          <BranchSelect
            id="add-branch"
            value={formData.branchId}
            onChange={setBranchId}
            branches={branches}
            isLoading={branchesLoading}
            invalid={!!errors.branchId}
          />
          <BranchAccessNote
            id="add-branch-help"
            roleNames={formData.roles}
            branchHelp={
              !branchesLoading && branches.filter((b) => b.isActive).length === 0
                ? "No active branch yet. Add one under Branches first."
                : "Sales, stock and cash shifts this person records belong to this branch."
            }
          />
          <FieldMessage id="add-branch-error" message={errors.branchId} />
        </div>
        <div className="space-y-2">
          <div className="flex items-center justify-between gap-2">
            <Label htmlFor="add-password">
              Temporary password
              <RequiredMark />
            </Label>
            <Button
              type="button"
              variant="ghost"
              size="sm"
              onClick={() => {
                set("password", generateStrongPassword())
                setShowPassword(true)
              }}
            >
              <Wand2 aria-hidden />
              Generate
            </Button>
          </div>
          <div className="relative">
            <Input
              id="add-password"
              type={showPassword ? "text" : "password"}
              value={formData.password}
              onChange={(e) => set("password", e.target.value)}
              autoComplete="new-password"
              maxLength={128}
              className="pr-10 font-mono"
              aria-invalid={!!errors.password}
              aria-describedby="add-password-rules add-password-help"
            />
            <button
              type="button"
              onClick={() => setShowPassword((v) => !v)}
              className="absolute inset-y-0 right-0 flex w-10 items-center justify-center rounded-r-md text-muted-foreground transition-colors hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
              aria-label={showPassword ? "Hide password" : "Show password"}
              aria-pressed={showPassword}
            >
              {showPassword ? <EyeOff className="h-4 w-4" aria-hidden /> : <Eye className="h-4 w-4" aria-hidden />}
            </button>
          </div>
          <PasswordStrength id="add-password-rules" password={formData.password} />
          <FieldMessage id="add-password-error" message={errors.password} />
          <p id="add-password-help" className="text-xs text-muted-foreground">
            Share this with the user privately. They should change it after first sign-in.
          </p>
        </div>
      </DialogScrollBody>
      <DialogStickyFooter className="flex-col-reverse sm:flex-row">
        <Button type="button" variant="outline" onClick={onDone} disabled={createUserMutation.isPending}>
          Cancel
        </Button>
        <Button type="submit" loading={createUserMutation.isPending} loadingText="Adding user…">
          <UserPlus aria-hidden />
          Add user
        </Button>
      </DialogStickyFooter>
    </form>
  )
}

function sameRoles(a: readonly string[], b: readonly string[]): boolean {
  const left = new Set(a.map((r) => r.toLowerCase()))
  const right = new Set(b.map((r) => r.toLowerCase()))
  return left.size === right.size && [...left].every((r) => right.has(r))
}

function EditUserFormView({ user, isSelf, onDone }: { user: User; isSelf: boolean; onDone: () => void }) {
  const updateUserMutation = useUpdateUser()
  const { data: branches = [], isLoading: branchesLoading } = useBranches()
  const { data: roles = [], isLoading: rolesLoading } = useRoles()
  const [submitted, setSubmitted] = useState(false)
  const [formData, setFormData] = useState<EditUserForm>({
    fullName: user.full_name,
    roles: user.roles.length ? user.roles : user.role ? [user.role] : [],
    phone: user.phone || "",
    branchId: user.branch_id ?? "",
  })
  const [setBranchId] = useState(() => (id: string) => setFormData((prev) => ({ ...prev, branchId: id })))
  useDefaultBranch(branches, formData.branchId, setBranchId)

  const errors = submitted ? fieldErrorsOf(editUserSchema, formData) : {}
  const set = <K extends keyof EditUserForm>(key: K, value: EditUserForm[K]) => setFormData((prev) => ({ ...prev, [key]: value }))
  const originalRoles = user.roles.length ? user.roles : user.role ? [user.role] : []

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    setSubmitted(true)
    const parsed = editUserSchema.safeParse(formData)
    if (!parsed.success) return
    const result = await updateUserMutation.mutateAsync({
      id: user.id,
      updates: {
        full_name: parsed.data.fullName,
        // Only send roles when they changed: the server replaces the user's whole role set with them.
        ...(!sameRoles(parsed.data.roles, originalRoles) ? { roles: parsed.data.roles } : {}),
        phone: parsed.data.phone || null,
        // Only send a branch when it differs from what the user already works in.
        ...(parsed.data.branchId && parsed.data.branchId !== user.branch_id ? { branch_id: parsed.data.branchId } : {}),
      },
    })
    if (!result.error) onDone()
  }

  return (
    <form onSubmit={handleSubmit} className="flex min-h-0 flex-1 flex-col" noValidate>
      <DialogScrollBody className="space-y-4 py-4">
        <div className="space-y-2">
          <Label htmlFor="edit-fullName">
            Full name
            <RequiredMark />
          </Label>
          <Input
            id="edit-fullName"
            value={formData.fullName}
            onChange={(e) => set("fullName", e.target.value)}
            maxLength={100}
            aria-invalid={!!errors.fullName}
            aria-describedby={errors.fullName ? "edit-fullName-error" : undefined}
          />
          <FieldMessage id="edit-fullName-error" message={errors.fullName} />
        </div>
        <fieldset className="space-y-2">
          <legend className="text-sm font-medium">
            Roles
            <RequiredMark />
          </legend>
          <RoleChecklist
            id="edit-roles"
            roles={roles}
            value={formData.roles}
            onChange={(next) => set("roles", next)}
            isLoading={rolesLoading}
            invalid={!!errors.roles}
            describedBy="edit-roles-help"
          />
          <p id="edit-roles-help" className="text-xs text-muted-foreground">
            {isSelf
              ? "You can't remove your own Admin role. Ask another administrator if that's needed."
              : "Changing roles changes what this person can access on their next request. Only administrators can change roles."}
          </p>
          <FieldMessage id="edit-roles-error" message={errors.roles} />
        </fieldset>
        <div className="space-y-2">
          <Label htmlFor="edit-branch">Branch</Label>
          <BranchSelect
            id="edit-branch"
            value={formData.branchId}
            onChange={setBranchId}
            branches={branches}
            isLoading={branchesLoading}
          />
          <BranchAccessNote
            id="edit-branch-help"
            roleNames={formData.roles}
            branchHelp="New sales and stock movements by this person are recorded against this branch."
          />
        </div>
        <div className="space-y-2">
          <Label htmlFor="edit-phone">Phone</Label>
          <Input
            id="edit-phone"
            type="tel"
            inputMode="tel"
            value={formData.phone}
            onChange={(e) => set("phone", e.target.value)}
            maxLength={20}
            aria-invalid={!!errors.phone}
            aria-describedby={errors.phone ? "edit-phone-error" : undefined}
          />
          <FieldMessage id="edit-phone-error" message={errors.phone} />
        </div>
      </DialogScrollBody>
      <DialogStickyFooter className="flex-col-reverse sm:flex-row">
        <Button type="button" variant="outline" onClick={onDone} disabled={updateUserMutation.isPending}>
          Cancel
        </Button>
        <Button type="submit" loading={updateUserMutation.isPending} loadingText="Saving…">
          Save changes
        </Button>
      </DialogStickyFooter>
    </form>
  )
}
