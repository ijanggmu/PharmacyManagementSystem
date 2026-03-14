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
  | "settings:read"
  | "settings:write"
  | "users:read"
  | "users:write"
  | "users:delete"
  | "tenants:read"
  | "tenants:write"

export type Role = "admin" | "pharmacist" | "cashier" | "manager" | "staff" | "superadmin"

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

