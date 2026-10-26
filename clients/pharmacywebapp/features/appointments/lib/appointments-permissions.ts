import { isDotnetRootUser } from "@/lib/api/dotnet-permissions"

/** Appointments.Doctors.View: see the doctors and the timetable. */
export const DOCTORS_VIEW_PERMISSION = "Permissions.Appointments.Doctors.View"
/** Appointments.Doctors.Manage: add doctors, change their fee, share and days. */
export const DOCTORS_MANAGE_PERMISSION = "Permissions.Appointments.Doctors.Manage"
/** Appointments.Appointments.View / Book / CheckIn: the doctors' desk — see tokens, book them, move them along. */
export const APPOINTMENTS_VIEW_PERMISSION = "Permissions.Appointments.Appointments.View"
export const APPOINTMENTS_BOOK_PERMISSION = "Permissions.Appointments.Appointments.Book"
export const APPOINTMENTS_CHECKIN_PERMISSION = "Permissions.Appointments.Appointments.CheckIn"
/** Appointments.Payouts.View / Pay: what the pharmacy owes each doctor, and paying it. */
export const PAYOUTS_VIEW_PERMISSION = "Permissions.Appointments.Payouts.View"
export const PAYOUTS_PAY_PERMISSION = "Permissions.Appointments.Payouts.Pay"

const has = (permissions: readonly string[], ...names: string[]) =>
  isDotnetRootUser(permissions) || names.some((n) => permissions.includes(n))

export function canViewDoctors(permissions: readonly string[]): boolean {
  return has(permissions, DOCTORS_VIEW_PERMISSION, DOCTORS_MANAGE_PERMISSION)
}

export function canManageDoctors(permissions: readonly string[]): boolean {
  return has(permissions, DOCTORS_MANAGE_PERMISSION)
}

export function canViewAppointments(permissions: readonly string[]): boolean {
  return has(permissions, APPOINTMENTS_VIEW_PERMISSION)
}

/** What a user may do on the doctors' desk and the doctor's money page. */
export interface DeskAccess {
  canBook: boolean
  canCheckIn: boolean
  canViewPayouts: boolean
  canPay: boolean
}

export function deskAccess(permissions: readonly string[]): DeskAccess {
  return {
    canBook: has(permissions, APPOINTMENTS_BOOK_PERMISSION),
    canCheckIn: has(permissions, APPOINTMENTS_CHECKIN_PERMISSION),
    canViewPayouts: has(permissions, PAYOUTS_VIEW_PERMISSION),
    canPay: has(permissions, PAYOUTS_PAY_PERMISSION),
  }
}
