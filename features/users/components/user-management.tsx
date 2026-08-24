"use client"

import type React from "react"

import { useState } from "react"
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
import { MoreHorizontal, Edit, UserX, UserCheck, Plus, UserPlus } from "lucide-react"
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from "@/components/ui/dropdown-menu"
import { DataTable, Column } from "@/components/ui/data-table"
import { ConfirmDialog } from "@/components/ui/confirm-dialog"
import { useUsers, useCreateUser, useUpdateUser } from "@/features/users/hooks/use-users"
import { useToast } from "@/hooks/use-toast"

interface User {
  id: string
  email: string
  full_name: string
  role: string
  phone: string | null
  is_active?: boolean
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

  // Use TanStack Query to fetch users
  const { data: usersResponse, isLoading, error } = useUsers({
    search: searchTerm || undefined,
    page: currentPage,
    limit: ITEMS_PER_PAGE,
  })
  const createUserMutation = useCreateUser()
  const updateUserMutation = useUpdateUser()

  const users = usersResponse?.data || []
  const usersError = usersResponse?.error

  const totalPages = Math.max(1, Math.ceil(users.length / ITEMS_PER_PAGE))

  const handlePageChange = (page: number) => {
    setCurrentPage(page)
  }

  const getRoleBadge = (role: string) => {
    switch (role) {
      case "admin":
        return { label: "Admin", variant: "default" as const }
      case "pharmacist":
        return { label: "Pharmacist", variant: "secondary" as const }
      case "cashier":
        return { label: "Cashier", variant: "outline" as const }
      default:
        return { label: role, variant: "secondary" as const }
    }
  }

  const handleUpdateUser = async (userId: string, updates: Partial<User>) => {
    try {
      await updateUserMutation.mutateAsync({ id: userId, updates })
      toast({
        title: "Success",
        description: "User updated successfully",
      })
      setIsEditDialogOpen(false)
      setEditingUser(null)
    } catch (error) {
      console.error("Error updating user:", error)
      toast({
        title: "Error",
        description: "Failed to update user",
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

  const handleSearch = (value: string) => {
    setSearchTerm(value)
    setCurrentPage(1)
  }

  // Define columns
  const columns: Column<User>[] = [
    {
      key: "user",
      header: "User",
      cell: (user) => <div className="font-medium">{user.full_name}</div>,
      exportValue: (user) => user.full_name,
    },
    {
      key: "email",
      header: "Email",
      cell: (user) => <div>{user.email}</div>,
      exportValue: (user) => user.email,
    },
    {
      key: "role",
      header: "Role",
      cell: (user) => {
        const roleBadge = getRoleBadge(user.role)
        return <Badge variant={roleBadge.variant}>{roleBadge.label}</Badge>
      },
      exportValue: (user) => getRoleBadge(user.role).label,
    },
    {
      key: "phone",
      header: "Phone",
      cell: (user) => <div>{user.phone || "N/A"}</div>,
      exportValue: (user) => user.phone || "",
    },
    {
      key: "status",
      header: "Status",
      cell: (user) =>
        user.is_active === false ? (
          <Badge variant="destructive">Inactive</Badge>
        ) : (
          <Badge variant="outline">Active</Badge>
        ),
      exportValue: (user) => (user.is_active === false ? "Inactive" : "Active"),
    },
    {
      key: "joined",
      header: "Joined",
      cell: (user) => <div>{new Date(user.created_at).toLocaleDateString()}</div>,
      exportValue: (user) => new Date(user.created_at).toLocaleDateString(),
    },
    {
      key: "actions",
      header: "",
      className: "w-[50px]",
      cell: (user) => (
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <Button variant="ghost" size="icon">
              <MoreHorizontal className="h-4 w-4" />
            </Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end">
            <DropdownMenuItem
              onClick={() => {
                setEditingUser(user)
                setIsEditDialogOpen(true)
              }}
            >
              <Edit className="h-4 w-4 mr-2" />
              Edit User
            </DropdownMenuItem>
            {user.is_active === false ? (
              <DropdownMenuItem onClick={() => handleActivateUser(user)}>
                <UserCheck className="h-4 w-4 mr-2" />
                Activate User
              </DropdownMenuItem>
            ) : (
              <DropdownMenuItem className="text-red-600" onClick={() => handleDeactivateUser(user)}>
                <UserX className="h-4 w-4 mr-2" />
                Deactivate User
              </DropdownMenuItem>
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
        emptyMessage="No users found"
        searchPlaceholder="Search users..."
        searchValue={searchTerm}
        onSearch={handleSearch}
        currentPage={currentPage}
        totalPages={totalPages}
        totalItems={users.length}
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
                <Plus className="h-4 w-4 mr-2" />
                Add User
              </Button>
            </DialogTrigger>
            <DialogContent className={DIALOG_CONTENT_DETAIL_CLASS}>
              <DialogHeader>
                <DialogTitle>Add New User</DialogTitle>
                <DialogDescription>Create a new user account for the pharmacy system</DialogDescription>
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
            <DialogTitle>Edit User</DialogTitle>
            <DialogDescription>Update user information and role</DialogDescription>
          </DialogHeader>
          {editingUser && (
            <EditUserForm
              user={editingUser}
              onSave={(updates) => handleUpdateUser(editingUser.id, updates)}
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
        title="Deactivate User"
        description={`Deactivate ${userToToggle?.full_name || "this user"}? They will immediately lose access, but their sales and dispensing history stay attributed to them. You can reactivate them later.`}
        confirmText="Deactivate"
        cancelText="Cancel"
        variant="destructive"
      />
    </div>
  )
}

function AddUserForm({ onSuccess, onUserAdded }: { onSuccess: () => void; onUserAdded: () => void }) {
  const createUserMutation = useCreateUser()
  const [formData, setFormData] = useState({
    email: "",
    fullName: "",
    role: "cashier",
    phone: "",
    password: "",
  })

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()

    try {
      await createUserMutation.mutateAsync({
        email: formData.email,
        full_name: formData.fullName,
        role: formData.role,
        phone: formData.phone || null,
        password: formData.password,
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
        <Label htmlFor="fullName">Full Name</Label>
        <Input
          id="fullName"
          value={formData.fullName}
          onChange={(e) => setFormData((prev) => ({ ...prev, fullName: e.target.value }))}
          required
        />
      </div>
      <div className="space-y-2">
        <Label htmlFor="email">Email</Label>
        <Input
          id="email"
          type="email"
          value={formData.email}
          onChange={(e) => setFormData((prev) => ({ ...prev, email: e.target.value }))}
          required
        />
      </div>
      <div className="space-y-2">
        <Label htmlFor="role">Role</Label>
        <Select value={formData.role} onValueChange={(value) => setFormData((prev) => ({ ...prev, role: value }))}>
          <SelectTrigger>
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="admin">Administrator</SelectItem>
            <SelectItem value="manager">Manager</SelectItem>
            <SelectItem value="pharmacist">Pharmacist</SelectItem>
            <SelectItem value="cashier">Cashier</SelectItem>
            <SelectItem value="staff">Staff</SelectItem>
          </SelectContent>
        </Select>
      </div>
      <div className="space-y-2">
        <Label htmlFor="phone">Phone</Label>
        <Input
          id="phone"
          value={formData.phone}
          onChange={(e) => setFormData((prev) => ({ ...prev, phone: e.target.value }))}
        />
      </div>
      <div className="space-y-2">
        <Label htmlFor="password">Temporary Password</Label>
        <Input
          id="password"
          type="password"
          value={formData.password}
          onChange={(e) => setFormData((prev) => ({ ...prev, password: e.target.value }))}
          required
        />
      </div>
      <div className="flex gap-2">
        <Button type="submit" className="flex-1">
          <UserPlus className="h-4 w-4 mr-2" />
          Add User
        </Button>
        <Button type="button" variant="outline" onClick={onSuccess}>
          Cancel
        </Button>
      </div>
    </form>
  )
}

function EditUserForm({
  user,
  onSave,
  onCancel,
}: {
  user: User
  onSave: (updates: Partial<User>) => void
  onCancel: () => void
}) {
  const [formData, setFormData] = useState({
    full_name: user.full_name,
    role: user.role,
    phone: user.phone || "",
  })

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault()
    onSave({
      full_name: formData.full_name,
      role: formData.role,
      phone: formData.phone || null,
    })
  }

  return (
    <form onSubmit={handleSubmit} className="space-y-4">
      <div className="space-y-2">
        <Label htmlFor="fullName">Full Name</Label>
        <Input
          id="fullName"
          value={formData.full_name}
          onChange={(e) => setFormData((prev) => ({ ...prev, full_name: e.target.value }))}
          required
        />
      </div>
      <div className="space-y-2">
        <Label htmlFor="role">Role</Label>
        <Select value={formData.role} onValueChange={(value) => setFormData((prev) => ({ ...prev, role: value }))}>
          <SelectTrigger>
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="admin">Administrator</SelectItem>
            <SelectItem value="manager">Manager</SelectItem>
            <SelectItem value="pharmacist">Pharmacist</SelectItem>
            <SelectItem value="cashier">Cashier</SelectItem>
            <SelectItem value="staff">Staff</SelectItem>
          </SelectContent>
        </Select>
      </div>
      <div className="space-y-2">
        <Label htmlFor="phone">Phone</Label>
        <Input
          id="phone"
          value={formData.phone}
          onChange={(e) => setFormData((prev) => ({ ...prev, phone: e.target.value }))}
        />
      </div>
      <div className="flex gap-2">
        <Button type="submit" className="flex-1">
          Save Changes
        </Button>
        <Button type="button" variant="outline" onClick={onCancel}>
          Cancel
        </Button>
      </div>
    </form>
  )
}
