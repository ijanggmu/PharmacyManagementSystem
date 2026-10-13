import { isDotnetRootUser } from "@/lib/api/dotnet-permissions"

/** Payroll.View — the only payroll permission carried in the token. Manage / Approve / Post are checked by the API,
 * and the pages surface its 403. */
export const PAYROLL_VIEW_PERMISSION = "Permissions.Payroll.Payroll.View"

/** Whether the signed-in user may open Payroll. */
export function canViewPayroll(permissions: readonly string[]): boolean {
  return isDotnetRootUser(permissions) || permissions.includes(PAYROLL_VIEW_PERMISSION)
}
