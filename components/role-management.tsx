"use client"

import { useState } from "react"
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table"
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
import { MoreHorizontal, Edit, Trash2, Plus, Search, Shield, CheckCircle2, XCircle } from "lucide-react"
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from "@/components/ui/dropdown-menu"
import { ConfirmDialog } from "@/components/ui/confirm-dialog"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { createClient } from "@/lib/supabase/client"
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

export default function RoleManagement() {
  const { toast } = useToast()
  const [searchTerm, setSearchTerm] = useState("")
  const [editingRole, setEditingRole] = useState<Role | null>(null)
  const [isEditDialogOpen, setIsEditDialogOpen] = useState(false)
  const [customPermissions, setCustomPermissions] = useState<Record<Role, Permission[]>>({})

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

  const permissionGroups = {
    Inventory: ["inventory:read", "inventory:write", "inventory:delete"],
    Sales: ["sales:read", "sales:write", "sales:delete"],
    Prescriptions: ["prescriptions:read", "prescriptions:write", "prescriptions:delete"],
    Customers: ["customers:read", "customers:write", "customers:delete"],
    Suppliers: ["suppliers:read", "suppliers:write", "suppliers:delete"],
    Reports: ["reports:read"],
    Settings: ["settings:read", "settings:write"],
    Users: ["users:read", "users:write"],
  }

  return (
    <div className="space-y-4">
      {/* Search */}
      <div className="flex items-center justify-between gap-4">
        <div className="relative flex-1">
          <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 h-4 w-4 text-muted-foreground" />
          <Input
            placeholder="Search roles..."
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
            className="pl-10"
          />
        </div>
      </div>

      {/* Roles Grid */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
        {filteredRoles.map((role) => {
          const roleBadge = getRoleBadge(role.name)
          return (
            <Card key={role.id} className="relative">
              <CardHeader>
                <div className="flex items-start justify-between">
                  <div className="flex-1">
                    <div className="flex items-center gap-2 mb-2">
                      <Shield className="h-5 w-5 text-primary" />
                      <CardTitle className="text-lg">{role.displayName}</CardTitle>
                    </div>
                    <Badge variant={roleBadge.variant} className="mb-2">
                      {roleBadge.label}
                    </Badge>
                    <CardDescription className="mt-2">{role.description}</CardDescription>
                  </div>
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
                </div>
              </CardHeader>
              <CardContent>
                <div className="space-y-3">
                  <div>
                    <p className="text-sm font-medium mb-2">Permissions ({role.permissions.length})</p>
                    <div className="space-y-1">
                      {Object.entries(permissionGroups).map(([group, perms]) => {
                        const hasAny = perms.some((p) => role.permissions.includes(p))
                        if (!hasAny) return null
                        return (
                          <div key={group} className="text-xs text-muted-foreground">
                            <span className="font-medium">{group}:</span>{" "}
                            {perms
                              .filter((p) => role.permissions.includes(p))
                              .map((p) => p.split(":")[1])
                              .join(", ")}
                          </div>
                        )
                      })}
                    </div>
                  </div>
                </div>
              </CardContent>
            </Card>
          )
        })}
      </div>

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

  const permissionGroups = {
    Inventory: ["inventory:read", "inventory:write", "inventory:delete"],
    Sales: ["sales:read", "sales:write", "sales:delete"],
    Prescriptions: ["prescriptions:read", "prescriptions:write", "prescriptions:delete"],
    Customers: ["customers:read", "customers:write", "customers:delete"],
    Suppliers: ["suppliers:read", "suppliers:write", "suppliers:delete"],
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
      setPermissions((prev) => prev.filter((p) => !groupPermissions.includes(p)))
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
          const allSelected = groupPermissions.every((p) => permissions.includes(p))
          const someSelected = groupPermissions.some((p) => permissions.includes(p))

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

