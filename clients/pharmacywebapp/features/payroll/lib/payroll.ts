/**
 * Pure payroll helpers: permission gate, Nepali payroll months, run status actions, the payroll register (CSV) and
 * the printable payslips. No React, no fetch — unit-tested in payroll.test.ts.
 */

import NepaliDate from "nepali-date-converter"
import { escapeHtml } from "@/features/accounting/lib/html-escape"
import { formatPrintAmount } from "@/features/accounting/lib/voucher-print"
import type { CsvValue } from "@/features/accounting/lib/csv"
import type { PayrollRun, PayrollRunLine, RunStatus } from "@/features/payroll/api-client"

export { canViewPayroll, PAYROLL_VIEW_PERMISSION } from "@/features/payroll/lib/payroll-permissions"

/** API month numbering: 1 = Baisakh … 4 = Shrawan … 12 = Chaitra. */
export const BS_MONTHS = [
  "Baisakh",
  "Jestha",
  "Ashadh",
  "Shrawan",
  "Bhadra",
  "Ashwin",
  "Kartik",
  "Mangsir",
  "Poush",
  "Magh",
  "Falgun",
  "Chaitra",
] as const

export interface BsMonth {
  bsYear: number
  bsMonth: number
}

export function bsMonthLabel(m: BsMonth): string {
  return `${BS_MONTHS[m.bsMonth - 1] ?? "?"} ${m.bsYear}`
}

/** The BS month of an AD day ("yyyy-MM-dd", a Nepal calendar day). */
export function bsMonthOf(ymd: string): BsMonth {
  const [y, m, d] = ymd.slice(0, 10).split("-").map(Number)
  const bs = NepaliDate.fromAD(new Date(y, (m ?? 1) - 1, d ?? 1))
  return { bsYear: bs.getYear(), bsMonth: bs.getMonth() + 1 }
}

/** The month before (or after, with a positive step) a BS month. */
export function shiftBsMonth(m: BsMonth, step: number): BsMonth {
  const index = m.bsYear * 12 + (m.bsMonth - 1) + step
  return { bsYear: Math.floor(index / 12), bsMonth: (index % 12) + 1 }
}

/** BS start year of the fiscal year (Shrawan–Ashadh) a month falls in: Shrawan 2082 … Ashadh 2083 → 2082. */
export function fiscalYearOf(m: BsMonth): number {
  return m.bsMonth >= 4 ? m.bsYear : m.bsYear - 1
}

export function fiscalYearLabel(startYear: number): string {
  return `${startYear}/${String((startYear + 1) % 100).padStart(2, "0")}`
}

/** The twelve months of a fiscal year, Shrawan first. */
export function fiscalYearMonths(startYear: number): BsMonth[] {
  return Array.from({ length: 12 }, (_, i) => shiftBsMonth({ bsYear: startYear, bsMonth: 4 }, i))
}

export type RunAction = "recalculate" | "delete" | "approve" | "post" | "pay"

/** What can be done next with a run in each status. */
export function runActions(status: RunStatus): RunAction[] {
  switch (status) {
    case "Draft":
      return ["recalculate", "delete", "approve"]
    case "Approved":
      return ["post"]
    case "Posted":
      return ["pay"]
    default:
      return []
  }
}

export function runStatusVariant(status: RunStatus): "secondary" | "outline" | "default" {
  if (status === "Paid") return "default"
  if (status === "Draft") return "outline"
  return "secondary"
}

/** Net = gross − employee SSF − CIT − TDS − other deductions, to the paisa. */
export function lineBalances(line: Pick<PayrollRunLine, "gross" | "employeeSsf" | "cit" | "tds" | "otherDeduction" | "net">): boolean {
  const expected = line.gross - line.employeeSsf - line.cit - line.tds - line.otherDeduction
  return Math.round(expected * 100) === Math.round(line.net * 100)
}

export const REGISTER_HEADERS = [
  "Employee",
  "Designation",
  "PAN",
  "SSF no.",
  "Bank",
  "Account no.",
  "Days",
  "Basic",
  "Grade",
  "Dearness",
  "Other allowance",
  "Gross",
  "Employee SSF (11%)",
  "Employer SSF (20%)",
  "CIT",
  "Social security tax",
  "Income tax",
  "TDS",
  "Other deduction",
  "Net pay",
]

const csvMoney = (n: number) => (Math.round(n * 100) / 100).toFixed(2)

/** The payroll register rows (one per employee, plus a totals row), in REGISTER_HEADERS order. */
export function payrollRegisterRows(run: Pick<PayrollRun, "lines" | "totals">): CsvValue[][] {
  const rows: CsvValue[][] = run.lines.map((l) => [
    l.employeeName,
    l.designation ?? "",
    l.pan ?? "",
    l.ssfNumber ?? "",
    l.bankName ?? "",
    l.bankAccountNumber ?? "",
    `${l.daysWorked}/${l.daysInMonth}`,
    csvMoney(l.basic),
    csvMoney(l.grade),
    csvMoney(l.dearnessAllowance),
    csvMoney(l.otherAllowance),
    csvMoney(l.gross),
    csvMoney(l.employeeSsf),
    csvMoney(l.employerSsf),
    csvMoney(l.cit),
    csvMoney(l.socialSecurityTax),
    csvMoney(l.incomeTax),
    csvMoney(l.tds),
    csvMoney(l.otherDeduction),
    csvMoney(l.net),
  ])
  const t = run.totals
  const sum = (pick: (l: PayrollRunLine) => number) => csvMoney(run.lines.reduce((s, l) => s + pick(l), 0))
  rows.push([
    `Total (${t.employeeCount})`,
    "",
    "",
    "",
    "",
    "",
    "",
    sum((l) => l.basic),
    sum((l) => l.grade),
    sum((l) => l.dearnessAllowance),
    sum((l) => l.otherAllowance),
    csvMoney(t.gross),
    csvMoney(t.employeeSsf),
    csvMoney(t.employerSsf),
    csvMoney(t.cit),
    csvMoney(t.socialSecurityTax),
    csvMoney(t.incomeTax),
    csvMoney(t.tds),
    csvMoney(t.otherDeductions),
    csvMoney(t.net),
  ])
  return rows
}

export function registerFileName(run: Pick<PayrollRun, "bsYear" | "bsMonth">, branchName: string): string {
  const safeBranch = branchName.replace(/[^A-Za-z0-9]+/g, "-").replace(/^-|-$/g, "") || "branch"
  return `payroll-register-${run.bsYear}-${String(run.bsMonth).padStart(2, "0")}-${safeBranch}.csv`
}

export interface PayslipContext {
  pharmacyName: string
  branchName: string
  run: Pick<PayrollRun, "periodLabel" | "fiscalYearLabel" | "periodStart" | "periodEnd" | "status">
}

function payslipBlock(line: PayrollRunLine, ctx: PayslipContext): string {
  const row = (label: string, amount: number) =>
    amount === 0 ? "" : `<tr><td>${escapeHtml(label)}</td><td class="amt">${formatPrintAmount(amount)}</td></tr>`
  const earnings = [
    row("Basic salary", line.basic),
    row("Grade", line.grade),
    row("Dearness allowance", line.dearnessAllowance),
    row("Other allowance", line.otherAllowance),
  ].join("")
  const deductions = [
    row("SSF (employee)", line.employeeSsf),
    row("CIT", line.cit),
    row("Social security tax", line.socialSecurityTax),
    row("Income tax", line.incomeTax),
    row("Other deduction", line.otherDeduction),
  ].join("")
  return `<section class="slip">
<header><h1>${escapeHtml(ctx.pharmacyName)}</h1><div>${escapeHtml(ctx.branchName)}</div>
<h2>Payslip — ${escapeHtml(ctx.run.periodLabel)}</h2>
<div class="muted">${escapeHtml(ctx.run.periodStart)} to ${escapeHtml(ctx.run.periodEnd)} · FY ${escapeHtml(ctx.run.fiscalYearLabel)}${ctx.run.status === "Draft" ? " · DRAFT" : ""}</div></header>
<table class="who"><tr><td>Employee</td><td>${escapeHtml(line.employeeName)}</td><td>Designation</td><td>${escapeHtml(line.designation ?? "—")}</td></tr>
<tr><td>PAN</td><td>${escapeHtml(line.pan ?? "—")}</td><td>SSF no.</td><td>${escapeHtml(line.ssfNumber ?? "—")}</td></tr>
<tr><td>Bank</td><td>${escapeHtml(line.bankName ?? "—")}</td><td>Account</td><td>${escapeHtml(line.bankAccountNumber ?? "—")}</td></tr>
<tr><td>Days paid</td><td>${line.daysWorked} of ${line.daysInMonth}</td><td>Marital status</td><td>${escapeHtml(line.maritalStatus)}</td></tr></table>
<div class="cols"><table><thead><tr><th>Earnings</th><th class="amt">NPR</th></tr></thead><tbody>${earnings}</tbody>
<tfoot><tr><td>Gross</td><td class="amt">${formatPrintAmount(line.gross)}</td></tr></tfoot></table>
<table><thead><tr><th>Deductions</th><th class="amt">NPR</th></tr></thead><tbody>${deductions}</tbody>
<tfoot><tr><td>Total deductions</td><td class="amt">${formatPrintAmount(line.gross - line.net)}</td></tr></tfoot></table></div>
<p class="net">Net pay: NPR ${formatPrintAmount(line.net)}</p>
<p class="muted">Employer SSF contribution (not deducted): NPR ${formatPrintAmount(line.employerSsf)}. Projected taxable income for the year
NPR ${formatPrintAmount(line.annualTaxableIncome)}; tax for the year NPR ${formatPrintAmount(line.annualTax)}.</p>
</section>`
}

/** A printable HTML document with one payslip per line (each on its own page). Every value is escaped. */
export function buildPayslipsHtml(lines: readonly PayrollRunLine[], ctx: PayslipContext): string {
  return `<!doctype html><html><head><meta charset="utf-8"><title>Payslips ${escapeHtml(ctx.run.periodLabel)}</title>
<style>
body{font-family:system-ui,-apple-system,"Segoe UI",sans-serif;color:#111;margin:0}
.slip{padding:24px 28px;page-break-after:always;max-width:780px;margin:0 auto}
.slip:last-child{page-break-after:auto}
h1{font-size:18px;margin:0}h2{font-size:15px;margin:12px 0 2px}
.muted{color:#555;font-size:12px}
table{border-collapse:collapse;width:100%;font-size:13px}
td,th{padding:4px 6px;border-bottom:1px solid #ddd;text-align:left}
.who{margin:12px 0}.who td:nth-child(odd){color:#555;width:16%}
.cols{display:flex;gap:16px}.cols table{flex:1}
.amt{text-align:right;font-variant-numeric:tabular-nums}
tfoot td{font-weight:600;border-top:1px solid #999}
.net{font-size:16px;font-weight:700;margin:14px 0 6px}
</style></head><body>${lines.map((l) => payslipBlock(l, ctx)).join("")}</body></html>`
}
