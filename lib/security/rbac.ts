/**
 * Role-Based Access Control (RBAC)
 * Enhanced RBAC with granular permissions
 */

import { createClient } from "@/lib/supabase/server"

export type Permission =
  | "inventory:read"
  | "inventory:write"
  | "inventory:delete"
  | "sales:read"
  | "sales:write"
  | "sales:delete"
  | "prescriptions:read"
  | "prescriptions:write"
  | "prescriptions:delete"
  | "customers:read"
  | "customers:write"
  | "customers:delete"
  | "suppliers:read"
  | "suppliers:write"
  | "suppliers:delete"
  | "reports:read"
  | "settings:read"
  | "settings:write"
  | "users:read"
  | "users:write"
  | "users:delete"

export type Role = "admin" | "pharmacist" | "cashier" | "manager" | "staff"

export const ROLE_PERMISSIONS: Record<Role, Permission[]> = {
  admin: [
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
    "users:delete",
  ],
  manager: [
    "inventory:read",
    "inventory:write",
    "sales:read",
    "sales:write",
    "prescriptions:read",
    "prescriptions:write",
    "customers:read",
    "customers:write",
    "suppliers:read",
    "suppliers:write",
    "reports:read",
    "settings:read",
  ],
  pharmacist: [
    "inventory:read",
    "prescriptions:read",
    "prescriptions:write",
    "customers:read",
    "customers:write",
    "reports:read",
  ],
  cashier: [
    "inventory:read",
    "sales:read",
    "sales:write",
    "customers:read",
    "customers:write",
  ],
  staff: [
    "inventory:read",
    "sales:read",
    "customers:read",
  ],
}

export async function hasPermission(
  permission: Permission,
  userId?: string
): Promise<boolean> {
  try {
    const supabase = await createClient()
    const {
      data: { user },
    } = await supabase.auth.getUser()

    const targetUserId = userId || user?.id
    if (!targetUserId) {
      return false
    }

    // Get user role from database (assuming users table has role column)
    const { data: userData } = await supabase
      .from("users")
      .select("role")
      .eq("id", targetUserId)
      .single()

    if (!userData?.role) {
      return false
    }

    const role = userData.role as Role
    const permissions = ROLE_PERMISSIONS[role] || []

    return permissions.includes(permission)
  } catch (error) {
    console.error("Permission check failed:", error)
    return false
  }
}

export async function requirePermission(permission: Permission) {
  const hasAccess = await hasPermission(permission)
  if (!hasAccess) {
    throw new Error("Insufficient permissions")
  }
}

