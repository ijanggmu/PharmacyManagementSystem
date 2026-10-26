/**
 * Pure date/time helpers for the doctors' timetable. Dates are local "yyyy-MM-dd" strings (Nepal calendar day),
 * times are "HH:mm"; nothing here touches the browser's time zone beyond building a calendar date.
 */

import type { ShareType, TimetableSession, WeeklySlotInput } from "@/features/appointments/api-client"

const pad = (n: number) => String(n).padStart(2, "0")

function parseYmd(ymd: string): Date {
  const [y, m, d] = ymd.split("-").map(Number)
  return new Date(Date.UTC(y, m - 1, d))
}

function toYmd(date: Date): string {
  return `${date.getUTCFullYear()}-${pad(date.getUTCMonth() + 1)}-${pad(date.getUTCDate())}`
}

export function addDaysYmd(ymd: string, days: number): string {
  const d = parseYmd(ymd)
  d.setUTCDate(d.getUTCDate() + days)
  return toYmd(d)
}

/** 0 = Sunday … 6 = Saturday, the API's DayOfWeek. */
export function dayOfWeekYmd(ymd: string): number {
  return parseYmd(ymd).getUTCDay()
}

/** The Sunday that starts the week holding `ymd` (the Nepali week runs Sunday to Saturday). */
export function weekStartYmd(ymd: string): string {
  return addDaysYmd(ymd, -dayOfWeekYmd(ymd))
}

/** The seven dates of the week starting `startYmd`. */
export function weekDates(startYmd: string): string[] {
  return Array.from({ length: 7 }, (_, i) => addDaysYmd(startYmd, i))
}

/** "16:30" → "4:30 pm". */
export function formatTime12(hhmm: string): string {
  const [h, m] = hhmm.split(":").map(Number)
  if (!Number.isFinite(h) || !Number.isFinite(m)) return hhmm
  const suffix = h < 12 ? "am" : "pm"
  const hour = h % 12 === 0 ? 12 : h % 12
  return `${hour}:${pad(m)} ${suffix}`
}

/** "16:00"–"19:00" → "4:00–7:00 pm"; keeps both suffixes when the range crosses noon ("9:00 am–1:00 pm"). */
export function formatTimeRange(start: string, end: string): string {
  const from = formatTime12(start)
  const to = formatTime12(end)
  const fromSuffix = from.slice(-2)
  return fromSuffix === to.slice(-2) ? `${from.slice(0, -3)}–${to}` : `${from}–${to}`
}

/** One row per doctor, one cell per date: the timetable grid. Doctors are ordered by name. */
export function timetableGrid(sessions: readonly TimetableSession[], dates: readonly string[]) {
  const doctors = new Map<string, { doctorId: string; doctorName: string; speciality: string | null }>()
  for (const s of sessions) {
    if (!doctors.has(s.doctorId)) doctors.set(s.doctorId, { doctorId: s.doctorId, doctorName: s.doctorName, speciality: s.speciality })
  }

  return [...doctors.values()]
    .sort((a, b) => a.doctorName.localeCompare(b.doctorName))
    .map((doctor) => ({
      ...doctor,
      cells: dates.map((date) => ({
        date,
        sessions: sessions
          .filter((s) => s.doctorId === doctor.doctorId && s.date === date)
          .sort((a, b) => a.startTime.localeCompare(b.startTime)),
      })),
    }))
}

/**
 * Live preview of the doctor's part of one fee while the owner types (the API stores and returns the real
 * figure). Same rule as the API: a percent of the fee, or a fixed amount never above the fee.
 */
export function previewDoctorShare(fee: number, shareType: ShareType, shareValue: number): number {
  const f = Number.isFinite(fee) && fee > 0 ? fee : 0
  const v = Number.isFinite(shareValue) && shareValue > 0 ? shareValue : 0
  if (shareType === "Percent") return Math.round(f * Math.min(v, 100)) / 100
  return Math.min(v, f)
}

/** Problems in the weekly-days editor, as indexes of the rows to flag. Mirrors the API's checks. */
export function weeklySlotProblems(slots: readonly WeeklySlotInput[]): { invalidRows: number[]; overlappingRows: number[] } {
  const invalidRows: number[] = []
  slots.forEach((s, i) => {
    if (!s.branchId || !s.startTime || !s.endTime || s.endTime <= s.startTime || !(s.maxTokens >= 1 && s.maxTokens <= 500)) {
      invalidRows.push(i)
    }
  })

  const overlapping = new Set<number>()
  slots.forEach((a, i) => {
    slots.forEach((b, j) => {
      if (i < j && a.dayOfWeek === b.dayOfWeek && a.startTime < b.endTime && b.startTime < a.endTime) {
        overlapping.add(i)
        overlapping.add(j)
      }
    })
  })

  return { invalidRows, overlappingRows: [...overlapping].sort((a, b) => a - b) }
}
