/**
 * Role-Based Access Control (RBAC)
 * Enhanced RBAC with granular permissions
 * Server-side functions for permission checking
 */

import { createClient } from "@/lib/supabase/server"
import { ROLE_PERMISSIONS, type Role, type Permission } from "./rbac-types"

// Re-export types and constants for backward compatibility
export type { Role, Permission }
export { ROLE_PERMISSIONS }

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

