/**
 * Payroll on the .NET API (Payroll module, /payroll/…): employees, salary structures, settings, monthly runs
 * (preview → draft → approved → posted → paid) and the SSF / salary TDS reports. Every response is Zod-validated.
 */

import { z } from "zod"
import { dotnetClient } from "@/lib/api/dotnet-client"

export const MARITAL_STATUSES = ["Single", "Married"] as const
export type MaritalStatus = (typeof MARITAL_STATUSES)[number]

export const RUN_STATUSES = ["Draft", "Approved", "Posted", "Paid"] as const
export type RunStatus = (typeof RUN_STATUSES)[number]

const text = z
  .string()
  .nullish()
  .transform((v) => (v == null || v.trim() === "" ? null : v))
const money = z.number()

export const salaryStructureSchema = z.object({
  id: z.string(),
  employeeId: z.string(),
  effectiveFrom: z.string(),
  basic: money,
  grade: money,
  dearnessAllowance: money,
  otherAllowance: money,
  otherDeduction: money,
  citContribution: money,
  notes: text,
  gross: money,
  createdAtUtc: z.string(),
})
export type SalaryStructure = z.infer<typeof salaryStructureSchema>

export const employeeSchema = z.object({
  id: z.string(),
  fullName: z.string(),
  branchId: z.string(),
  designation: text,
  joiningDate: z.string(),
  pan: text,
  ssfNumber: text,
  ssfEnrolled: z.boolean(),
  bankName: text,
  bankAccountNumber: text,
  maritalStatus: z.enum(MARITAL_STATUSES).catch("Single"),
  isActive: z.boolean(),
  userId: z.string().nullish().transform((v) => v ?? null),
  currentSalary: salaryStructureSchema.nullish().transform((v) => v ?? null),
  createdAtUtc: z.string(),
})
export type Employee = z.infer<typeof employeeSchema>

const taxBandSchema = z.object({ upTo: z.number().nullish().transform((v) => v ?? null), ratePercent: z.number() })

export const payrollSettingsSchema = z.object({
  employeeSsfRatePercent: z.number(),
  employerSsfRatePercent: z.number(),
  retirementDeductionCap: z.number(),
  note: z.string(),
  taxSlabs: z.object({
    fiscalYearLabel: z.string(),
    singleSlabs: z.array(taxBandSchema),
    marriedSlabs: z.array(taxBandSchema),
    source: z.string(),
  }),
  updatedAtUtc: z.string().nullish().transform((v) => v ?? null),
})
export type PayrollSettings = z.infer<typeof payrollSettingsSchema>

export const runLineSchema = z.object({
  employeeId: z.string(),
  employeeName: z.string(),
  designation: text,
  pan: text,
  ssfNumber: text,
  bankName: text,
  bankAccountNumber: text,
  maritalStatus: z.string(),
  ssfEnrolled: z.boolean(),
  daysWorked: z.number(),
  daysInMonth: z.number(),
  basic: money,
  grade: money,
  dearnessAllowance: money,
  otherAllowance: money,
  gross: money,
  employeeSsf: money,
  employerSsf: money,
  cit: money,
  otherDeduction: money,
  socialSecurityTax: money,
  incomeTax: money,
  tds: money,
  net: money,
  projectedAnnualIncome: money,
  annualTaxableIncome: money,
  annualTax: money,
})
export type PayrollRunLine = z.infer<typeof runLineSchema>

export const totalsSchema = z.object({
  employeeCount: z.number(),
  gross: money,
  employeeSsf: money,
  employerSsf: money,
  cit: money,
  otherDeductions: money,
  socialSecurityTax: money,
  incomeTax: money,
  tds: money,
  net: money,
})
export type PayrollTotals = z.infer<typeof totalsSchema>

export const previewSchema = z.object({
  branchId: z.string(),
  bsYear: z.number(),
  bsMonth: z.number(),
  periodLabel: z.string(),
  fiscalYearLabel: z.string(),
  periodStart: z.string(),
  periodEnd: z.string(),
  totals: totalsSchema,
  lines: z.array(runLineSchema),
  skipped: z.array(z.object({ employeeId: z.string(), employeeName: z.string(), reason: z.string() })),
})
export type PayrollPreview = z.infer<typeof previewSchema>

export const runSchema = z.object({
  id: z.string(),
  branchId: z.string(),
  bsYear: z.number(),
  bsMonth: z.number(),
  periodLabel: z.string(),
  fiscalYearLabel: z.string(),
  periodStart: z.string(),
  periodEnd: z.string(),
  status: z.enum(RUN_STATUSES).catch("Draft"),
  totals: totalsSchema,
  preparedBy: text,
  approvedBy: text,
  approvedAtUtc: z.string().nullish().transform((v) => v ?? null),
  postedBy: text,
  postedAtUtc: z.string().nullish().transform((v) => v ?? null),
  postingDate: z.string().nullish().transform((v) => v ?? null),
  paidBy: text,
  paidAtUtc: z.string().nullish().transform((v) => v ?? null),
  paidOn: z.string().nullish().transform((v) => v ?? null),
  paymentMethod: text,
  createdAtUtc: z.string(),
  lines: z.array(runLineSchema),
})
export type PayrollRun = z.infer<typeof runSchema>

export const ssfReportSchema = z.object({
  bsYear: z.number(),
  bsMonth: z.number(),
  periodLabel: z.string(),
  rows: z.array(
    z.object({
      employeeId: z.string(),
      employeeName: z.string(),
      ssfNumber: text,
      branchId: z.string(),
      basic: money,
      employeeSsf: money,
      employerSsf: money,
      total: money,
    }),
  ),
  totalBasic: money,
  totalEmployeeSsf: money,
  totalEmployerSsf: money,
  total: money,
})
export type SsfReport = z.infer<typeof ssfReportSchema>

export const tdsReportSchema = z.object({
  bsYear: z.number(),
  bsMonth: z.number(),
  periodLabel: z.string(),
  rows: z.array(
    z.object({
      employeeId: z.string(),
      employeeName: z.string(),
      pan: text,
      branchId: z.string(),
      gross: money,
      socialSecurityTax: money,
      incomeTax: money,
      tds: money,
    }),
  ),
  totalGross: money,
  totalSocialSecurityTax: money,
  totalIncomeTax: money,
  totalTds: money,
})
export type SalaryTdsReport = z.infer<typeof tdsReportSchema>

/** The employee form. Blank optional text is sent as null. */
export interface EmployeeInput {
  fullName: string
  branchId: string
  designation: string
  joiningDate: string
  pan: string
  ssfNumber: string
  ssfEnrolled: boolean
  bankName: string
  bankAccountNumber: string
  maritalStatus: MaritalStatus
  isActive: boolean
}

export interface SalaryStructureInput {
  effectiveFrom: string
  basic: number
  grade: number
  dearnessAllowance: number
  otherAllowance: number
  otherDeduction: number
  citContribution: number
  notes: string
}

export interface PayrollMonth {
  branchId: string
  bsYear: number
  bsMonth: number
}

const blankToNull = (v: string) => (v.trim() === "" ? null : v.trim())

export function buildEmployeeBody(input: EmployeeInput) {
  return {
    fullName: input.fullName.trim(),
    branchId: input.branchId,
    designation: blankToNull(input.designation),
    joiningDate: input.joiningDate,
    pan: blankToNull(input.pan),
    ssfNumber: blankToNull(input.ssfNumber),
    ssfEnrolled: input.ssfEnrolled,
    bankName: blankToNull(input.bankName),
    bankAccountNumber: blankToNull(input.bankAccountNumber),
    maritalStatus: input.maritalStatus,
    isActive: input.isActive,
  }
}

const round2 = (n: number) => Math.round((Number.isFinite(n) ? n : 0) * 100) / 100

export function buildSalaryStructureBody(input: SalaryStructureInput) {
  return {
    effectiveFrom: input.effectiveFrom,
    basic: round2(input.basic),
    grade: round2(input.grade),
    dearnessAllowance: round2(input.dearnessAllowance),
    otherAllowance: round2(input.otherAllowance),
    otherDeduction: round2(input.otherDeduction),
    citContribution: round2(input.citContribution),
    notes: blankToNull(input.notes),
  }
}

const monthQuery = (m: { bsYear: number; bsMonth: number; branchId?: string | null }) => {
  const p = new URLSearchParams({ bsYear: String(m.bsYear), bsMonth: String(m.bsMonth) })
  if (m.branchId) p.set("branchId", m.branchId)
  return p.toString()
}

export const payrollApi = {
  async listEmployees(filters: { branchId?: string; includeInactive?: boolean; search?: string } = {}): Promise<Employee[]> {
    const p = new URLSearchParams()
    if (filters.branchId) p.set("branchId", filters.branchId)
    if (filters.includeInactive) p.set("includeInactive", "true")
    if (filters.search?.trim()) p.set("search", filters.search.trim())
    const qs = p.toString()
    return z.array(employeeSchema).parse(await dotnetClient.get<unknown>(`/payroll/employees${qs ? `?${qs}` : ""}`))
  },
  async createEmployee(input: EmployeeInput, idempotencyKey?: string): Promise<Employee> {
    return employeeSchema.parse(await dotnetClient.post<unknown>("/payroll/employees", buildEmployeeBody(input), idempotencyKey))
  },
  async updateEmployee(id: string, input: EmployeeInput): Promise<Employee> {
    return employeeSchema.parse(await dotnetClient.put<unknown>(`/payroll/employees/${encodeURIComponent(id)}`, buildEmployeeBody(input)))
  },
  async listSalaryStructures(employeeId: string): Promise<SalaryStructure[]> {
    return z
      .array(salaryStructureSchema)
      .parse(await dotnetClient.get<unknown>(`/payroll/employees/${encodeURIComponent(employeeId)}/salary-structures`))
  },
  async addSalaryStructure(employeeId: string, input: SalaryStructureInput, idempotencyKey?: string): Promise<SalaryStructure> {
    return salaryStructureSchema.parse(
      await dotnetClient.post<unknown>(
        `/payroll/employees/${encodeURIComponent(employeeId)}/salary-structures`,
        buildSalaryStructureBody(input),
        idempotencyKey,
      ),
    )
  },
  async getSettings(): Promise<PayrollSettings> {
    return payrollSettingsSchema.parse(await dotnetClient.get<unknown>("/payroll/settings"))
  },
  async updateSettings(input: { employeeSsfRatePercent: number; employerSsfRatePercent: number; retirementDeductionCap: number }): Promise<PayrollSettings> {
    return payrollSettingsSchema.parse(await dotnetClient.put<unknown>("/payroll/settings", input))
  },
  async preview(month: PayrollMonth): Promise<PayrollPreview> {
    return previewSchema.parse(await dotnetClient.get<unknown>(`/payroll/runs/preview?${monthQuery(month)}`))
  },
  async listRuns(filters: { branchId?: string; fiscalYear?: number } = {}): Promise<PayrollRun[]> {
    const p = new URLSearchParams()
    if (filters.branchId) p.set("branchId", filters.branchId)
    if (filters.fiscalYear) p.set("fiscalYear", String(filters.fiscalYear))
    const qs = p.toString()
    return z.array(runSchema).parse(await dotnetClient.get<unknown>(`/payroll/runs${qs ? `?${qs}` : ""}`))
  },
  async getRun(id: string): Promise<PayrollRun> {
    return runSchema.parse(await dotnetClient.get<unknown>(`/payroll/runs/${encodeURIComponent(id)}`))
  },
  async createRun(month: PayrollMonth, idempotencyKey?: string): Promise<PayrollRun> {
    return runSchema.parse(await dotnetClient.post<unknown>("/payroll/runs", month, idempotencyKey))
  },
  async recalculate(id: string): Promise<PayrollRun> {
    return runSchema.parse(await dotnetClient.post<unknown>(`/payroll/runs/${encodeURIComponent(id)}/recalculate`, {}))
  },
  async deleteRun(id: string): Promise<void> {
    await dotnetClient.delete<unknown>(`/payroll/runs/${encodeURIComponent(id)}`)
  },
  async approve(id: string): Promise<PayrollRun> {
    return runSchema.parse(await dotnetClient.post<unknown>(`/payroll/runs/${encodeURIComponent(id)}/approve`, {}))
  },
  async post(id: string, postingDate: string | null, idempotencyKey?: string): Promise<PayrollRun> {
    return runSchema.parse(
      await dotnetClient.post<unknown>(`/payroll/runs/${encodeURIComponent(id)}/post`, { postingDate: postingDate || null }, idempotencyKey),
    )
  },
  async pay(id: string, paymentMethod: string, paidOn: string | null, idempotencyKey?: string): Promise<PayrollRun> {
    return runSchema.parse(
      await dotnetClient.post<unknown>(`/payroll/runs/${encodeURIComponent(id)}/pay`, { paymentMethod, paidOn: paidOn || null }, idempotencyKey),
    )
  },
  async ssfReport(m: { bsYear: number; bsMonth: number; branchId?: string | null }): Promise<SsfReport> {
    return ssfReportSchema.parse(await dotnetClient.get<unknown>(`/payroll/reports/ssf?${monthQuery(m)}`))
  },
  async tdsReport(m: { bsYear: number; bsMonth: number; branchId?: string | null }): Promise<SalaryTdsReport> {
    return tdsReportSchema.parse(await dotnetClient.get<unknown>(`/payroll/reports/tds?${monthQuery(m)}`))
  },
}
