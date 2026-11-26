import { isDotnetRootUser } from "@/lib/api/dotnet-permissions"

/** IdentityPermissions.Users.Create — gates POST /identity/register (Add user). */
export const USERS_CREATE_PERMISSION = "Permissions.Users.Create"
/** IdentityPermissions.Users.Update — gates editing a user and switching them on or off. */
export const USERS_UPDATE_PERMISSION = "Permissions.Users.Update"

/** Whether the signed-in user may add staff. The manager sees the list but may not add to it. */
export function canAddUsers(granted: readonly string[]): boolean {
  return isDotnetRootUser(granted) || granted.includes(USERS_CREATE_PERMISSION)
}

/** Whether the signed-in user may edit, deactivate or reactivate staff. */
export function canChangeUsers(granted: readonly string[]): boolean {
  return isDotnetRootUser(granted) || granted.includes(USERS_UPDATE_PERMISSION)
}

/** IdentityPermissions.Users.Delete — gates DELETE /identity/users/{id}. */
export const USERS_DELETE_PERMISSION = "Permissions.Users.Delete"

/** Whether the signed-in user may delete staff accounts. */
export function canDeleteUsers(granted: readonly string[]): boolean {
  return isDotnetRootUser(granted) || granted.includes(USERS_DELETE_PERMISSION)
}
