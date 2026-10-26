/**
 * Visiting doctors and their timetable on the .NET API (Appointments module, /appointments/…): the doctor list,
 * each doctor's weekly days and one-date changes (day off / extra day), and the dated sittings of a week.
 * Every response is Zod-validated.
 */

import { z } from "zod"
import { dotnetClient } from "@/lib/api/dotnet-client"

export const SHARE_TYPES = ["Percent", "Fixed"] as const
export type ShareType = (typeof SHARE_TYPES)[number]

export const DAY_CHANGE_KINDS = ["DayOff", "ExtraDay"] as const
export type DayChangeKind = (typeof DAY_CHANGE_KINDS)[number]

const text = z
  .string()
  .nullish()
  .transform((v) => (v == null || v.trim() === "" ? null : v))
const optional = <T extends z.ZodTypeAny>(schema: T) => schema.nullish().transform((v) => v ?? null)

/** The API sends TimeOnly as "HH:mm:ss"; the UI works in "HH:mm". */
const time = z.string().transform((v) => v.slice(0, 5))

export const weeklySlotSchema = z.object({
  id: z.string(),
  branchId: z.string(),
  dayOfWeek: z.number().int().min(0).max(6),
  startTime: time,
  endTime: time,
  maxTokens: z.number(),
})
export type WeeklySlot = z.infer<typeof weeklySlotSchema>

export const dayChangeSchema = z.object({
  id: z.string(),
  date: z.string(),
  kind: z.enum(DAY_CHANGE_KINDS).catch("DayOff"),
  branchId: optional(z.string()),
  startTime: optional(time),
  endTime: optional(time),
  maxTokens: optional(z.number()),
  note: text,
})
export type DayChange = z.infer<typeof dayChangeSchema>

export const doctorSchema = z.object({
  id: z.string(),
  name: z.string(),
  nmcNumber: text,
  speciality: text,
  phone: text,
  fee: z.number(),
  shareType: z.enum(SHARE_TYPES).catch("Percent"),
  shareValue: z.number(),
  doctorShareAmount: z.number(),
  isActive: z.boolean(),
  createdAtUtc: z.string(),
  weeklySlots: z.array(weeklySlotSchema),
  dayChanges: z.array(dayChangeSchema),
})
export type Doctor = z.infer<typeof doctorSchema>

const doctorPageSchema = z.object({
  items: z.array(doctorSchema),
  pageNumber: z.number(),
  pageSize: z.number(),
  totalCount: z.number(),
  totalPages: z.number(),
})
export type DoctorPage = z.infer<typeof doctorPageSchema>

export const timetableSessionSchema = z.object({
  doctorId: z.string(),
  doctorName: z.string(),
  speciality: text,
  branchId: z.string(),
  date: z.string(),
  startTime: time,
  endTime: time,
  maxTokens: z.number(),
  isExtraDay: z.boolean(),
})
export type TimetableSession = z.infer<typeof timetableSessionSchema>

export const timetableSchema = z.object({
  from: z.string(),
  to: z.string(),
  sessions: z.array(timetableSessionSchema),
  daysOff: z.array(z.object({ doctorId: z.string(), doctorName: z.string(), date: z.string(), note: text })),
})
export type Timetable = z.infer<typeof timetableSchema>

/** The doctor form. Blank optional text is sent as null. */
export interface DoctorInput {
  name: string
  nmcNumber: string
  speciality: string
  phone: string
  fee: number
  shareType: ShareType
  shareValue: number
}

/** One row of the weekly-days editor, times as "HH:mm". */
export interface WeeklySlotInput {
  branchId: string
  dayOfWeek: number
  startTime: string
  endTime: string
  maxTokens: number
}

export interface DayChangeInput {
  date: string
  kind: DayChangeKind
  branchId: string
  startTime: string
  endTime: string
  maxTokens: number
  note: string
}

const blankToNull = (v: string) => (v.trim() === "" ? null : v.trim())
const round2 = (n: number) => Math.round((Number.isFinite(n) ? n : 0) * 100) / 100
/** "16:00" → "16:00:00", the TimeOnly shape the API reads. */
export const toApiTime = (hhmm: string) => (hhmm.length === 5 ? `${hhmm}:00` : hhmm)

export function buildDoctorBody(input: DoctorInput) {
  return {
    name: input.name.trim(),
    nmcNumber: blankToNull(input.nmcNumber),
    speciality: blankToNull(input.speciality),
    phone: blankToNull(input.phone),
    fee: round2(input.fee),
    shareType: input.shareType,
    shareValue: round2(input.shareValue),
  }
}

export function buildWeeklySlotsBody(slots: readonly WeeklySlotInput[]) {
  return {
    slots: slots.map((s) => ({
      branchId: s.branchId,
      dayOfWeek: s.dayOfWeek,
      startTime: toApiTime(s.startTime),
      endTime: toApiTime(s.endTime),
      maxTokens: Math.trunc(s.maxTokens),
    })),
  }
}

/** A day off sends only the date, kind and note; an extra day also sends where, when and how many. */
export function buildDayChangeBody(input: DayChangeInput) {
  const extra = input.kind === "ExtraDay"
  return {
    date: input.date,
    kind: input.kind,
    branchId: extra ? input.branchId : null,
    startTime: extra ? toApiTime(input.startTime) : null,
    endTime: extra ? toApiTime(input.endTime) : null,
    maxTokens: extra ? Math.trunc(input.maxTokens) : null,
    note: blankToNull(input.note),
  }
}

const id = (value: string) => encodeURIComponent(value)

export const appointmentsApi = {
  async listDoctors(filters: { search?: string; includeInactive?: boolean; pageNumber?: number; pageSize?: number } = {}): Promise<DoctorPage> {
    const p = new URLSearchParams()
    if (filters.search?.trim()) p.set("search", filters.search.trim())
    if (filters.includeInactive) p.set("includeInactive", "true")
    p.set("pageNumber", String(filters.pageNumber ?? 1))
    p.set("pageSize", String(filters.pageSize ?? 100))
    return doctorPageSchema.parse(await dotnetClient.get<unknown>(`/appointments/doctors?${p.toString()}`))
  },
  async getDoctor(doctorId: string): Promise<Doctor> {
    return doctorSchema.parse(await dotnetClient.get<unknown>(`/appointments/doctors/${id(doctorId)}`))
  },
  async createDoctor(input: DoctorInput, idempotencyKey?: string): Promise<string> {
    return z.string().parse(await dotnetClient.post<unknown>("/appointments/doctors", buildDoctorBody(input), idempotencyKey))
  },
  async updateDoctor(doctorId: string, input: DoctorInput): Promise<string> {
    return z.string().parse(await dotnetClient.put<unknown>(`/appointments/doctors/${id(doctorId)}`, buildDoctorBody(input)))
  },
  async setDoctorActive(doctorId: string, isActive: boolean): Promise<string> {
    return z.string().parse(await dotnetClient.post<unknown>(`/appointments/doctors/${id(doctorId)}/active`, { isActive }))
  },
  async setWeeklySlots(doctorId: string, slots: readonly WeeklySlotInput[]): Promise<string> {
    return z
      .string()
      .parse(await dotnetClient.put<unknown>(`/appointments/doctors/${id(doctorId)}/weekly-slots`, buildWeeklySlotsBody(slots)))
  },
  async addDayChange(doctorId: string, input: DayChangeInput, idempotencyKey?: string): Promise<string> {
    return z
      .string()
      .parse(
        await dotnetClient.post<unknown>(`/appointments/doctors/${id(doctorId)}/day-changes`, buildDayChangeBody(input), idempotencyKey),
      )
  },
  async removeDayChange(doctorId: string, dayChangeId: string): Promise<string> {
    return z
      .string()
      .parse(await dotnetClient.delete<unknown>(`/appointments/doctors/${id(doctorId)}/day-changes/${id(dayChangeId)}`))
  },
  async getTimetable(range: { from: string; to: string; branchId?: string; doctorId?: string }): Promise<Timetable> {
    const p = new URLSearchParams({ from: range.from, to: range.to })
    if (range.branchId) p.set("branchId", range.branchId)
    if (range.doctorId) p.set("doctorId", range.doctorId)
    return timetableSchema.parse(await dotnetClient.get<unknown>(`/appointments/timetable?${p.toString()}`))
  },
}
