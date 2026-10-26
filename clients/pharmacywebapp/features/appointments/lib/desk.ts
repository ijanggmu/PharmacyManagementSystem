/**
 * Pure helpers for the doctors' desk (the appointments page): which sittings can still be booked, which buttons a
 * token shows, the "write prescription" link and the printed token slip. The API makes every real decision; these only
 * shape the screen.
 */

import type { Appointment, DaySheetSession, TimetableSession } from "@/features/appointments/api-client"
import type { DeskAccess } from "@/features/appointments/lib/appointments-permissions"
import { formatTime12 } from "@/features/appointments/lib/timetable"

const NEPAL_OFFSET_MINUTES = 5 * 60 + 45

/** "HH:mm" in Nepal at `now`. */
export function nepalTimeHHmm(now: Date = new Date()): string {
  const minutes = (now.getUTCHours() * 60 + now.getUTCMinutes() + NEPAL_OFFSET_MINUTES) % (24 * 60)
  return `${String(Math.floor(minutes / 60)).padStart(2, "0")}:${String(minutes % 60).padStart(2, "0")}`
}

/** Sittings of one doctor a token can still be booked into: not over yet (today) and not full, soonest first. */
export function bookableSittings(
  sessions: readonly TimetableSession[],
  doctorId: string,
  todayYmd: string,
  nowHHmm: string,
): TimetableSession[] {
  return sessions
    .filter((s) => s.doctorId === doctorId)
    .filter((s) => s.date > todayYmd || (s.date === todayYmd && s.endTime > nowHHmm))
    .filter((s) => s.booked < s.maxTokens)
    .sort((a, b) => (a.date === b.date ? a.startTime.localeCompare(b.startTime) : a.date.localeCompare(b.date)))
}

export interface TokenActions {
  arrive: boolean
  seen: boolean
  noShow: boolean
  cancel: boolean
  prescribe: boolean
}

/** The buttons a token shows: what its status allows, limited by what the user may do. */
export function tokenActions(appointment: Pick<Appointment, "status" | "payoutId">, access: Pick<DeskAccess, "canCheckIn">): TokenActions {
  const can = access.canCheckIn
  const status = appointment.status
  return {
    arrive: can && status === "Booked",
    seen: can && status === "Arrived",
    noShow: can && status === "Booked",
    cancel: can && (status === "Booked" || status === "Arrived") && !appointment.payoutId,
    prescribe: can && (status === "Arrived" || status === "Seen"),
  }
}

/** Opens the prescription form for this token, with the doctor (and the patient, when linked to a customer) filled in. */
export function prescriptionHref(appointment: Pick<Appointment, "id" | "customerId" | "doctorName">, nmcNumber: string | null): string {
  const p = new URLSearchParams({ appointmentId: appointment.id, doctorName: appointment.doctorName })
  if (appointment.customerId) p.set("customerId", appointment.customerId)
  if (nmcNumber) p.set("doctorLicense", nmcNumber)
  return `/dashboard/prescriptions/add?${p.toString()}`
}

/** Places still free in a sitting. */
export function placesLeft(session: Pick<DaySheetSession, "booked" | "maxTokens">): number {
  return Math.max(session.maxTokens - session.booked, 0)
}

const escapeHtml = (value: string) =>
  value.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;")

export interface TokenSlipInput {
  pharmacyName: string
  doctorName: string
  tokenNo: number
  patientName: string
  dateLabel: string
  startTime: string
  labels: { token: string; with: string; when: string }
}

/** A small slip for an 80 mm receipt printer: the pharmacy, a big token number, the doctor, day and time. */
export function buildTokenSlipHtml(input: TokenSlipInput): string {
  const e = escapeHtml
  return `<!doctype html>
<html>
<head>
<meta charset="utf-8">
<title>${e(input.labels.token)} ${input.tokenNo}</title>
<style>
  @page { size: 80mm auto; margin: 4mm; }
  body { font-family: system-ui, sans-serif; text-align: center; margin: 0; }
  .pharmacy { font-weight: 600; font-size: 14px; }
  .label { margin-top: 8px; font-size: 12px; text-transform: uppercase; letter-spacing: 0.08em; }
  .token { font-size: 56px; font-weight: 700; line-height: 1; margin: 4px 0 8px; }
  .line { font-size: 13px; margin: 2px 0; }
</style>
</head>
<body>
  <div class="pharmacy">${e(input.pharmacyName)}</div>
  <div class="label">${e(input.labels.token)}</div>
  <div class="token">${input.tokenNo}</div>
  <div class="line">${e(input.patientName)}</div>
  <div class="line">${e(input.labels.with)}</div>
  <div class="line">${e(input.labels.when)}</div>
</body>
</html>`
}

/** "4:00 pm" for the slip and the confirmation. */
export const slipTime = formatTime12
