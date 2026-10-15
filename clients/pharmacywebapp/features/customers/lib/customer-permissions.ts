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

/**
 * CustomersPermissions.Ledger.RecordPayment: recording customer payments. Sending a dues reminder SMS
 * (POST /notifications/sms/dues-reminders) is gated on the same collections permission.
 */
export const CUSTOMER_RECORD_PAYMENT_PERMISSION = "Permissions.Customers.Ledger.RecordPayment"

/** Whether the caller may text a customer a dues reminder. Root users always may. */
export function canSendDuesReminder(granted: readonly string[]): boolean {
  return isDotnetRootUser(granted) || granted.includes(CUSTOMER_RECORD_PAYMENT_PERMISSION)
}

/** CustomersPermissions.Ledger.View: a customer's account money (ledger, statement, ageing). */
export const CUSTOMER_LEDGER_VIEW_PERMISSION = "Permissions.Customers.Ledger.View"

/** Whether the caller may see a customer's account money (ledger, statement). Root users always may. */
export function canViewCustomerMoney(granted: readonly string[]): boolean {
  return isDotnetRootUser(granted) || granted.includes(CUSTOMER_LEDGER_VIEW_PERMISSION)
}
