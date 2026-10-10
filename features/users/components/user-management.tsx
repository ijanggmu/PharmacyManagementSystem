"use client"

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
  DialogTitle,
  DialogTrigger,
  DIALOG_CONTENT_DETAIL_CLASS,
} from "@/components/ui/dialog"
import { MoreHorizontal, Edit, Eye, EyeOff, UserX, UserCheck, Plus, UserPlus, CheckCircle2, CircleSlash, Building2, Globe2, ShieldCheck, ShieldOff } from "lucide-react"
import { useQuery } from "@tanstack/react-query"
import { loadDotnetCurrentUser } from "@/lib/api/auth-api"
import { currentUserQueryKey } from "@/features/branches/hooks/use-branch-access"
import { useResetTwoFactor } from "@/features/users/hooks/use-reset-two-factor"
import { showResetTwoFactorAction } from "@/features/users/lib/two-factor-access"
import { RoleBadge, roleLabel } from "@/features/users/components/role-badge"
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu"
import { DataTable, Column } from "@/components/ui/data-table"
import { ConfirmDialog } from "@/components/ui/confirm-dialog"
import { useUsers, useCreateUser, useUpdateUser } from "@/features/users/hooks/use-users"
import { useDebounce } from "@/lib/utils/performance"
import { useRoleBranchAccess, useRoles } from "@/features/users/hooks/use-roles"
import { useToast } from "@/hooks/use-toast"
import { branchLabel, useBranches } from "@/features/branches/hooks/use-branches"
import type { Branch } from "@/lib/api/branches-api"

interface User {
  id: string
  email: string
  full_name: string
  role: string
  phone: string | null
  is_active?: boolean
  branch_id?: string | null
  two_factor_enabled?: boolean
  created_at: string
  updated_at: string
}

interface UserManagementProps {
  users?: User[] // Optional for backward compatibility
}

const ITEMS_PER_PAGE = 10

export default function UserManagement({ users: initialUsers }: UserManagementProps) {
  const { toast } = useToast()
  const [searchTerm, setSearchTerm] = useState("")
  const [currentPage, setCurrentPage] = useState(1)
  const [editingUser, setEditingUser] = useState<User | null>(null)
  const [isAddDialogOpen, setIsAddDialogOpen] = useState(false)
  const [isEditDialogOpen, setIsEditDialogOpen] = useState(false)
  const [isDeactivateDialogOpen, setIsDeactivateDialogOpen] = useState(false)
  const [userToToggle, setUserToToggle] = useState<User | null>(null)
  const [userToResetTwoFactor, setUserToResetTwoFactor] = useState<User | null>(null)
  const { data: branches = [] } = useBranches()
  const resetTwoFactorMutation = useResetTwoFactor()
  // Same cached query as useBranchAccess: the signed-in user's permission claims.
  const { data: currentUser } = useQuery({
    queryKey: currentUserQueryKey,
    queryFn: () => loadDotnetCurrentUser(),
    staleTime: 5 * 60 * 1000,
  })
  const grantedPermissions = currentUser?.info.permissions ?? []

  // Server-side search, debounced so typing doesn't fire a request (plus a roles call per row) on
  // every keystroke; the trimmed term keeps "ram " and "ram" on the same cache entry.
  const debouncedSearch = useDebounce(searchTerm.trim(), 300)
  const { data: usersResponse, isLoading, error } = useUsers({
    search: debouncedSearch || undefined,
    page: currentPage,
    limit: ITEMS_PER_PAGE,
  })
  const createUserMutation = useCreateUser()
  const updateUserMutation = useUpdateUser()

  const users = usersResponse?.data || []
  const usersError = usersResponse?.error

  // Server-side paging: the API's totalCount, not this page's row count.
  const totalUsers = usersResponse?.total ?? users.length
  const totalPages = Math.max(1, Math.ceil(totalUsers / ITEMS_PER_PAGE))

  const handlePageChange = (page: number) => {
    setCurrentPage(page)
  }

  const handleUpdateUser = async (userId: string, updates: Partial<User>) => {
    try {
      await updateUserMutation.mutateAsync({ id: userId, updates })
      toast({
        title: "User updated",
        description: "Changes have been saved.",
      })
      setIsEditDialogOpen(false)
      setEditingUser(null)
    } catch (error) {
      console.error("Error updating user:", error)
      toast({
        title: "Couldn't update user",
        description: "Your changes were not saved. Please try again.",
        variant: "destructive",
      })
    }
  }

  // Deactivating (not deleting) is the everyday "remove this employee" action — their
  // sales/dispensing history keeps clean attribution instead of losing the user row.
  const handleDeactivateUser = (user: User) => {
    setUserToToggle(user)
    setIsDeactivateDialogOpen(true)
  }

  const handleConfirmDeactivate = async () => {
    if (!userToToggle) return
    const user = userToToggle
    setIsDeactivateDialogOpen(false)
    setUserToToggle(null)

    try {
      await updateUserMutation.mutateAsync({ id: user.id, updates: { is_active: false } })
    } catch (error) {
      console.error("Error deactivating user:", error)
    }
  }

  const handleActivateUser = async (user: User) => {
    try {
      await updateUserMutation.mutateAsync({ id: user.id, updates: { is_active: true } })
    } catch (error) {
      console.error("Error activating user:", error)
    }
  }

  const handleConfirmResetTwoFactor = async () => {
    const user = userToResetTwoFactor
    if (!user) return
    try {
      const result = await resetTwoFactorMutation.mutateAsync(user.id)
      if (result.error) {
        toast({ title: "Couldn't reset two-step verification", description: result.error, variant: "destructive" })
        return
      }
      setUserToResetTwoFactor(null)
      toast({
        title: "Two-step verification reset",
        description: `${user.full_name || "The user"} can now sign in with just their password and must set up 2FA again.`,
      })
    } catch (error) {
      toast({
        title: "Couldn't reset two-step verification",
        description: error instanceof Error ? error.message : "Please try again.",
        variant: "destructive",
      })
    }
  }

  const handleSearch = (value: string) => {
    setSearchTerm(value)
    setCurrentPage(1)
  }

  // Define columns
  const columns: Column<User>[] = [
    {
      key: "user",
      header: "User",
      cell: (user) => (
        <div className="max-w-[220px] truncate font-medium" title={user.full_name}>
          {user.full_name}
        </div>
      ),
      exportValue: (user) => user.full_name,
    },
    {
      key: "email",
      header: "Email",
      cell: (user) => (
        <div className="max-w-[240px] truncate text-muted-foreground" title={user.email}>
          {user.email}
        </div>
      ),
      exportValue: (user) => user.email,
    },
    {
      key: "role",
      header: "Role",
      cell: (user) => <RoleBadge role={user.role} />,
      exportValue: (user) => roleLabel(user.role),
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
        user.is_active === false ? (
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
      exportValue: (user) => (user.is_active === false ? "Inactive" : "Active"),
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
      header: "Joined",
      cell: (user) => <div className="num">{user.created_at ? new Date(user.created_at).toLocaleDateString() : "—"}</div>,
      exportValue: (user) => (user.created_at ? new Date(user.created_at).toLocaleDateString() : ""),
    },
    {
      key: "actions",
      header: "",
      className: "w-[50px]",
      cell: (user) => (
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <Button variant="ghost" size="icon" aria-label={`Actions for ${user.full_name}`}>
              <MoreHorizontal className="h-4 w-4" aria-hidden />
            </Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end">
            <DropdownMenuItem
              onClick={() => {
                setEditingUser(user)
                setIsEditDialogOpen(true)
              }}
            >
              <Edit className="mr-2 h-4 w-4" aria-hidden />
              Edit user
            </DropdownMenuItem>
            {showResetTwoFactorAction(user, grantedPermissions) && (
              <DropdownMenuItem onClick={() => setUserToResetTwoFactor(user)}>
                <ShieldOff className="mr-2 h-4 w-4" aria-hidden />
                Reset 2FA
              </DropdownMenuItem>
            )}
            {user.is_active === false ? (
              <DropdownMenuItem onClick={() => handleActivateUser(user)}>
                <UserCheck className="mr-2 h-4 w-4" aria-hidden />
                Reactivate user
              </DropdownMenuItem>
            ) : (
              <>
                <DropdownMenuSeparator />
                <DropdownMenuItem
                  className="text-destructive focus:bg-destructive/10 focus:text-destructive"
                  onClick={() => handleDeactivateUser(user)}
                >
                  <UserX className="mr-2 h-4 w-4" aria-hidden />
                  Deactivate user
                </DropdownMenuItem>
              </>
            )}
          </DropdownMenuContent>
        </DropdownMenu>
      ),
    },
  ]

  return (
    <div className="space-y-4">
      <DataTable
        data={users}
        columns={columns}
        isLoading={isLoading}
        error={error || usersError}
        emptyMessage={searchTerm ? "No users match your search" : "No staff users yet — add your first user to give them access"}
        searchPlaceholder="Search by name or email…"
        searchValue={searchTerm}
        onSearch={handleSearch}
        currentPage={currentPage}
        totalPages={totalPages}
        totalItems={totalUsers}
        itemsPerPage={ITEMS_PER_PAGE}
        onPageChange={handlePageChange}
        showSerialNumber
        serialOffset={(currentPage - 1) * ITEMS_PER_PAGE}
        enableExport
        exportFilename="users"
        exportTitle="Users"
        actions={
          <Dialog open={isAddDialogOpen} onOpenChange={setIsAddDialogOpen}>
            <DialogTrigger asChild>
              <Button>
                <Plus aria-hidden />
                Add user
              </Button>
            </DialogTrigger>
            <DialogContent className={DIALOG_CONTENT_DETAIL_CLASS}>
              <DialogHeader>
                <DialogTitle>Add user</DialogTitle>
                <DialogDescription>Create a sign-in for a staff member. Fields marked * are required.</DialogDescription>
              </DialogHeader>
              <AddUserForm
                onSuccess={() => setIsAddDialogOpen(false)}
                onUserAdded={() => {
                  // TanStack Query will automatically refetch
                }}
              />
            </DialogContent>
          </Dialog>
        }
      />

      {/* Edit User Dialog */}
      <Dialog open={isEditDialogOpen} onOpenChange={setIsEditDialogOpen}>
        <DialogContent className={DIALOG_CONTENT_DETAIL_CLASS}>
          <DialogHeader>
            <DialogTitle>Edit user</DialogTitle>
            <DialogDescription>Update {editingUser?.full_name || "this user"}&apos;s details and role.</DialogDescription>
          </DialogHeader>
          {editingUser && (
            <EditUserForm
              user={editingUser}
              onSave={(updates) => handleUpdateUser(editingUser.id, updates)}
              saving={updateUserMutation.isPending}
              onCancel={() => {
                setIsEditDialogOpen(false)
                setEditingUser(null)
              }}
            />
          )}
        </DialogContent>
      </Dialog>

      {/* Deactivate Confirmation Dialog */}
      <ConfirmDialog
        isOpen={isDeactivateDialogOpen}
        onClose={() => {
          setIsDeactivateDialogOpen(false)
          setUserToToggle(null)
        }}
        onConfirm={handleConfirmDeactivate}
        title="Deactivate user?"
        description={`Deactivate ${userToToggle?.full_name || "this user"}? They will immediately lose access, but their sales and dispensing history stay attributed to them. You can reactivate them later.`}
        confirmText="Deactivate user"
        cancelText="Cancel"
        variant="destructive"
      />

      {/* Reset 2FA Confirmation Dialog */}
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

/** The tenant's real roles. The value is matched case-insensitively so legacy lowercase names still select. */
function RoleSelect({ id, value, onChange }: { id: string; value: string; onChange: (value: string) => void }) {
  const { data: roles = [], isLoading } = useRoles()
  const selected = roles.find((r) => r.name.toLowerCase() === value.toLowerCase())?.name ?? ""
  return (
    <Select value={selected} onValueChange={onChange} disabled={isLoading || roles.length === 0}>
      <SelectTrigger id={id} aria-describedby={`${id}-help`}>
        <SelectValue placeholder={isLoading ? "Loading roles…" : "Choose a role"} />
      </SelectTrigger>
      <SelectContent>
        {roles.map((role) => (
          <SelectItem key={role.id} value={role.name}>
            {roleLabel(role.name)}
          </SelectItem>
        ))}
      </SelectContent>
    </Select>
  )
}

/** Explains, next to the branch picker, whether the chosen role limits this person to that branch. */
function BranchAccessNote({ id, roleName, branchHelp }: { id: string; roleName: string; branchHelp: string }) {
  const { access } = useRoleBranchAccess(roleName)
  const role = roleName ? roleLabel(roleName) : "this"
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
                <span className="font-medium">Sees all branches.</span> The {role} role can view every branch&apos;s records.
              </>
            ) : (
              <>
                <span className="font-medium">Sees this branch only.</span> To widen access, set Branch access to
                &ldquo;All branches&rdquo; on the {role} role.
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
}: {
  id: string
  value: string
  onChange: (value: string) => void
  branches: Branch[]
  isLoading: boolean
}) {
  const active = branches.filter((b) => b.isActive)
  return (
    <Select value={value} onValueChange={onChange} disabled={isLoading || active.length === 0}>
      <SelectTrigger id={id} aria-describedby={`${id}-help`}>
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

function AddUserForm({ onSuccess, onUserAdded }: { onSuccess: () => void; onUserAdded: () => void }) {
  const createUserMutation = useCreateUser()
  const { data: branches = [], isLoading: branchesLoading } = useBranches()
  const [showPassword, setShowPassword] = useState(false)
  const [formData, setFormData] = useState({
    email: "",
    fullName: "",
    role: "cashier",
    phone: "",
    password: "",
    branchId: "",
  })
  const [setBranchId] = useState(() => (id: string) => setFormData((prev) => ({ ...prev, branchId: id })))
  useDefaultBranch(branches, formData.branchId, setBranchId)

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()

    try {
      await createUserMutation.mutateAsync({
        email: formData.email,
        full_name: formData.fullName,
        role: formData.role,
        phone: formData.phone || null,
        password: formData.password,
        branch_id: formData.branchId || null,
      })
      onUserAdded()
      onSuccess()
    } catch (error) {
      console.error("Error adding user:", error)
    }
  }

  return (
    <form onSubmit={handleSubmit} className="space-y-4">
      <div className="space-y-2">
        <Label htmlFor="add-fullName">
          Full name
          <RequiredMark />
        </Label>
        <Input
          id="add-fullName"
          value={formData.fullName}
          onChange={(e) => setFormData((prev) => ({ ...prev, fullName: e.target.value }))}
          autoComplete="name"
          required
        />
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
            value={formData.email}
            onChange={(e) => setFormData((prev) => ({ ...prev, email: e.target.value }))}
            autoComplete="email"
            required
          />
        </div>
        <div className="space-y-2">
          <Label htmlFor="add-phone">Phone</Label>
          <Input
            id="add-phone"
            type="tel"
            value={formData.phone}
            onChange={(e) => setFormData((prev) => ({ ...prev, phone: e.target.value }))}
            placeholder="98XXXXXXXX"
          />
        </div>
      </div>
      <div className="space-y-2">
        <Label htmlFor="add-role">
          Role
          <RequiredMark />
        </Label>
        <RoleSelect id="add-role" value={formData.role} onChange={(value) => setFormData((prev) => ({ ...prev, role: value }))} />
        <p id="add-role-help" className="text-xs text-muted-foreground">
          Controls what this person can see and do. See the Roles tab for details.
        </p>
      </div>
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
        />
        <BranchAccessNote
          id="add-branch-help"
          roleName={formData.role}
          branchHelp={
            !branchesLoading && branches.filter((b) => b.isActive).length === 0
              ? "No active branch yet. Add one under Branches first."
              : "Sales, stock and cash shifts this person records belong to this branch."
          }
        />
      </div>
      <div className="space-y-2">
        <Label htmlFor="add-password">
          Temporary password
          <RequiredMark />
        </Label>
        <div className="relative">
          <Input
            id="add-password"
            type={showPassword ? "text" : "password"}
            value={formData.password}
            onChange={(e) => setFormData((prev) => ({ ...prev, password: e.target.value }))}
            autoComplete="new-password"
            className="pr-10"
            aria-describedby="add-password-help"
            required
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
        <p id="add-password-help" className="text-xs text-muted-foreground">
          Share this with the user privately — they should change it after first sign-in.
        </p>
      </div>
      <div className="flex flex-col-reverse gap-2 pt-2 sm:flex-row sm:justify-end">
        <Button type="button" variant="outline" onClick={onSuccess}>
          Cancel
        </Button>
        <Button
          type="submit"
          loading={createUserMutation.isPending}
          loadingText="Adding user…"
          disabled={!formData.branchId || !formData.role}
        >
          <UserPlus aria-hidden />
          Add user
        </Button>
      </div>
    </form>
  )
}

function EditUserForm({
  user,
  onSave,
  onCancel,
  saving = false,
}: {
  user: User
  onSave: (updates: Partial<User>) => void
  onCancel: () => void
  saving?: boolean
}) {
  const { data: branches = [], isLoading: branchesLoading } = useBranches()
  const [formData, setFormData] = useState({
    full_name: user.full_name,
    role: user.role,
    phone: user.phone || "",
    branchId: user.branch_id ?? "",
  })
  const [setBranchId] = useState(() => (id: string) => setFormData((prev) => ({ ...prev, branchId: id })))
  useDefaultBranch(branches, formData.branchId, setBranchId)

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault()
    onSave({
      full_name: formData.full_name,
      role: formData.role,
      phone: formData.phone || null,
      // Only send a branch when it differs from what the user already works in.
      ...(formData.branchId && formData.branchId !== user.branch_id ? { branch_id: formData.branchId } : {}),
    })
  }

  return (
    <form onSubmit={handleSubmit} className="space-y-4">
      <div className="space-y-2">
        <Label htmlFor="edit-fullName">
          Full name
          <RequiredMark />
        </Label>
        <Input
          id="edit-fullName"
          value={formData.full_name}
          onChange={(e) => setFormData((prev) => ({ ...prev, full_name: e.target.value }))}
          required
        />
      </div>
      <div className="space-y-2">
        <Label htmlFor="edit-role">
          Role
          <RequiredMark />
        </Label>
        <RoleSelect id="edit-role" value={formData.role} onChange={(value) => setFormData((prev) => ({ ...prev, role: value }))} />
        <p id="edit-role-help" className="text-xs text-muted-foreground">
          Changing the role changes what this person can access on their next request.
        </p>
      </div>
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
          roleName={formData.role}
          branchHelp="New sales and stock movements by this person are recorded against this branch."
        />
      </div>
      <div className="space-y-2">
        <Label htmlFor="edit-phone">Phone</Label>
        <Input
          id="edit-phone"
          type="tel"
          value={formData.phone}
          onChange={(e) => setFormData((prev) => ({ ...prev, phone: e.target.value }))}
        />
      </div>
      <div className="flex flex-col-reverse gap-2 pt-2 sm:flex-row sm:justify-end">
        <Button type="button" variant="outline" onClick={onCancel}>
          Cancel
        </Button>
        <Button type="submit" loading={saving} loadingText="Saving…">
          Save changes
        </Button>
      </div>
    </form>
  )
}
