/**
 * Comparatives for the financial statements: which period to compare against (previous period, same period last
 * year in BS terms, or a custom one), variance maths, comparison rows for the P&L and balance sheet, and the twelve
 * BS months of a fiscal year for the monthly trend. Pure — every function takes its inputs, nothing reads the clock.
 */

import NepaliDate from "nepali-date-converter"
import { BS_MONTH_NAMES_EN } from "@/features/calendar/nepali-utils"
import { formatLocalDateYmd, parseYmdAsLocalDate } from "@/lib/utils/date"
import { SHRAWAN, bsToAd } from "./date-presets"
import type { BalanceSheetView } from "@/lib/api/accounting-reports-api"
import type { DateRangeYmd, ProfitAndLossColumns } from "@/lib/api/accounting-statements-api"

export type ComparisonMode = "none" | "previous_period" | "last_year" | "custom"

export const COMPARISON_MODES: { id: ComparisonMode; label: string }[] = [
  { id: "none", label: "No comparison" },
  { id: "previous_period", label: "Previous period" },
  { id: "last_year", label: "Same period last year" },
  { id: "custom", label: "Custom period" },
]

function round2(n: number): number {
  return Number(Number(n || 0).toFixed(2))
}

function addDaysYmd(ymd: string, days: number): string {
  const d = parseYmdAsLocalDate(ymd)
  d.setDate(d.getDate() + days)
  return formatLocalDateYmd(d)
}

function daysBetween(fromYmd: string, toYmd: string): number {
  const a = Date.UTC(...ymdParts(fromYmd))
  const b = Date.UTC(...ymdParts(toYmd))
  return Math.round((b - a) / 86_400_000)
}

function ymdParts(ymd: string): [number, number, number] {
  const [y, m, d] = ymd.slice(0, 10).split("-").map(Number)
  return [y, m - 1, d]
}

interface BsYmd {
  year: number
  month0: number
  day: number
}

function toBs(ymd: string): BsYmd {
  const bs = NepaliDate.fromAD(parseYmdAsLocalDate(ymd))
  return { year: bs.getYear(), month0: bs.getMonth(), day: bs.getDate() }
}

function fromBs(year: number, month0: number, day: number): string {
  return formatLocalDateYmd(bsToAd(year, month0, day))
}

function addBsMonths(year: number, month0: number, delta: number): { year: number; month0: number } {
  const total = year * 12 + month0 + delta
  return { year: Math.floor(total / 12), month0: ((total % 12) + 12) % 12 }
}

/** Number of days in a BS month. */
export function bsMonthLength(year: number, month0: number): number {
  const next = addBsMonths(year, month0, 1)
  return daysBetween(fromBs(year, month0, 1), fromBs(next.year, next.month0, 1))
}

/** Months covered when the range runs from the 1st of a BS month to the last day of a BS month; else null. */
function wholeBsMonths(range: DateRangeYmd): number | null {
  const f = toBs(range.from)
  const t = toBs(range.to)
  if (f.day !== 1 || t.day !== bsMonthLength(t.year, t.month0)) return null
  const months = (t.year - f.year) * 12 + (t.month0 - f.month0) + 1
  return months > 0 ? months : null
}

/**
 * The period just before `range`. Whole BS months (a month, a quarter, a fiscal year) step back by the same number
 * of BS months, so Ashwin compares with Bhadra and a fiscal year with the one before; any other range steps back by
 * its own length in days and ends the day before it starts.
 */
export function previousPeriod(range: DateRangeYmd): DateRangeYmd {
  const months = wholeBsMonths(range)
  if (months != null) {
    const f = toBs(range.from)
    const start = addBsMonths(f.year, f.month0, -months)
    const last = addBsMonths(f.year, f.month0, -1)
    return { from: fromBs(start.year, start.month0, 1), to: fromBs(last.year, last.month0, bsMonthLength(last.year, last.month0)) }
  }
  const length = daysBetween(range.from, range.to)
  const to = addDaysYmd(range.from, -1)
  return { from: addDaysYmd(to, -length), to }
}

/** Shifts a BS date one year back; the last day of a month maps to the last day of that month a year earlier. */
function bsDateLastYear(ymd: string): string {
  const bs = toBs(ymd)
  const isMonthEnd = bs.day === bsMonthLength(bs.year, bs.month0)
  const targetLength = bsMonthLength(bs.year - 1, bs.month0)
  const day = isMonthEnd ? targetLength : Math.min(bs.day, targetLength)
  return fromBs(bs.year - 1, bs.month0, day)
}

/** The same BS dates one year earlier (e.g. 1–30 Ashwin 2083 → 1–31 Ashwin 2082; a fiscal year → the previous one). */
export function samePeriodLastYear(range: DateRangeYmd): DateRangeYmd {
  return { from: bsDateLastYear(range.from), to: bsDateLastYear(range.to) }
}

/** The comparison period for a mode, or null (none, or a custom period not yet chosen). */
export function comparisonPeriod(mode: ComparisonMode, current: DateRangeYmd, custom?: DateRangeYmd | null): DateRangeYmd | null {
  switch (mode) {
    case "previous_period":
      return previousPeriod(current)
    case "last_year":
      return samePeriodLastYear(current)
    case "custom":
      return custom && custom.from && custom.to && custom.from <= custom.to ? custom : null
    default:
      return null
  }
}

export interface Variance {
  amount: number
  /** Change relative to the comparison figure, in percent; null when the comparison figure is zero. */
  percent: number | null
}

/** current − prior, and that as a percentage of |prior| (so a smaller loss reads as an improvement). */
export function variance(current: number, prior: number): Variance {
  const amount = round2(current - prior)
  const base = Math.abs(prior)
  return { amount, percent: base < 0.005 ? null : Number(((amount / base) * 100).toFixed(1)) }
}

export interface ComparisonRow {
  key: string
  code?: string
  name: string
  current: number
  prior: number
  variance: Variance
}

function comparisonRow(key: string, name: string, current: number, prior: number, code?: string): ComparisonRow {
  return { key, code, name, current: round2(current), prior: round2(prior), variance: variance(current, prior) }
}

export interface ProfitAndLossComparison {
  revenue: ComparisonRow[]
  expense: ComparisonRow[]
  totalRevenue: ComparisonRow
  totalExpense: ComparisonRow
  netIncome: ComparisonRow
}

/** P&L comparison from a two-column P&L (column 0 = current period, column 1 = comparison period). */
export function buildProfitAndLossComparison(data: ProfitAndLossColumns): ProfitAndLossComparison {
  const at = (amounts: number[], i: number) => amounts[i] ?? 0
  const toRows = (type: "revenue" | "expense") =>
    data.rows
      .filter((r) => r.account_type === type)
      .map((r) => comparisonRow(r.account_id, r.name, at(r.amounts, 0), at(r.amounts, 1), r.code))
  const col = (i: number) => data.columns[i] ?? { total_revenue: 0, total_expense: 0, net_income: 0 }
  return {
    revenue: toRows("revenue"),
    expense: toRows("expense"),
    totalRevenue: comparisonRow("__revenue", "Total revenue", col(0).total_revenue, col(1).total_revenue),
    totalExpense: comparisonRow("__expense", "Total expenses", col(0).total_expense, col(1).total_expense),
    netIncome: comparisonRow("__net", "Net profit / (loss)", col(0).net_income, col(1).net_income),
  }
}

export interface BalanceSheetComparison {
  assets: ComparisonRow[]
  liabilities: ComparisonRow[]
  equity: ComparisonRow[]
  totalAssets: ComparisonRow
  totalLiabilities: ComparisonRow
  totalEquity: ComparisonRow
  totalLiabilitiesAndEquity: ComparisonRow
}

const EARNINGS_KEY = "__earnings"

function mergeRows(
  current: Array<{ account_id: string; code: string; name: string; balance: number }>,
  prior: Array<{ account_id: string; code: string; name: string; balance: number }>,
): ComparisonRow[] {
  const byId = new Map<string, { code: string; name: string; current: number; prior: number }>()
  for (const r of current) byId.set(r.account_id, { code: r.code, name: r.name, current: r.balance, prior: 0 })
  for (const r of prior) {
    const e = byId.get(r.account_id)
    if (e) e.prior = r.balance
    else byId.set(r.account_id, { code: r.code, name: r.name, current: 0, prior: r.balance })
  }
  return [...byId.entries()]
    .map(([id, e]) => comparisonRow(id, e.name, e.current, e.prior, e.code))
    .sort((a, b) => (a.code ?? "").localeCompare(b.code ?? ""))
}

/**
 * Balance sheet comparison: accounts matched by id across both dates (an account missing on one side reads 0), and
 * the unclosed P&L shown as a "Current year earnings" equity row, as on the single statement.
 */
export function buildBalanceSheetComparison(current: BalanceSheetView, prior: BalanceSheetView): BalanceSheetComparison {
  const equity = mergeRows(current.equity, prior.equity)
  const earningsCurrent = current.current_year_earnings
  const earningsPrior = prior.current_year_earnings
  if (Math.abs(earningsCurrent) >= 0.005 || Math.abs(earningsPrior) >= 0.005) {
    equity.push(comparisonRow(EARNINGS_KEY, "Current year earnings (unclosed P&L)", earningsCurrent, earningsPrior))
  }
  const equityCurrent = current.total_equity + earningsCurrent
  const equityPrior = prior.total_equity + earningsPrior
  return {
    assets: mergeRows(current.assets, prior.assets),
    liabilities: mergeRows(current.liabilities, prior.liabilities),
    equity,
    totalAssets: comparisonRow("__assets", "Total assets", current.total_assets, prior.total_assets),
    totalLiabilities: comparisonRow("__liabilities", "Total liabilities", current.total_liabilities, prior.total_liabilities),
    totalEquity: comparisonRow("__equity", "Total equity", equityCurrent, equityPrior),
    totalLiabilitiesAndEquity: comparisonRow(
      "__le",
      "Total liabilities & equity",
      current.total_liabilities + equityCurrent,
      prior.total_liabilities + equityPrior,
    ),
  }
}

// ---------------------------------------------------------------------------
// Monthly trend
// ---------------------------------------------------------------------------

export interface FiscalMonth extends DateRangeYmd {
  /** e.g. "Shrawan 2083" */
  label: string
  /** e.g. "Shrawan" */
  shortLabel: string
}

/** The twelve BS months of fiscal year `fyStartBsYear` (Shrawan of that year to Ashadh of the next), in order. */
export function fiscalYearMonths(fyStartBsYear: number): FiscalMonth[] {
  return Array.from({ length: 12 }, (_, i) => {
    const { year, month0 } = addBsMonths(fyStartBsYear, SHRAWAN, i)
    return {
      from: fromBs(year, month0, 1),
      to: fromBs(year, month0, bsMonthLength(year, month0)),
      label: `${BS_MONTH_NAMES_EN[month0]} ${year}`,
      shortLabel: BS_MONTH_NAMES_EN[month0],
    }
  })
}

export interface TrendRow {
  key: string
  code?: string
  name: string
  amounts: number[]
  total: number
}

export interface ProfitAndLossTrend {
  revenue: TrendRow[]
  expense: TrendRow[]
  totalRevenue: TrendRow
  totalExpense: TrendRow
  netIncome: TrendRow
}

/** P&L trend rows (one amount per column, plus a row total) from the multi-period P&L. */
export function buildProfitAndLossTrend(data: ProfitAndLossColumns): ProfitAndLossTrend {
  const n = data.periods.length
  const sum = (xs: number[]) => round2(xs.reduce((s, x) => s + x, 0))
  const row = (key: string, name: string, amounts: number[], code?: string): TrendRow => ({
    key,
    code,
    name,
    amounts: Array.from({ length: n }, (_, i) => round2(amounts[i] ?? 0)),
    total: sum(amounts.slice(0, n)),
  })
  const of = (type: "revenue" | "expense") =>
    data.rows.filter((r) => r.account_type === type).map((r) => row(r.account_id, r.name, r.amounts, r.code))
  return {
    revenue: of("revenue"),
    expense: of("expense"),
    totalRevenue: row("__revenue", "Total revenue", data.columns.map((c) => c.total_revenue)),
    totalExpense: row("__expense", "Total expenses", data.columns.map((c) => c.total_expense)),
    netIncome: row("__net", "Net profit / (loss)", data.columns.map((c) => c.net_income)),
  }
}
