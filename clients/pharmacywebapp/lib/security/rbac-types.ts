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
  /** Expiry claims to suppliers: reading them, and drafting / answering them (accepting raises a debit note). */
  | "expiry_claims:read"
  | "expiry_claims:write"
  /** Writing off (disposing) a batch, and recalling one, on the expiry screens. */
  | "batches:dispose"
  | "batches:recall"
  /** Inventory reports only (stock movements, expiring / expired lots) — narrower than the reports:read bundle. */
  | "inventory_reports:read"
  /** Gates completing a sale that contains a controlled_substance medicine —
   *  distinct from ordinary sales:write so a cashier can't dispense a narcotic
   *  without a pharmacist/manager/admin account completing the checkout. */
  | "controlled_substances:dispense"

/** Display roles. The backend seeds Manager, Pharmacist, Cashier, Staff and Accountant (PharmacyRoleSeedData.cs)
 *  on top of Admin; "superadmin" is the dashboard's name for the root-tenant Admin. Access is never decided
 *  by role here — it comes from the session's .NET permission claims via lib/api/dotnet-permissions.ts. */
export type Role = "admin" | "pharmacist" | "cashier" | "manager" | "accountant" | "staff" | "superadmin"

