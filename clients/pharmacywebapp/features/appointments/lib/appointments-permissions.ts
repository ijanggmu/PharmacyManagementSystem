import { isDotnetRootUser } from "@/lib/api/dotnet-permissions"

/** Appointments.Doctors.View: see the doctors and the timetable. */
export const DOCTORS_VIEW_PERMISSION = "Permissions.Appointments.Doctors.View"
/** Appointments.Doctors.Manage: add doctors, change their fee, share and days. */
export const DOCTORS_MANAGE_PERMISSION = "Permissions.Appointments.Doctors.Manage"

export function canViewDoctors(permissions: readonly string[]): boolean {
  return isDotnetRootUser(permissions) || permissions.includes(DOCTORS_VIEW_PERMISSION) || permissions.includes(DOCTORS_MANAGE_PERMISSION)
}

export function canManageDoctors(permissions: readonly string[]): boolean {
  return isDotnetRootUser(permissions) || permissions.includes(DOCTORS_MANAGE_PERMISSION)
}
