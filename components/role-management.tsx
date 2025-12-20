"use client"

import { useState } from "react"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Textarea } from "@/components/ui/textarea"
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { MoreHorizontal, Edit, Plus, Shield, CheckCircle2, XCircle } from "lucide-react"
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from "@/components/ui/dropdown-menu"
import { DataTable, Column } from "@/components/ui/data-table"
import { ConfirmDialog } from "@/components/ui/confirm-dialog"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { useToast } from "@/hooks/use-toast"
import { ROLE_PERMISSIONS, type Role, type Permission } from "@/lib/security/rbac-types"

interface RoleConfig {
  id: string
  name: Role
  displayName: string
  description: string
  permissions: Permission[]
  userCount?: number
}

const ROLE_DISPLAY_NAMES: Record<Role, string> = {
  admin: "Administrator",
  manager: "Manager",
  pharmacist: "Pharmacist",
  cashier: "Cashier",
  staff: "Staff",
}

const ROLE_DESCRIPTIONS: Record<Role, string> = {
  admin: "Full system access with all permissions",
  manager: "Management access with reporting and configuration",
  pharmacist: "Access to prescriptions, inventory, and customer management",
  cashier: "Access to sales and customer management",
  staff: "Read-only access to basic modules",
}

const ITEMS_PER_PAGE = 10

export default function RoleManagement() {
  const { toast } = useToast()
  const [searchTerm, setSearchTerm] = useState("")
  const [currentPage, setCurrentPage] = useState(1)
  const [editingRole, setEditingRole] = useState<Role | null>(null)
  const [isEditDialogOpen, setIsEditDialogOpen] = useState(false)
  const [isCreateRoleOpen, setIsCreateRoleOpen] = useState(false)
  const [customPermissions, setCustomPermissions] = useState<Partial<Record<Role, Permission[]>>>({})

  // Initialize roles from RBAC
  const roles: RoleConfig[] = (Object.keys(ROLE_PERMISSIONS) as Role[]).map((role) => ({
    id: role,
    name: role,
    displayName: ROLE_DISPLAY_NAMES[role],
    description: ROLE_DESCRIPTIONS[role],
    permissions: customPermissions[role] || ROLE_PERMISSIONS[role],
  }))

  const filteredRoles = roles.filter((role) =>
    role.displayName.toLowerCase().includes(searchTerm.toLowerCase()) ||
    role.description.toLowerCase().includes(searchTerm.toLowerCase())
  )

  const totalPages = Math.ceil(filteredRoles.length / ITEMS_PER_PAGE)
  const startIndex = (currentPage - 1) * ITEMS_PER_PAGE
  const paginatedRoles = filteredRoles.slice(startIndex, startIndex + ITEMS_PER_PAGE)

  const handlePageChange = (page: number) => {
    setCurrentPage(page)
  }

  const handleSearch = (value: string) => {
    setSearchTerm(value)
    setCurrentPage(1)
  }

  const getRoleBadge = (role: Role) => {
    switch (role) {
      case "admin":
        return { label: "Admin", variant: "default" as const }
      case "manager":
        return { label: "Manager", variant: "secondary" as const }
      case "pharmacist":
        return { label: "Pharmacist", variant: "outline" as const }
      case "cashier":
        return { label: "Cashier", variant: "outline" as const }
      case "staff":
        return { label: "Staff", variant: "secondary" as const }
      default:
        return { label: role, variant: "secondary" as const }
    }
  }

  const permissionGroups: Record<string, Permission[]> = {
    Inventory: ["inventory:read", "inventory:write", "inventory:delete"] as Permission[],
    Sales: ["sales:read", "sales:write", "sales:delete"] as Permission[],
    Prescriptions: ["prescriptions:read", "prescriptions:write", "prescriptions:delete"] as Permission[],
    Customers: ["customers:read", "customers:write", "customers:delete"] as Permission[],
    Suppliers: ["suppliers:read", "suppliers:write", "suppliers:delete"] as Permission[],
    Reports: ["reports:read"],
    Settings: ["settings:read", "settings:write"],
    Users: ["users:read", "users:write"],
  }

  // Define columns
  const columns: Column<RoleConfig>[] = [
    {
      key: "role",
      header: "Role",
      cell: (role) => {
        const roleBadge = getRoleBadge(role.name)
        return (
          <div className="flex items-center gap-2">
            <Shield className="h-4 w-4 text-primary" />
            <Badge variant={roleBadge.variant}>{roleBadge.label}</Badge>
          </div>
        )
      },
    },
    {
      key: "displayName",
      header: "Display Name",
      cell: (role) => <div className="font-medium">{role.displayName}</div>,
    },
    {
      key: "description",
      header: "Description",
      cell: (role) => <div className="text-muted-foreground max-w-md">{role.description}</div>,
    },
    {
      key: "permissions",
      header: "Permissions",
      cell: (role) => (
        <div className="flex flex-wrap gap-1">
          {Object.entries(permissionGroups).map(([group, perms]) => {
            const hasAny = perms.some((p) => role.permissions.includes(p as Permission))
            if (!hasAny) return null
            const count = perms.filter((p) => role.permissions.includes(p as Permission)).length
            return (
              <Badge key={group} variant="outline" className="text-xs">
                {group}: {count}
              </Badge>
            )
          })}
          <Badge variant="secondary" className="text-xs">
            Total: {role.permissions.length}
          </Badge>
        </div>
      ),
    },
    {
      key: "actions",
      header: "Actions",
      cell: (role) => (
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <Button variant="ghost" size="icon">
              <MoreHorizontal className="h-4 w-4" />
            </Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end">
            <DropdownMenuItem onClick={() => handleEditRole(role.name)}>
              <Edit className="h-4 w-4 mr-2" />
              Edit Permissions
            </DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>
      ),
    },
  ]

  const handleEditRole = (role: Role) => {
    setEditingRole(role)
    setIsEditDialogOpen(true)
  }

  const handleSaveRolePermissions = async (role: Role, permissions: Permission[]) => {
    try {
      // In a real implementation, you'd save this to a database
      // For now, we'll just update the local state
      setCustomPermissions((prev) => ({
        ...prev,
        [role]: permissions,
      }))

      toast({
        title: "Success",
        description: `Permissions for ${ROLE_DISPLAY_NAMES[role]} updated successfully`,
      })

      setIsEditDialogOpen(false)
      setEditingRole(null)
    } catch (error) {
      console.error("Error updating role permissions:", error)
      toast({
        title: "Error",
        description: "Failed to update role permissions",
        variant: "destructive",
      })
    }
  }

  const allPermissions: Permission[] = [
    "inventory:read",
    "inventory:write",
    "inventory:delete",
    "sales:read",
    "sales:write",
    "sales:delete",
    "prescriptions:read",
    "prescriptions:write",
    "prescriptions:delete",
    "customers:read",
    "customers:write",
    "customers:delete",
    "suppliers:read",
    "suppliers:write",
    "suppliers:delete",
    "reports:read",
    "settings:read",
    "settings:write",
    "users:read",
    "users:write",
  ]

  return (
    <div className="space-y-4">
      <Card>
        <CardHeader>
          <CardTitle>Roles & Permissions</CardTitle>
          <CardDescription>Manage role permissions and access levels</CardDescription>
        </CardHeader>
        <CardContent>
          <DataTable
            data={paginatedRoles}
            columns={columns}
            isLoading={false}
            error={null}
            emptyMessage="No roles found"
            searchPlaceholder="Search roles..."
            searchValue={searchTerm}
            onSearch={handleSearch}
            currentPage={currentPage}
            totalPages={totalPages}
            totalItems={filteredRoles.length}
            itemsPerPage={ITEMS_PER_PAGE}
            onPageChange={handlePageChange}
            actions={
              <Dialog open={isCreateRoleOpen} onOpenChange={setIsCreateRoleOpen}>
                <DialogTrigger asChild>
                  <Button>
                    <Plus className="h-4 w-4 mr-2" />
                    Create Custom Role
                  </Button>
                </DialogTrigger>
                <DialogContent className="max-w-2xl max-h-[80vh] overflow-y-auto">
                  <DialogHeader>
                    <DialogTitle>Create Custom Role</DialogTitle>
                    <DialogDescription>
                      Create a new role with custom permissions. Note: This requires database schema updates to fully support custom roles.
                    </DialogDescription>
                  </DialogHeader>
                  <CreateCustomRoleForm
                    onSuccess={() => {
                      setIsCreateRoleOpen(false)
                      toast({
                        title: "Success",
                        description: "Custom role created. Note: Database schema may need updates to use this role.",
                      })
                    }}
                    onCancel={() => setIsCreateRoleOpen(false)}
                  />
                </DialogContent>
              </Dialog>
            }
          />
        </CardContent>
      </Card>

      {/* Edit Role Permissions Dialog */}
      <Dialog open={isEditDialogOpen} onOpenChange={setIsEditDialogOpen}>
        <DialogContent className="max-w-2xl max-h-[80vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>
              Edit Permissions - {editingRole ? ROLE_DISPLAY_NAMES[editingRole] : ""}
            </DialogTitle>
            <DialogDescription>
              Configure permissions for this role. Changes will affect all users with this role.
            </DialogDescription>
          </DialogHeader>
          {editingRole && (
            <EditRolePermissionsForm
              role={editingRole}
              currentPermissions={customPermissions[editingRole] || ROLE_PERMISSIONS[editingRole]}
              onSave={(permissions) => handleSaveRolePermissions(editingRole, permissions)}
              onCancel={() => {
                setIsEditDialogOpen(false)
                setEditingRole(null)
              }}
            />
          )}
        </DialogContent>
      </Dialog>
    </div>
  )
}

function CreateCustomRoleForm({
  onSuccess,
  onCancel,
}: {
  onSuccess: () => void
  onCancel: () => void
}) {
  const [roleName, setRoleName] = useState("")
  const [roleDescription, setRoleDescription] = useState("")
  const [permissions, setPermissions] = useState<Permission[]>([])
  const [isLoading, setIsLoading] = useState(false)
  const { toast } = useToast()

  const permissionGroups: Record<string, Permission[]> = {
    Inventory: ["inventory:read", "inventory:write", "inventory:delete"] as Permission[],
    Sales: ["sales:read", "sales:write", "sales:delete"] as Permission[],
    Prescriptions: ["prescriptions:read", "prescriptions:write", "prescriptions:delete"] as Permission[],
    Customers: ["customers:read", "customers:write", "customers:delete"] as Permission[],
    Suppliers: ["suppliers:read", "suppliers:write", "suppliers:delete"] as Permission[],
    Reports: ["reports:read"],
    Settings: ["settings:read", "settings:write"],
    Users: ["users:read", "users:write"],
  }

  const togglePermission = (permission: Permission) => {
    setPermissions((prev) =>
      prev.includes(permission) ? prev.filter((p) => p !== permission) : [...prev, permission]
    )
  }

  const toggleGroup = (groupPermissions: Permission[]) => {
    const allSelected = groupPermissions.every((p) => permissions.includes(p))
    if (allSelected) {
      setPermissions((prev) => prev.filter((p) => !groupPermissions.includes(p as Permission)))
    } else {
      setPermissions((prev) => [...new Set([...prev, ...groupPermissions])])
    }
  }

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    
    if (!roleName.trim()) {
      toast({
        title: "Error",
        description: "Role name is required",
        variant: "destructive",
      })
      return
    }

    setIsLoading(true)
    try {
      // In a real implementation, you'd save this to a database
      // For now, we'll just show a success message
      // Note: The database schema would need to support custom roles
      // This is a placeholder for future implementation
      
      toast({
        title: "Note",
        description: "Custom role creation requires database schema updates. This feature is currently in development.",
      })
      
      onSuccess()
    } catch (error) {
      console.error("Error creating custom role:", error)
      toast({
        title: "Error",
        description: "Failed to create custom role",
        variant: "destructive",
      })
    } finally {
      setIsLoading(false)
    }
  }

  return (
    <form onSubmit={handleSubmit} className="space-y-6">
      <div className="space-y-4">
        <div>
          <Label htmlFor="role-name">Role Name *</Label>
          <Input
            id="role-name"
            value={roleName}
            onChange={(e) => setRoleName(e.target.value)}
            placeholder="e.g., Senior Pharmacist"
            required
          />
        </div>
        <div>
          <Label htmlFor="role-description">Description</Label>
          <Textarea
            id="role-description"
            value={roleDescription}
            onChange={(e) => setRoleDescription(e.target.value)}
            placeholder="Describe the role's responsibilities..."
            rows={3}
          />
        </div>
      </div>

      <div className="space-y-4">
        <Label>Permissions</Label>
        {Object.entries(permissionGroups).map(([group, groupPermissions]) => {
          const allSelected = groupPermissions.every((p) => permissions.includes(p as Permission))
          const someSelected = groupPermissions.some((p) => permissions.includes(p as Permission))

          return (
            <div key={group} className="border rounded-lg p-4 space-y-2">
              <div className="flex items-center justify-between">
                <Label className="text-sm font-semibold">{group}</Label>
                <Button
                  type="button"
                  variant="ghost"
                  size="sm"
                  onClick={() => toggleGroup(groupPermissions)}
                  className="text-xs"
                >
                  {allSelected ? "Deselect All" : "Select All"}
                </Button>
              </div>
              <div className="grid grid-cols-3 gap-2">
                {groupPermissions.map((permission) => {
                  const [module, action] = permission.split(":")
                  const isSelected = permissions.includes(permission)
                  return (
                    <div
                      key={permission}
                      className={`flex items-center gap-2 p-2 rounded border cursor-pointer transition-colors ${
                        isSelected ? "bg-primary/10 border-primary" : "bg-muted/50 border-border"
                      }`}
                      onClick={() => togglePermission(permission)}
                    >
                      {isSelected ? (
                        <CheckCircle2 className="h-4 w-4 text-primary" />
                      ) : (
                        <XCircle className="h-4 w-4 text-muted-foreground" />
                      )}
                      <span className="text-xs capitalize">{action}</span>
                    </div>
                  )
                })}
              </div>
            </div>
          )
        })}
      </div>

      <div className="flex justify-end gap-2 pt-4 border-t">
        <Button type="button" variant="outline" onClick={onCancel} disabled={isLoading}>
          Cancel
        </Button>
        <Button type="submit" disabled={isLoading}>
          {isLoading ? "Creating..." : "Create Role"}
        </Button>
      </div>
    </form>
  )
}

function EditRolePermissionsForm({
  role,
  currentPermissions,
  onSave,
  onCancel,
}: {
  role: Role
  currentPermissions: Permission[]
  onSave: (permissions: Permission[]) => void
  onCancel: () => void
}) {
  const [permissions, setPermissions] = useState<Permission[]>(currentPermissions)

  const permissionGroups: Record<string, Permission[]> = {
    Inventory: ["inventory:read", "inventory:write", "inventory:delete"] as Permission[],
    Sales: ["sales:read", "sales:write", "sales:delete"] as Permission[],
    Prescriptions: ["prescriptions:read", "prescriptions:write", "prescriptions:delete"] as Permission[],
    Customers: ["customers:read", "customers:write", "customers:delete"] as Permission[],
    Suppliers: ["suppliers:read", "suppliers:write", "suppliers:delete"] as Permission[],
    Reports: ["reports:read"],
    Settings: ["settings:read", "settings:write"],
    Users: ["users:read", "users:write"],
  }

  const togglePermission = (permission: Permission) => {
    setPermissions((prev) =>
      prev.includes(permission) ? prev.filter((p) => p !== permission) : [...prev, permission]
    )
  }

  const toggleGroup = (groupPermissions: Permission[]) => {
    const allSelected = groupPermissions.every((p) => permissions.includes(p))
    if (allSelected) {
      setPermissions((prev) => prev.filter((p) => !groupPermissions.includes(p as Permission)))
    } else {
      setPermissions((prev) => [...new Set([...prev, ...groupPermissions])])
    }
  }

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault()
    onSave(permissions)
  }

  return (
    <form onSubmit={handleSubmit} className="space-y-6">
      <div className="space-y-4">
        {Object.entries(permissionGroups).map(([group, groupPermissions]) => {
          const allSelected = groupPermissions.every((p) => permissions.includes(p as Permission))
          const someSelected = groupPermissions.some((p) => permissions.includes(p as Permission))

          return (
            <div key={group} className="border rounded-lg p-4 space-y-2">
              <div className="flex items-center justify-between">
                <Label className="text-sm font-semibold">{group}</Label>
                <Button
                  type="button"
                  variant="ghost"
                  size="sm"
                  onClick={() => toggleGroup(groupPermissions)}
                  className="text-xs"
                >
                  {allSelected ? "Deselect All" : "Select All"}
                </Button>
              </div>
              <div className="grid grid-cols-3 gap-2">
                {groupPermissions.map((permission) => {
                  const [module, action] = permission.split(":")
                  const isSelected = permissions.includes(permission)
                  return (
                    <div
                      key={permission}
                      className={`flex items-center gap-2 p-2 rounded border cursor-pointer transition-colors ${
                        isSelected ? "bg-primary/10 border-primary" : "bg-muted/50 border-border"
                      }`}
                      onClick={() => togglePermission(permission)}
                    >
                      {isSelected ? (
                        <CheckCircle2 className="h-4 w-4 text-primary" />
                      ) : (
                        <XCircle className="h-4 w-4 text-muted-foreground" />
                      )}
                      <span className="text-xs capitalize">{action}</span>
                    </div>
                  )
                })}
              </div>
            </div>
          )
        })}
      </div>

      <div className="flex justify-end gap-2 pt-4 border-t">
        <Button type="button" variant="outline" onClick={onCancel}>
          Cancel
        </Button>
        <Button type="submit">Save Permissions</Button>
      </div>
    </form>
  )
}

