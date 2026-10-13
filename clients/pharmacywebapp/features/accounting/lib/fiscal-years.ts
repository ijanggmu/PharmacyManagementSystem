/**
 * Year-end close helpers: which fiscal year can be closed or reopened next. Pure, so they can be unit-tested.
 * Years are closed oldest first (the API refuses a year while an earlier one with revenue or expense is still
 * open), and only the latest closed year can be reopened.
 */

import type { FiscalYearStatus } from "@/lib/api/accounting-api"

export type FiscalYearState = "closed" | "ready" | "waiting" | "in_progress"

/** The oldest year that has ended and is still open — the only one the Close action is offered for. */
export function nextClosableYear(years: FiscalYearStatus[]): FiscalYearStatus | null {
  const candidates = years.filter((y) => y.has_ended && !y.is_closed)
  if (candidates.length === 0) return null
  return candidates.reduce((oldest, y) => (y.fiscal_year < oldest.fiscal_year ? y : oldest))
}

/** The latest closed year — the only one the Reopen action is offered for. */
export function latestClosedYear(years: FiscalYearStatus[]): FiscalYearStatus | null {
  const closed = years.filter((y) => y.is_closed)
  if (closed.length === 0) return null
  return closed.reduce((latest, y) => (y.fiscal_year > latest.fiscal_year ? y : latest))
}

/**
 * Status of one year: closed; ready to close (the next closable year); waiting (ended, but an older year must be
 * closed first); or in progress (not ended yet).
 */
export function fiscalYearState(year: FiscalYearStatus, years: FiscalYearStatus[]): FiscalYearState {
  if (year.is_closed) return "closed"
  if (!year.has_ended) return "in_progress"
  return nextClosableYear(years)?.fiscal_year === year.fiscal_year ? "ready" : "waiting"
}
