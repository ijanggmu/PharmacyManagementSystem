"use client"

import { keepPreviousData, useMutation, useQuery, useQueryClient } from "@tanstack/react-query"
import {
  payrollApi,
  type Employee,
  type EmployeeInput,
  type PayrollMonth,
  type PayrollRun,
  type PayrollSettings,
  type SalaryStructure,
  type SalaryStructureInput,
} from "@/features/payroll/api-client"

export const PAYROLL_QUERY_KEY = ["payroll"] as const
const EMPLOYEES_KEY = [...PAYROLL_QUERY_KEY, "employees"] as const
const RUNS_KEY = [...PAYROLL_QUERY_KEY, "runs"] as const
const SETTINGS_KEY = [...PAYROLL_QUERY_KEY, "settings"] as const

export function useEmployees(filters: { branchId?: string; includeInactive?: boolean; search?: string }) {
  return useQuery<Employee[]>({
    queryKey: [...EMPLOYEES_KEY, filters],
    queryFn: () => payrollApi.listEmployees(filters),
    placeholderData: keepPreviousData,
  })
}

export function useSalaryStructures(employeeId: string | null) {
  return useQuery<SalaryStructure[]>({
    queryKey: [...EMPLOYEES_KEY, employeeId, "structures"],
    queryFn: () => payrollApi.listSalaryStructures(employeeId as string),
    enabled: !!employeeId,
  })
}

export function usePayrollSettings() {
  return useQuery<PayrollSettings>({ queryKey: SETTINGS_KEY, queryFn: () => payrollApi.getSettings(), staleTime: 5 * 60 * 1000 })
}

export function usePayrollRuns(filters: { branchId?: string; fiscalYear?: number }) {
  return useQuery<PayrollRun[]>({
    queryKey: [...RUNS_KEY, filters],
    queryFn: () => payrollApi.listRuns(filters),
    placeholderData: keepPreviousData,
  })
}

export function usePayrollRun(id: string | null) {
  return useQuery<PayrollRun>({
    queryKey: [...RUNS_KEY, "detail", id],
    queryFn: () => payrollApi.getRun(id as string),
    enabled: !!id,
  })
}

export function usePayrollPreview(month: PayrollMonth | null) {
  return useQuery({
    queryKey: [...RUNS_KEY, "preview", month],
    queryFn: () => payrollApi.preview(month as PayrollMonth),
    enabled: !!month?.branchId,
  })
}

export function useSsfReport(m: { bsYear: number; bsMonth: number; branchId?: string }) {
  return useQuery({ queryKey: [...PAYROLL_QUERY_KEY, "reports", "ssf", m], queryFn: () => payrollApi.ssfReport(m) })
}

export function useSalaryTdsReport(m: { bsYear: number; bsMonth: number; branchId?: string }) {
  return useQuery({ queryKey: [...PAYROLL_QUERY_KEY, "reports", "tds", m], queryFn: () => payrollApi.tdsReport(m) })
}

// Per-call data (the id, the form, the idempotency key) always rides through mutate(arg) — golden rule #9.

export function useSaveEmployee() {
  const queryClient = useQueryClient()
  return useMutation<Employee, Error, { id: string | null; input: EmployeeInput; idempotencyKey: string }>({
    mutationFn: ({ id, input, idempotencyKey }) =>
      id ? payrollApi.updateEmployee(id, input) : payrollApi.createEmployee(input, idempotencyKey),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: EMPLOYEES_KEY }),
  })
}

export function useAddSalaryStructure() {
  const queryClient = useQueryClient()
  return useMutation<SalaryStructure, Error, { employeeId: string; input: SalaryStructureInput; idempotencyKey: string }>({
    mutationFn: ({ employeeId, input, idempotencyKey }) => payrollApi.addSalaryStructure(employeeId, input, idempotencyKey),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: EMPLOYEES_KEY }),
  })
}

export function useUpdatePayrollSettings() {
  const queryClient = useQueryClient()
  return useMutation<PayrollSettings, Error, { employeeSsfRatePercent: number; employerSsfRatePercent: number; retirementDeductionCap: number }>({
    mutationFn: (input) => payrollApi.updateSettings(input),
    onSuccess: (saved) => {
      queryClient.setQueryData(SETTINGS_KEY, saved)
      void queryClient.invalidateQueries({ queryKey: [...RUNS_KEY, "preview"] })
    },
  })
}

export type RunCommand =
  | { kind: "create"; month: PayrollMonth; idempotencyKey: string }
  | { kind: "recalculate"; id: string }
  | { kind: "delete"; id: string }
  | { kind: "approve"; id: string }
  | { kind: "post"; id: string; postingDate: string | null; idempotencyKey: string }
  | { kind: "pay"; id: string; paymentMethod: string; paidOn: string | null; idempotencyKey: string }

/** Every run transition through one mutation; the command (and its id / key) is the mutate() argument. */
export function usePayrollRunCommand() {
  const queryClient = useQueryClient()
  return useMutation<PayrollRun | null, Error, RunCommand>({
    mutationFn: async (cmd) => {
      switch (cmd.kind) {
        case "create":
          return payrollApi.createRun(cmd.month, cmd.idempotencyKey)
        case "recalculate":
          return payrollApi.recalculate(cmd.id)
        case "delete":
          await payrollApi.deleteRun(cmd.id)
          return null
        case "approve":
          return payrollApi.approve(cmd.id)
        case "post":
          return payrollApi.post(cmd.id, cmd.postingDate, cmd.idempotencyKey)
        case "pay":
          return payrollApi.pay(cmd.id, cmd.paymentMethod, cmd.paidOn, cmd.idempotencyKey)
      }
    },
    onSuccess: (run) => {
      if (run) queryClient.setQueryData([...RUNS_KEY, "detail", run.id], run)
      void queryClient.invalidateQueries({ queryKey: PAYROLL_QUERY_KEY })
    },
  })
}
