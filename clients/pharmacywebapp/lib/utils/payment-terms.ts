/**
 * Payment terms (credit days) and due dates, shared by the supplier / customer forms, bill entry, the
 * ledgers and the aging / payables-due reports. Pure — mirrors the server's PaymentTerms rules
 * (Suppliers and Customers modules): a bill falls due `creditDays` after its date unless the bill gives its
 * own due date; `daysOverdue` > 0 = overdue, 0 = due today, < 0 = days still to go, null = no due date.
 */

import { addDaysYmd } from "@/lib/utils/nepal-time"
import { isValidYmd } from "@/lib/utils/date-limits"

/** Longest credit period the server accepts. */
export const MAX_CREDIT_DAYS = 365

/** The "due soon" window of the payables-due view, in days. */
export const DUE_SOON_DAYS = 7

/** Common terms offered as quick picks next to the credit-days input. */
export const CREDIT_DAY_PRESETS = [0, 7, 15, 30, 45, 60, 90] as const

export type ParsedCreditDays = { ok: true; value: number | null } | { ok: false; error: string }

/** Parses the credit-days input: blank = no terms (null), else a whole number 0–365. */
export function parseCreditDays(raw: string | number | null | undefined): ParsedCreditDays {
  if (raw === null || raw === undefined) return { ok: true, value: null }
  const text = String(raw).trim()
  if (text === "") return { ok: true, value: null }
  if (!/^\d+$/.test(text)) return { ok: false, error: "Enter credit days as a whole number, e.g. 30." }
  const value = Number(text)
  if (value > MAX_CREDIT_DAYS) return { ok: false, error: `Credit days can be at most ${MAX_CREDIT_DAYS}.` }
  return { ok: true, value }
}

/** The credit days to send for an already-validated input: a number, or null for blank (no terms). */
export function creditDaysValue(raw: string | number | null | undefined): number | null {
  const parsed = parseCreditDays(raw)
  return parsed.ok ? parsed.value : null
}

/** "Net 30", "Due on receipt" (0) or "No terms". */
export function creditTermsLabel(creditDays: number | null | undefined): string {
  if (creditDays === null || creditDays === undefined) return "No terms"
  if (creditDays === 0) return "Due on receipt"
  return `Net ${creditDays}`
}

/** The due date ("yyyy-MM-dd") of a bill dated `billDate` under `creditDays` terms; null without terms. */
export function defaultDueDate(billDate: string, creditDays: number | null | undefined): string | null {
  if (!isValidYmd(billDate) || creditDays === null || creditDays === undefined) return null
  return addDaysYmd(billDate, creditDays)
}

export type BillDueDateSource = "override" | "terms" | "none"

/**
 * The due date a bill form shows and what to send. A date picked on the form wins (`override`); otherwise the
 * supplier's terms decide (`terms`) — then nothing is sent and the server applies the same rule — or there is
 * none. `sendDueDate` is the yyyy-MM-dd to put on the request, or null.
 */
export function resolveBillDueDate(input: {
  billDate: string
  creditDays: number | null | undefined
  override?: string | null
}): { dueDate: string | null; source: BillDueDateSource; sendDueDate: string | null } {
  const override = input.override?.trim()
  if (override && isValidYmd(override)) return { dueDate: override, source: "override", sendDueDate: override }
  const fromTerms = defaultDueDate(input.billDate, input.creditDays)
  return fromTerms ? { dueDate: fromTerms, source: "terms", sendDueDate: null } : { dueDate: null, source: "none", sendDueDate: null }
}

/** A due date before the bill date is refused by the server; this catches it on the form. */
export function dueDateError(billDate: string, dueDate: string | null | undefined): string | null {
  if (!dueDate) return null
  if (!isValidYmd(dueDate)) return "Pick a valid due date."
  if (isValidYmd(billDate) && dueDate < billDate) return "The due date can't be before the bill date."
  return null
}

export type DueState = "overdue" | "due_today" | "due_soon" | "later" | "none"

/** Where an open item stands: by `daysOverdue` (see the module note) and the due-soon window. */
export function dueState(daysOverdue: number | null | undefined, withinDays: number = DUE_SOON_DAYS): DueState {
  if (daysOverdue === null || daysOverdue === undefined) return "none"
  if (daysOverdue > 0) return "overdue"
  if (daysOverdue === 0) return "due_today"
  return -daysOverdue <= withinDays ? "due_soon" : "later"
}

/** "12 days overdue", "Due today", "Due tomorrow", "Due in 5 days", or "No due date". */
export function dueLabel(daysOverdue: number | null | undefined): string {
  if (daysOverdue === null || daysOverdue === undefined) return "No due date"
  if (daysOverdue > 0) return `${daysOverdue} ${daysOverdue === 1 ? "day" : "days"} overdue`
  if (daysOverdue === 0) return "Due today"
  if (daysOverdue === -1) return "Due tomorrow"
  return `Due in ${-daysOverdue} days`
}

/** Badge colour for a due state (maps onto the Badge variants used in the ledgers). */
export function dueBadgeVariant(state: DueState): "danger" | "warning" | "muted" | "outline" {
  switch (state) {
    case "overdue":
      return "danger"
    case "due_today":
    case "due_soon":
      return "warning"
    case "later":
      return "muted"
    default:
      return "outline"
  }
}

/** Server schedule status ("overdue" | "due_soon" | "later" | "no_due_date") to a display label. */
export function scheduleStatusLabel(status: string): string {
  switch (status) {
    case "overdue":
      return "Overdue"
    case "due_soon":
      return "Due this week"
    case "later":
      return "Due later"
    default:
      return "No due date"
  }
}

/** By-due-date aging buckets, in display order. */
export const DUE_BUCKETS = [
  { key: "not_yet_due", label: "Not yet due" },
  { key: "overdue_1_30", label: "1–30 overdue" },
  { key: "overdue_31_60", label: "31–60 overdue" },
  { key: "overdue_61_90", label: "61–90 overdue" },
  { key: "overdue_90_plus", label: "90+ overdue" },
  { key: "no_due_date", label: "No due date" },
] as const

export type DueBucketKey = (typeof DUE_BUCKETS)[number]["key"]

export type DueBucketAmounts = Record<DueBucketKey, number>

export function emptyDueBuckets(): DueBucketAmounts {
  return { not_yet_due: 0, overdue_1_30: 0, overdue_31_60: 0, overdue_61_90: 0, overdue_90_plus: 0, no_due_date: 0 }
}

/** Adds up the by-due-date buckets of aging rows (rows without them count as zero). */
export function sumDueBuckets(rows: ReadonlyArray<{ due?: DueBucketAmounts | null }>): DueBucketAmounts {
  const total = emptyDueBuckets()
  for (const row of rows) {
    if (!row.due) continue
    for (const { key } of DUE_BUCKETS) total[key] += Number(row.due[key] || 0)
  }
  return total
}

/** Sort weight for "most overdue first" by due date: money further past due weighs more. */
export function dueOverdueWeight(row: DueBucketAmounts): number {
  return row.overdue_90_plus * 1e9 + row.overdue_61_90 * 1e6 + row.overdue_31_60 * 1e3 + row.overdue_1_30
}

/** Sum of the overdue buckets. */
export function overdueTotal(row: Pick<DueBucketAmounts, "overdue_1_30" | "overdue_31_60" | "overdue_61_90" | "overdue_90_plus">): number {
  return row.overdue_1_30 + row.overdue_31_60 + row.overdue_61_90 + row.overdue_90_plus
}
