import { isDotnetRootUser } from "@/lib/api/dotnet-permissions"

/**
 * CustomersPermissions.Credit.Manage (src/Modules/Customers/.../CustomersPermissions.cs): setting or removing a
 * customer's credit limit. Declared on the Customers.Ledger resource so it travels in the token allowlist.
 */
export const CUSTOMER_CREDIT_MANAGE_PERMISSION = "Permissions.Customers.Ledger.Credit"

/** CustomersPermissions.Loyalty.Adjust: manual loyalty-point corrections. */
export const CUSTOMER_LOYALTY_ADJUST_PERMISSION = "Permissions.Customers.Ledger.Loyalty"

/** Whether the caller may set or remove credit limits. Root users always may. */
export function canManageCustomerCredit(granted: readonly string[]): boolean {
  return isDotnetRootUser(granted) || granted.includes(CUSTOMER_CREDIT_MANAGE_PERMISSION)
}

/** Whether the caller may add or remove loyalty points by hand. Root users always may. */
export function canAdjustCustomerLoyalty(granted: readonly string[]): boolean {
  return isDotnetRootUser(granted) || granted.includes(CUSTOMER_LOYALTY_ADJUST_PERMISSION)
}
