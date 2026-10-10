import { isDotnetRootUser } from "@/lib/api/dotnet-permissions"

/** IdentityPermissions.Users.ResetTwoFactor — gates POST /identity/users/{id}/2fa/reset. */
export const USERS_RESET_TWO_FACTOR_PERMISSION = "Permissions.Users.ResetTwoFactor"

/** Whether the signed-in user may reset other users' two-step verification. Root users always may. */
export function canResetTwoFactor(granted: readonly string[]): boolean {
  return isDotnetRootUser(granted) || granted.includes(USERS_RESET_TWO_FACTOR_PERMISSION)
}

/** The row-menu "Reset 2FA" item only makes sense for a user who has 2FA on. */
export function showResetTwoFactorAction(user: { two_factor_enabled?: boolean }, granted: readonly string[]): boolean {
  return user.two_factor_enabled === true && canResetTwoFactor(granted)
}
