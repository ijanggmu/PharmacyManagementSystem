/**
 * Bikram Sambat (BS) helpers for the date pickers. Pure: they take "yyyy-MM-dd" AD days (Nepal
 * calendar days) and return the same, so they can be unit-tested without a clock.
 */

import NepaliDate from "nepali-date-converter"
import { BS_MONTH_NAMES_EN } from "@/features/calendar/nepali-utils"
import { formatLocalDateYmd, parseYmdAsLocalDate } from "@/lib/utils/date"
import type { YmdRange } from "@/lib/utils/date-limits"

function bsToAdYmd(bsYear: number, bsMonth0: number, bsDay: number): string {
  const ad = new NepaliDate(bsYear, bsMonth0, bsDay).getAD()
  return formatLocalDateYmd(new Date(ad.year, ad.month, ad.date))
}

function previousAdYmd(ymd: string): string {
  const d = parseYmdAsLocalDate(ymd)
  return formatLocalDateYmd(new Date(d.getFullYear(), d.getMonth(), d.getDate() - 1))
}

/**
 * The whole BS month containing `todayYmd` (offset 0) or the BS month before it (offset -1), as AD days.
 * "This month" in BS mode means e.g. 1–31 Ashwin, not 1–31 October.
 */
export function bsMonthRangeYmd(todayYmd: string, offset: 0 | -1 = 0): YmdRange {
  const bs = NepaliDate.fromAD(parseYmdAsLocalDate(todayYmd))
  let year = bs.getYear()
  let month0 = bs.getMonth() + offset
  if (month0 < 0) {
    month0 = 11
    year -= 1
  }
  const nextYear = month0 === 11 ? year + 1 : year
  const nextMonth0 = month0 === 11 ? 0 : month0 + 1
  return { from: bsToAdYmd(year, month0, 1), to: previousAdYmd(bsToAdYmd(nextYear, nextMonth0, 1)) }
}

/** "Ashwin 25" (or "Ashwin 25, 2083" with `withYear`) for an AD calendar date. */
export function formatBsShort(date: Date, withYear = false): string {
  const bs = NepaliDate.fromAD(new Date(date.getFullYear(), date.getMonth(), date.getDate()))
  const label = `${BS_MONTH_NAMES_EN[bs.getMonth()]} ${bs.getDate()}`
  return withYear ? `${label}, ${bs.getYear()}` : label
}

/** BS label for a from–to range; years are shown only when the ends fall in different BS years. */
export function formatBsRange(from: Date, to: Date): string {
  const fromYear = NepaliDate.fromAD(from).getYear()
  const toYear = NepaliDate.fromAD(to).getYear()
  const withYear = fromYear !== toYear
  return `${formatBsShort(from, withYear)} – ${formatBsShort(to, withYear)}`
}
