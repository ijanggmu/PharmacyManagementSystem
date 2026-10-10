/**
 * Permission decisions for the .NET auth path. Pure functions only, so they can be unit tested
 * without a session, cookies or a backend.
 *
 * Source of truth on the .NET side:
 * - Permission names are built by FshPermission.NameFor(action, resource) in
 *   src/BuildingBlocks/Shared/Identity/PermissionConstants.cs as
 *   "Permissions.{resource}.{action}". Resource and action strings come from the *Permissions.cs
 *   files under src/Modules (the Modules.X.Contracts/Authorization folders).
 * - Claim written into the access token: type "permission" (ClaimConstants.Permission), one claim
 *   per permission name. The JWT reader (dotnet-session.ts sessionUserFromClaims) reads it.
 * - Root: permissions flagged IsRoot: true. RolePermissionSyncer only grants them to the root
 *   tenant's Admin role, and RoleService strips them for other tenants.
 */

import type { Permission } from "@/lib/security/rbac-types"

/** Every .NET permission flagged IsRoot: true (SystemPermissions.Platform.* and the root Tenants/AuditTrails set). */
export const DOTNET_ROOT_PERMISSIONS: readonly string[] = [
  "Permissions.Platform.Tenants.View",
  "Permissions.Platform.Tenants.Create",
  "Permissions.Platform.Tenants.Update",
  "Permissions.Platform.Tenants.Suspend",
  "Permissions.Platform.Tenants.Delete",
  "Permissions.Platform.Plans.Manage",
  "Permissions.Platform.Subscriptions.Manage",
  "Permissions.Platform.Invoices.Admin",
  "Permissions.Platform.Webhooks.Admin",
  "Permissions.Platform.Audits.ViewAll",
  "Permissions.Platform.Users.Impersonate",
  "Permissions.AuditTrails.ViewCrossTenant",
  "Permissions.Tickets.ViewCrossTenant",
  "Permissions.Tenants.View",
  "Permissions.Tenants.Create",
  "Permissions.Tenants.Update",
  "Permissions.Tenants.UpgradeSubscription",
]

/**
 * Legacy permission name (lib/security/rbac-types.ts) to the .NET permission names that grant it.
 * Semantics: the user needs at least ONE of the listed names. `null` means no .NET equivalent,
 * which always denies (fail closed).
 *
 * How it was derived:
 * - Read verbs: legacy `x:read` maps to the module's `View` permission.
 * - Write verbs: legacy `x:write` maps to the create/update verbs of the same resource (any one of them).
 * - Delete verbs: legacy `x:delete` maps to `Delete`, or to `Cancel` for sales and prescriptions,
 *   where the backend has no Delete permission and cancelling is the removal action.
 * - Bundles: where one legacy name covers several backend resources, all are listed (any-of).
 * - Resource names come from the *Permissions.cs `Resource` constants (for example "Sales.Sales",
 *   "Inventory.Medicines", "Users", "Reference.Settings", "Tenants").
 *
 * Mapping approximations to review:
 * - reports:read, accounting:read and accounting:write are bundles of several backend reports or verbs.
 * - settings:* maps to Reference.Settings (pharmacy settings), the closest backend resource.
 */
export const DOTNET_PERMISSION_MAP: Record<Permission, readonly string[] | null> = {
  "inventory:read": ["Permissions.Inventory.Medicines.View"],
  "inventory:write": ["Permissions.Inventory.Medicines.Create", "Permissions.Inventory.Medicines.Update"],
  "inventory:delete": ["Permissions.Inventory.Medicines.Delete"],

  "sales:read": ["Permissions.Sales.Sales.View"],
  "sales:write": ["Permissions.Sales.Sales.Create"],
  "sales:delete": ["Permissions.Sales.Sales.Cancel"],

  "prescriptions:read": ["Permissions.Prescriptions.Prescriptions.View"],
  "prescriptions:write": ["Permissions.Prescriptions.Prescriptions.Create"],
  "prescriptions:delete": ["Permissions.Prescriptions.Prescriptions.Cancel"],

  "customers:read": ["Permissions.Customers.Customers.View"],
  "customers:write": ["Permissions.Customers.Customers.Create", "Permissions.Customers.Customers.Update"],
  "customers:delete": ["Permissions.Customers.Customers.Delete"],

  "suppliers:read": ["Permissions.Suppliers.Suppliers.View"],
  "suppliers:write": ["Permissions.Suppliers.Suppliers.Create", "Permissions.Suppliers.Suppliers.Update"],
  "suppliers:delete": ["Permissions.Suppliers.Suppliers.Delete"],

  "reports:read": [
    "Permissions.Inventory.Reports.View",
    "Permissions.Sales.Reports.View",
    "Permissions.Prescriptions.Reports.View",
    "Permissions.Accounting.Reports.View",
  ],
  "accounting:read": ["Permissions.Accounting.Vouchers.View", "Permissions.Accounting.Reports.View"],
  "accounting:write": ["Permissions.Accounting.Vouchers.Create", "Permissions.Accounting.Expenses.Record"],

  "settings:read": ["Permissions.Reference.Settings.View"],
  "settings:write": ["Permissions.Reference.Settings.Update"],

  "users:read": ["Permissions.Users.View"],
  "users:write": ["Permissions.Users.Create", "Permissions.Users.Update"],
  "users:delete": ["Permissions.Users.Delete"],

  "tenants:read": ["Permissions.Tenants.View"],
  "tenants:write": ["Permissions.Tenants.Create", "Permissions.Tenants.Update"],

  // No backend equivalent: Prescriptions.DispensingSafety.Override is a different control (overriding
  // a safety warning), not authority to dispense controlled substances. Denies until the backend adds one.
  "controlled_substances:dispense": null,
}

/** Legacy names that have no .NET equivalent. These always deny on the .NET path. */
export const DOTNET_UNMAPPED_LEGACY_PERMISSIONS: readonly Permission[] = (
  Object.keys(DOTNET_PERMISSION_MAP) as Permission[]
).filter((name) => DOTNET_PERMISSION_MAP[name] === null)

/**
 * Root check using the backend rule: the user holds every IsRoot permission. Only the root
 * tenant's Admin role holds the full set, so partial grants do not count as root.
 */
export function isDotnetRootUser(granted: readonly string[]): boolean {
  const held = new Set(granted)
  return DOTNET_ROOT_PERMISSIONS.every((name) => held.has(name))
}

/**
 * MultitenancyPermissions.Branches.ViewAll: holders see every branch's records. Without it the API
 * scopes lists to the caller's own branch and rejects requests naming another branch.
 */
export const BRANCHES_VIEW_ALL_PERMISSION = "Permissions.Branches.ViewAll"

/** Whether the caller may view (and filter by) any branch. Root users always may. */
export function canViewAllBranches(granted: readonly string[]): boolean {
  return isDotnetRootUser(granted) || granted.includes(BRANCHES_VIEW_ALL_PERMISSION)
}

/**
 * Decides a legacy permission check from the .NET permission claims of the current token.
 * Returns false for unknown legacy names, for names with no .NET equivalent, and when no grant matches.
 */
export function dotnetPermissionAllowed(legacyPermission: string, granted: readonly string[]): boolean {
  if (isDotnetRootUser(granted)) return true

  if (!Object.prototype.hasOwnProperty.call(DOTNET_PERMISSION_MAP, legacyPermission)) return false
  const required = DOTNET_PERMISSION_MAP[legacyPermission as Permission]
  if (!required || required.length === 0) return false

  const held = new Set(granted)
  return required.some((name) => held.has(name))
}
