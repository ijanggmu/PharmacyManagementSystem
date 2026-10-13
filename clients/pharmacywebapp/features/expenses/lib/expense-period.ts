/**
 * Pure helpers for the expenses page: the Nepali (BS) month the stat cards cover, and their sums.
 */

import NepaliDate from "nepali-date-converter"
import { BS_MONTH_NAMES_EN } from "@/features/calendar/nepali-utils"
import { bsMonthRange } from "@/features/accounting/lib/date-presets"
import { formatLocalDateYmd, parseYmdAsLocalDate } from "@/lib/utils/date"
import type { Expense, ExpenseCategory } from "@/features/expenses/api-client"

export interface YmdRange {
  from: string
  to: string
}

/**
 * The current BS month up to today, as AD yyyy-mm-dd bounds, plus its name (e.g. "Ashwin 2083").
 * `todayYmd` is today's date in Nepal (nepalTodayYmd()).
 */
export function currentBsMonthRange(todayYmd: string): YmdRange & { label: string } {
  const today = parseYmdAsLocalDate(todayYmd)
  const range = bsMonthRange(today)
  const bs = NepaliDate.fromAD(today)
  const monthEnd = formatLocalDateYmd(range.to)
  return {
    from: formatLocalDateYmd(range.from),
    // Up to today: the month's remaining days are in the future.
    to: monthEnd > todayYmd ? todayYmd : monthEnd,
    label: `${BS_MONTH_NAMES_EN[bs.getMonth()]} ${bs.getYear()}`,
  }
}

export interface ExpenseSummary {
  total: number
  count: number
  /** Largest category by amount, or null when there are no expenses. */
  topCategory: { category: ExpenseCategory; amount: number } | null
}

export function summarizeExpenses(rows: readonly Pick<Expense, "amount" | "category">[]): ExpenseSummary {
  const byCategory = new Map<ExpenseCategory, number>()
  let total = 0
  for (const e of rows) {
    const amount = Number(e.amount) || 0
    total += amount
    byCategory.set(e.category, (byCategory.get(e.category) ?? 0) + amount)
  }
  let top: ExpenseSummary["topCategory"] = null
  for (const [category, amount] of byCategory) {
    if (!top || amount > top.amount) top = { category, amount }
  }
  return { total: Math.round(total * 100) / 100, count: rows.length, topCategory: top }
}

/** A from/to filter is usable when both sides are blank or valid, and from is not after to. */
export function isValidYmdRange(from: string, to: string): boolean {
  return !from || !to || from <= to
}
