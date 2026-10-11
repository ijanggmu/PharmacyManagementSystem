/**
 * Period presets for the accounting filters, in AD and BS (Bikram Sambat).
 * Nepal's fiscal year runs from 1 Shrawan to the last day of Ashadh.
 * All functions are pure: they take `now` so they can be unit-tested.
 */

import NepaliDate from "nepali-date-converter"
import { BS_MONTH_NAMES_EN } from "@/features/calendar/nepali-utils"
import { formatLocalDateYmd, parseYmdAsLocalDate } from "@/lib/utils/date"
import { nepalTodayYmd } from "@/lib/utils/date-limits"

export interface PeriodRange {
  from: Date
  to: Date
}

export type DatePresetId = "today" | "this_week" | "this_month" | "this_bs_month" | "last_30_days" | "fiscal_year"

export const DATE_PRESETS: { id: DatePresetId; label: string; shortLabel: string }[] = [
  { id: "today", label: "Today", shortLabel: "Today" },
  { id: "this_week", label: "This week", shortLabel: "Week" },
  { id: "this_month", label: "This month", shortLabel: "Month" },
  { id: "this_bs_month", label: "This BS month", shortLabel: "BS month" },
  { id: "last_30_days", label: "Last 30 days", shortLabel: "30 days" },
  { id: "fiscal_year", label: "This fiscal year", shortLabel: "Fiscal year" },
]

/** Index of Shrawan in BS_MONTH_NAMES_EN (0-based); the Nepali fiscal year starts on 1 Shrawan. */
export const SHRAWAN = 3

function startOfDay(d: Date): Date {
  return new Date(d.getFullYear(), d.getMonth(), d.getDate(), 0, 0, 0, 0)
}

function endOfDay(d: Date): Date {
  return new Date(d.getFullYear(), d.getMonth(), d.getDate(), 23, 59, 59, 999)
}

function addDays(d: Date, days: number): Date {
  return new Date(d.getFullYear(), d.getMonth(), d.getDate() + days)
}

/** AD date of a BS calendar day, at local midnight. */
export function bsToAd(bsYear: number, bsMonth0: number, bsDay: number): Date {
  const ad = new NepaliDate(bsYear, bsMonth0, bsDay).getAD()
  return new Date(ad.year, ad.month, ad.date)
}

/** BS year (e.g. 2083) of the fiscal year that `now` falls in — the year in which it started (1 Shrawan). */
export function fiscalYearStartBsYear(now: Date): number {
  const bs = NepaliDate.fromAD(startOfDay(now))
  return bs.getMonth() >= SHRAWAN ? bs.getYear() : bs.getYear() - 1
}

/** "2083/84" style label for the fiscal year containing `now`. */
export function fiscalYearLabel(now: Date): string {
  const y = fiscalYearStartBsYear(now)
  return `${y}/${String((y + 1) % 100).padStart(2, "0")}`
}

export function fiscalYearRange(now: Date): PeriodRange {
  const y = fiscalYearStartBsYear(now)
  const from = bsToAd(y, SHRAWAN, 1)
  const nextStart = bsToAd(y + 1, SHRAWAN, 1)
  return { from: startOfDay(from), to: endOfDay(addDays(nextStart, -1)) }
}

export function bsMonthRange(now: Date): PeriodRange {
  const bs = NepaliDate.fromAD(startOfDay(now))
  const y = bs.getYear()
  const m = bs.getMonth()
  const from = bsToAd(y, m, 1)
  const nextStart = m === 11 ? bsToAd(y + 1, 0, 1) : bsToAd(y, m + 1, 1)
  return { from: startOfDay(from), to: endOfDay(addDays(nextStart, -1)) }
}

/**
 * Range for a preset. Weeks start on Sunday, as the working week does in Nepal. A range never ends after
 * today (Nepal time): "This week", "This month", "This BS month" and "This fiscal year" end today, so
 * reports don't run into the future.
 */
export function getPresetRange(preset: DatePresetId, now: Date = new Date()): PeriodRange {
  return clampRangeToToday(rawPresetRange(preset, now), now)
}

/** Caps a range's end at the end of today in Nepal; the start is capped too so the range never inverts. */
export function clampRangeToToday(range: PeriodRange, now: Date = new Date()): PeriodRange {
  const today = nepalTodayYmd(now)
  const todayEnd = endOfDay(parseYmdAsLocalDate(today))
  const to = formatLocalDateYmd(range.to) > today ? todayEnd : range.to
  const from = formatLocalDateYmd(range.from) > today ? startOfDay(todayEnd) : range.from
  return { from, to }
}

function rawPresetRange(preset: DatePresetId, now: Date): PeriodRange {
  switch (preset) {
    case "today":
      return { from: startOfDay(now), to: endOfDay(now) }
    case "this_week": {
      const from = addDays(now, -now.getDay())
      return { from: startOfDay(from), to: endOfDay(addDays(from, 6)) }
    }
    case "this_month":
      return {
        from: new Date(now.getFullYear(), now.getMonth(), 1),
        to: endOfDay(new Date(now.getFullYear(), now.getMonth() + 1, 0)),
      }
    case "this_bs_month":
      return bsMonthRange(now)
    case "last_30_days":
      return { from: startOfDay(addDays(now, -29)), to: endOfDay(now) }
    case "fiscal_year":
      return fiscalYearRange(now)
  }
}

/** Which preset (if any) exactly matches a range, compared by calendar day. */
export function detectPreset(range: PeriodRange | undefined, now: Date = new Date()): DatePresetId | null {
  if (!range) return null
  const from = formatLocalDateYmd(range.from)
  const to = formatLocalDateYmd(range.to)
  for (const p of DATE_PRESETS) {
    const r = getPresetRange(p.id, now)
    if (formatLocalDateYmd(r.from) === from && formatLocalDateYmd(r.to) === to) return p.id
  }
  return null
}

/** BS date for a yyyy-mm-dd AD date, e.g. "2083-06-22". Empty string when the date is invalid. */
export function formatBsYmd(adYmd: string | null | undefined): string {
  if (!adYmd) return ""
  try {
    const d = parseYmdAsLocalDate(adYmd.slice(0, 10))
    if (Number.isNaN(d.getTime())) return ""
    const bs = NepaliDate.fromAD(d)
    return `${bs.getYear()}-${String(bs.getMonth() + 1).padStart(2, "0")}-${String(bs.getDate()).padStart(2, "0")}`
  } catch {
    return ""
  }
}

/** Long BS date for a yyyy-mm-dd AD date, e.g. "22 Ashwin 2083". */
export function formatBsLong(adYmd: string | null | undefined): string {
  if (!adYmd) return ""
  try {
    const d = parseYmdAsLocalDate(adYmd.slice(0, 10))
    if (Number.isNaN(d.getTime())) return ""
    const bs = NepaliDate.fromAD(d)
    return `${bs.getDate()} ${BS_MONTH_NAMES_EN[bs.getMonth()]} ${bs.getYear()}`
  } catch {
    return ""
  }
}

/** Short human label for a range, e.g. "1 Oct 2026 – 31 Oct 2026". */
export function formatRangeLabel(range: PeriodRange | undefined): string {
  if (!range) return ""
  const fmt = (d: Date) => d.toLocaleDateString("en-GB", { day: "numeric", month: "short", year: "numeric" })
  return `${fmt(range.from)} – ${fmt(range.to)}`
}
