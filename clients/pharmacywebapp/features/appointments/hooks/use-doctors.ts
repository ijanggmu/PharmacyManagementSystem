"use client"

import { keepPreviousData, useMutation, useQuery, useQueryClient } from "@tanstack/react-query"
import {
  appointmentsApi,
  type AppointmentSettings,
  type Appointment,
  type BookTokenInput,
  type DaySheet,
  type DoctorBalance,
  type DoctorPayout,
  type PaymentMethod,
  type DayChangeInput,
  type Doctor,
  type DoctorInput,
  type DoctorPage,
  type Timetable,
  type WeeklySlotInput,
} from "@/features/appointments/api-client"

export const APPOINTMENTS_QUERY_KEY = ["appointments"] as const
const DOCTORS_KEY = [...APPOINTMENTS_QUERY_KEY, "doctors"] as const
const TIMETABLE_KEY = [...APPOINTMENTS_QUERY_KEY, "timetable"] as const

export function useDoctors(filters: { search?: string; includeInactive?: boolean }) {
  return useQuery<DoctorPage>({
    queryKey: [...DOCTORS_KEY, "list", filters],
    queryFn: () => appointmentsApi.listDoctors(filters),
    placeholderData: keepPreviousData,
  })
}

export function useDoctor(doctorId: string | null) {
  return useQuery<Doctor>({
    queryKey: [...DOCTORS_KEY, "detail", doctorId],
    queryFn: () => appointmentsApi.getDoctor(doctorId as string),
    enabled: !!doctorId,
  })
}

export function useTimetable(range: { from: string; to: string; branchId?: string }) {
  return useQuery<Timetable>({
    queryKey: [...TIMETABLE_KEY, range],
    queryFn: () => appointmentsApi.getTimetable(range),
    placeholderData: keepPreviousData,
  })
}

/** Any doctor change can move the timetable, so both are refreshed. */
function useInvalidateDoctors() {
  const queryClient = useQueryClient()
  return () =>
    Promise.all([
      queryClient.invalidateQueries({ queryKey: DOCTORS_KEY }),
      queryClient.invalidateQueries({ queryKey: TIMETABLE_KEY }),
    ])
}

// Per-call data (the id, the form, the idempotency key) always rides through mutate(arg) — golden rule #9.

export function useSaveDoctor() {
  const invalidate = useInvalidateDoctors()
  return useMutation<string, Error, { id: string | null; input: DoctorInput; idempotencyKey: string }>({
    mutationFn: ({ id, input, idempotencyKey }) =>
      id ? appointmentsApi.updateDoctor(id, input) : appointmentsApi.createDoctor(input, idempotencyKey),
    onSuccess: () => invalidate(),
  })
}

export function useSetDoctorActive() {
  const invalidate = useInvalidateDoctors()
  return useMutation<string, Error, { id: string; isActive: boolean }>({
    mutationFn: ({ id, isActive }) => appointmentsApi.setDoctorActive(id, isActive),
    onSuccess: () => invalidate(),
  })
}

export function useSetWeeklySlots() {
  const invalidate = useInvalidateDoctors()
  return useMutation<string, Error, { id: string; slots: WeeklySlotInput[] }>({
    mutationFn: ({ id, slots }) => appointmentsApi.setWeeklySlots(id, slots),
    onSuccess: () => invalidate(),
  })
}

export function useAddDayChange() {
  const invalidate = useInvalidateDoctors()
  return useMutation<string, Error, { id: string; input: DayChangeInput; idempotencyKey: string }>({
    mutationFn: ({ id, input, idempotencyKey }) => appointmentsApi.addDayChange(id, input, idempotencyKey),
    onSuccess: () => invalidate(),
  })
}

export function useRemoveDayChange() {
  const invalidate = useInvalidateDoctors()
  return useMutation<string, Error, { id: string; dayChangeId: string }>({
    mutationFn: ({ id, dayChangeId }) => appointmentsApi.removeDayChange(id, dayChangeId),
    onSuccess: () => invalidate(),
  })
}

const DESK_KEY = [...APPOINTMENTS_QUERY_KEY, "desk"] as const
const PAYOUTS_KEY = [...APPOINTMENTS_QUERY_KEY, "payouts"] as const

export function useDaySheet(date: string, branchId?: string) {
  return useQuery<DaySheet>({
    queryKey: [...DESK_KEY, date, branchId ?? null],
    queryFn: () => appointmentsApi.getDaySheet(date, branchId),
    placeholderData: keepPreviousData,
    // The desk is shared by the counter and the doctor's room: keep it fresh while it is open.
    refetchInterval: 30_000,
  })
}

export function useDoctorBalance(doctorId: string | null, enabled = true) {
  return useQuery<DoctorBalance>({
    queryKey: [...PAYOUTS_KEY, "balance", doctorId],
    queryFn: () => appointmentsApi.getDoctorBalance(doctorId as string),
    enabled: !!doctorId && enabled,
  })
}

export function useDoctorPayouts(doctorId: string | null, enabled = true) {
  return useQuery<DoctorPayout[]>({
    queryKey: [...PAYOUTS_KEY, "list", doctorId],
    queryFn: () => appointmentsApi.listPayouts(doctorId as string),
    enabled: !!doctorId && enabled,
  })
}

/** A token changed: the desk, the timetable's booked counts and the doctors' balances may all move. */
function useInvalidateDesk() {
  const queryClient = useQueryClient()
  return () =>
    Promise.all([
      queryClient.invalidateQueries({ queryKey: DESK_KEY }),
      queryClient.invalidateQueries({ queryKey: TIMETABLE_KEY }),
      queryClient.invalidateQueries({ queryKey: PAYOUTS_KEY }),
    ])
}

export function useBookToken() {
  const invalidate = useInvalidateDesk()
  return useMutation<Appointment, Error, { input: BookTokenInput; idempotencyKey: string }>({
    mutationFn: ({ input, idempotencyKey }) => appointmentsApi.bookToken(input, idempotencyKey),
    onSuccess: () => invalidate(),
  })
}

export function useMarkArrived() {
  const invalidate = useInvalidateDesk()
  return useMutation<Appointment, Error, { id: string; fee: number; paymentMethod: PaymentMethod; idempotencyKey: string }>({
    mutationFn: ({ id, fee, paymentMethod, idempotencyKey }) => appointmentsApi.markArrived(id, fee, paymentMethod, idempotencyKey),
    onSuccess: () => invalidate(),
  })
}

export function useMarkSeen() {
  const invalidate = useInvalidateDesk()
  return useMutation<Appointment, Error, { id: string }>({
    mutationFn: ({ id }) => appointmentsApi.markSeen(id),
    onSuccess: () => invalidate(),
  })
}

export function useMarkNoShow() {
  const invalidate = useInvalidateDesk()
  return useMutation<Appointment, Error, { id: string }>({
    mutationFn: ({ id }) => appointmentsApi.markNoShow(id),
    onSuccess: () => invalidate(),
  })
}

export function useCancelAppointment() {
  const invalidate = useInvalidateDesk()
  return useMutation<Appointment, Error, { id: string; reason: string; idempotencyKey: string }>({
    mutationFn: ({ id, reason, idempotencyKey }) => appointmentsApi.cancel(id, reason, idempotencyKey),
    onSuccess: () => invalidate(),
  })
}

export function usePayDoctor() {
  const invalidate = useInvalidateDesk()
  return useMutation<DoctorPayout, Error, { doctorId: string; paymentMethod: PaymentMethod; note: string; idempotencyKey: string }>({
    mutationFn: ({ doctorId, paymentMethod, note, idempotencyKey }) => appointmentsApi.payDoctor(doctorId, paymentMethod, note, idempotencyKey),
    onSuccess: () => invalidate(),
  })
}

const SETTINGS_KEY = [...APPOINTMENTS_QUERY_KEY, "settings"] as const

export function useAppointmentSettings() {
  return useQuery<AppointmentSettings>({ queryKey: SETTINGS_KEY, queryFn: () => appointmentsApi.getSettings() })
}

export function useSaveAppointmentSettings() {
  const queryClient = useQueryClient()
  return useMutation<AppointmentSettings, Error, AppointmentSettings>({
    mutationFn: (settings) => appointmentsApi.updateSettings(settings),
    onSuccess: (saved) => queryClient.setQueryData(SETTINGS_KEY, saved),
  })
}
