import { describe, expect, it } from "vitest"
import { buildCsv } from "@/features/accounting/lib/csv"
import { buildEmployeeBody, buildSalaryStructureBody, runSchema, type PayrollRun, type PayrollRunLine } from "@/features/payroll/api-client"
import {
  bsMonthLabel,
  bsMonthOf,
  buildPayslipsHtml,
  canViewPayroll,
  fiscalYearLabel,
  fiscalYearMonths,
  fiscalYearOf,
  lineBalances,
  PAYROLL_VIEW_PERMISSION,
  payrollRegisterRows,
  REGISTER_HEADERS,
  registerFileName,
  runActions,
  shiftBsMonth,
} from "@/features/payroll/lib/payroll"

const line = (over: Partial<PayrollRunLine> = {}): PayrollRunLine => ({
  employeeId: "e1",
  employeeName: "Sita Sharma",
  designation: "Pharmacist",
  pan: "123456789",
  ssfNumber: null,
  bankName: "NIC Asia",
  bankAccountNumber: "0011",
  maritalStatus: "Single",
  ssfEnrolled: false,
  daysWorked: 31,
  daysInMonth: 31,
  basic: 100000,
  grade: 0,
  dearnessAllowance: 0,
  otherAllowance: 0,
  gross: 100000,
  employeeSsf: 0,
  employerSsf: 0,
  cit: 0,
  otherDeduction: 0,
  socialSecurityTax: 416.67,
  incomeTax: 11666.66,
  tds: 12083.33,
  net: 87916.67,
  projectedAnnualIncome: 1200000,
  annualTaxableIncome: 1200000,
  annualTax: 145000,
  ...over,
})

const run = (lines: PayrollRunLine[]): PayrollRun =>
  runSchema.parse({
    id: "r1",
    branchId: "b1",
    bsYear: 2082,
    bsMonth: 4,
    periodLabel: "Shrawan 2082",
    fiscalYearLabel: "2082/83",
    periodStart: "2025-07-17",
    periodEnd: "2025-08-16",
    status: "Posted",
    totals: {
      employeeCount: lines.length,
      gross: lines.reduce((s, l) => s + l.gross, 0),
      employeeSsf: lines.reduce((s, l) => s + l.employeeSsf, 0),
      employerSsf: lines.reduce((s, l) => s + l.employerSsf, 0),
      cit: lines.reduce((s, l) => s + l.cit, 0),
      otherDeductions: lines.reduce((s, l) => s + l.otherDeduction, 0),
      socialSecurityTax: lines.reduce((s, l) => s + l.socialSecurityTax, 0),
      incomeTax: lines.reduce((s, l) => s + l.incomeTax, 0),
      tds: lines.reduce((s, l) => s + l.tds, 0),
      net: lines.reduce((s, l) => s + l.net, 0),
    },
    createdAtUtc: "2025-08-20T00:00:00Z",
    lines,
  })

describe("canViewPayroll", () => {
  it("needs Payroll.View", () => {
    expect(canViewPayroll([PAYROLL_VIEW_PERMISSION])).toBe(true)
    expect(canViewPayroll(["Permissions.Accounting.Vouchers.View"])).toBe(false)
    expect(canViewPayroll([])).toBe(false)
  })
})

describe("Nepali payroll months", () => {
  it("finds the BS month of an AD day", () => {
    expect(bsMonthOf("2025-07-17")).toEqual({ bsYear: 2082, bsMonth: 4 })
    expect(bsMonthLabel({ bsYear: 2082, bsMonth: 4 })).toBe("Shrawan 2082")
  })

  it("steps across the BS new year", () => {
    expect(shiftBsMonth({ bsYear: 2082, bsMonth: 12 }, 1)).toEqual({ bsYear: 2083, bsMonth: 1 })
    expect(shiftBsMonth({ bsYear: 2083, bsMonth: 1 }, -1)).toEqual({ bsYear: 2082, bsMonth: 12 })
  })

  it("puts Shrawan–Ashadh in one fiscal year", () => {
    expect(fiscalYearOf({ bsYear: 2082, bsMonth: 4 })).toBe(2082)
    expect(fiscalYearOf({ bsYear: 2083, bsMonth: 3 })).toBe(2082)
    expect(fiscalYearLabel(2082)).toBe("2082/83")
    const months = fiscalYearMonths(2082)
    expect(months).toHaveLength(12)
    expect(months[0]).toEqual({ bsYear: 2082, bsMonth: 4 })
    expect(months[11]).toEqual({ bsYear: 2083, bsMonth: 3 })
  })
})

describe("runActions", () => {
  it("follows draft → approved → posted → paid", () => {
    expect(runActions("Draft")).toEqual(["recalculate", "delete", "approve"])
    expect(runActions("Approved")).toEqual(["post"])
    expect(runActions("Posted")).toEqual(["pay"])
    expect(runActions("Paid")).toEqual([])
  })
})

describe("lineBalances", () => {
  it("checks net = gross − deductions to the paisa", () => {
    expect(lineBalances(line())).toBe(true)
    expect(lineBalances(line({ net: 87916.66 }))).toBe(false)
  })
})

describe("payroll register", () => {
  it("has one row per employee plus totals, in header order", () => {
    const r = run([line(), line({ employeeId: "e2", employeeName: "Ram", basic: 60000, gross: 60000, tds: 0, socialSecurityTax: 0, incomeTax: 0, net: 60000 })])
    const rows = payrollRegisterRows(r)
    expect(rows).toHaveLength(3)
    expect(rows[0]).toHaveLength(REGISTER_HEADERS.length)
    expect(rows[0][0]).toBe("Sita Sharma")
    expect(rows[0][REGISTER_HEADERS.indexOf("Net pay")]).toBe("87916.67")
    expect(rows[2][0]).toBe("Total (2)")
    expect(rows[2][REGISTER_HEADERS.indexOf("Basic")]).toBe("160000.00")
    expect(rows[2][REGISTER_HEADERS.indexOf("Net pay")]).toBe("147916.67")
    expect(buildCsv(REGISTER_HEADERS, rows).split("\n")).toHaveLength(4)
  })

  it("names the file by month and branch", () => {
    expect(registerFileName({ bsYear: 2082, bsMonth: 4 }, "Main / Lakeside")).toBe("payroll-register-2082-04-Main-Lakeside.csv")
  })
})

describe("payslips", () => {
  it("prints one escaped slip per employee", () => {
    const html = buildPayslipsHtml([line({ employeeName: "<b>Hari</b>" }), line({ employeeId: "e2", employeeName: "Gita" })], {
      pharmacyName: "Care & Cure",
      branchName: "Main",
      run: { periodLabel: "Shrawan 2082", fiscalYearLabel: "2082/83", periodStart: "2025-07-17", periodEnd: "2025-08-16", status: "Draft" },
    })
    expect(html.match(/class="slip"/g)).toHaveLength(2)
    expect(html).toContain("&lt;b&gt;Hari&lt;/b&gt;")
    expect(html).not.toContain("<b>Hari</b>")
    expect(html).toContain("Care &amp; Cure")
    expect(html).toContain("DRAFT")
    expect(html).toContain("87,916.67")
  })
})

describe("request bodies", () => {
  it("sends blank optional text as null", () => {
    const body = buildEmployeeBody({
      fullName: "  Sita ",
      branchId: "b1",
      designation: " ",
      joiningDate: "2025-07-17",
      pan: "",
      ssfNumber: "SSF-1",
      ssfEnrolled: true,
      bankName: "",
      bankAccountNumber: "",
      maritalStatus: "Married",
      isActive: true,
    })
    expect(body).toMatchObject({ fullName: "Sita", designation: null, pan: null, ssfNumber: "SSF-1", maritalStatus: "Married" })
  })

  it("rounds salary amounts to the paisa", () => {
    const body = buildSalaryStructureBody({
      effectiveFrom: "2025-07-17",
      basic: 30000.456,
      grade: 0,
      dearnessAllowance: Number.NaN,
      otherAllowance: 0,
      otherDeduction: 0,
      citContribution: 1000,
      notes: "",
    })
    expect(body.basic).toBe(30000.46)
    expect(body.dearnessAllowance).toBe(0)
    expect(body.notes).toBeNull()
  })
})
