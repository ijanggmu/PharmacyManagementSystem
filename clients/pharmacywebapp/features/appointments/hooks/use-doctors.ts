"use client"

import { keepPreviousData, useMutation, useQuery, useQueryClient } from "@tanstack/react-query"
import {
  appointmentsApi,
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
