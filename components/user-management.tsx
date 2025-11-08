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
} from "@/components/ui/dialog"
import { MoreHorizontal, Edit, Trash2, Plus } from "lucide-react"
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from "@/components/ui/dropdown-menu"
import { DataTable, Column } from "@/components/ui/data-table"
import { ConfirmDialog } from "@/components/ui/confirm-dialog"
import { useUsers, useCreateUser, useUpdateUser, useDeleteUser } from "@/lib/hooks/use-users"
import { useToast } from "@/hooks/use-toast"

interface User {
  id: string
  email: string
  full_name: string
  role: string
  phone: string | null
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
  const [isDeleteDialogOpen, setIsDeleteDialogOpen] = useState(false)
  const [userToDelete, setUserToDelete] = useState<string | null>(null)

  // Use TanStack Query to fetch users
  const { data: usersResponse, isLoading, error } = useUsers({
    search: searchTerm || undefined,
    page: currentPage,
    limit: ITEMS_PER_PAGE,
  })
  const createUserMutation = useCreateUser()
  const updateUserMutation = useUpdateUser()
  const deleteUserMutation = useDeleteUser()

  const users = usersResponse?.data || []
  const usersError = usersResponse?.error

  const totalPages = Math.ceil(users.length / ITEMS_PER_PAGE)
  const startIndex = (currentPage - 1) * ITEMS_PER_PAGE

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
      await updateUserMutation.mutateAsync({ id: userId, ...updates })
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

  const handleDeleteUser = async (userId: string) => {
    setUserToDelete(userId)
    setIsDeleteDialogOpen(true)
  }

  const handleConfirmDelete = async () => {
    if (!userToDelete) return

    // Store the user ID before clearing state
    const userId = userToDelete

    // Close dialog immediately to prevent UI freezing
    setIsDeleteDialogOpen(false)
    setUserToDelete(null)

    try {
      await deleteUserMutation.mutateAsync(userId)
      toast({
        title: "Success",
        description: "User deleted successfully",
      })
    } catch (error) {
      console.error("Error deleting user:", error)
      toast({
        title: "Error",
        description: "Failed to delete user",
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
      cell: (user) => <div className="font-medium">{user.full_name}</div>,
    },
    {
      key: "email",
      header: "Email",
      cell: (user) => <div>{user.email}</div>,
    },
    {
      key: "role",
      header: "Role",
      cell: (user) => {
        const roleBadge = getRoleBadge(user.role)
        return <Badge variant={roleBadge.variant}>{roleBadge.label}</Badge>
      },
    },
    {
      key: "phone",
      header: "Phone",
      cell: (user) => <div>{user.phone || "N/A"}</div>,
    },
    {
      key: "joined",
      header: "Joined",
      cell: (user) => <div>{new Date(user.created_at).toLocaleDateString()}</div>,
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
            <DropdownMenuItem className="text-red-600" onClick={() => handleDeleteUser(user.id)}>
              <Trash2 className="h-4 w-4 mr-2" />
              Delete User
            </DropdownMenuItem>
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
        actions={
          <Dialog open={isAddDialogOpen} onOpenChange={setIsAddDialogOpen}>
            <DialogTrigger asChild>
              <Button>
                <Plus className="h-4 w-4 mr-2" />
                Add User
              </Button>
            </DialogTrigger>
            <DialogContent>
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
        <DialogContent>
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

      {/* Delete Confirmation Dialog */}
      <ConfirmDialog
        isOpen={isDeleteDialogOpen}
        onClose={() => {
          setIsDeleteDialogOpen(false)
          setUserToDelete(null)
        }}
        onConfirm={handleConfirmDelete}
        title="Delete User"
        description="Are you sure you want to delete this user? This action cannot be undone."
        confirmText="Delete"
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
  })

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()

    try {
      await createUserMutation.mutateAsync({
        email: formData.email,
        full_name: formData.fullName,
        role: formData.role,
        phone: formData.phone || null,
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
