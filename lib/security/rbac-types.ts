/**
 * Role-Based Access Control (RBAC) Types and Constants
 * Client-safe types and constants that can be used in both client and server components
 */

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
  | "accounting:read"
  | "accounting:write"
  | "settings:read"
  | "settings:write"
  | "users:read"
  | "users:write"
  | "users:delete"
  | "tenants:read"
  | "tenants:write"
  /** Gates completing a sale that contains a controlled_substance medicine —
   *  distinct from ordinary sales:write so a cashier can't dispense a narcotic
   *  without a pharmacist/manager/admin account completing the checkout. */
  | "controlled_substances:dispense"

export type Role = "admin" | "pharmacist" | "cashier" | "manager" | "staff" | "superadmin"

/**
 * Roles that can be assigned to a user *within* a tenant (via invite, or role edit).
 * Deliberately excludes "superadmin" — that is a platform-level role and must never
 * be settable through tenant-scoped user management endpoints.
 */
export const TENANT_ROLES = ["admin", "pharmacist", "cashier", "manager", "staff"] as const
export type TenantRole = (typeof TENANT_ROLES)[number]

export const ROLE_PERMISSIONS: Record<Role, Permission[]> = {
  superadmin: [
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
    "accounting:read",
    "accounting:write",
    "settings:read",
    "settings:write",
    "users:read",
    "users:write",
    "users:delete",
    "tenants:read",
    "tenants:write",
  ],
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
    "accounting:read",
    "accounting:write",
    "settings:read",
    "settings:write",
    "users:read",
    "users:write",
    "users:delete",
    "controlled_substances:dispense",
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
    "accounting:read",
    "accounting:write",
    "settings:read",
    "controlled_substances:dispense",
  ],
  pharmacist: [
    "inventory:read",
    "prescriptions:read",
    "prescriptions:write",
    "customers:read",
    "customers:write",
    "reports:read",
    "controlled_substances:dispense",
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

