/**
 * Nepal business-day helpers.
 *
 * Every pharmacy using the app trades in Nepal Standard Time (UTC+05:45, no DST). A date filter of
 * "2026-07-17" therefore means 00:00 NPT on that day up to the start of the next Nepal day — not the
 * UTC calendar day, which starts at 05:45 NPT and would drop the first 5h45m of trading and pull in
 * the first 5h45m of the next day.
 *
 * All helpers are pure and independent of the device or server time zone.
 */

import { isValidYmd } from "@/lib/utils/date-limits"

export const NEPAL_TIME_ZONE = "Asia/Kathmandu"

/** Nepal Standard Time is UTC+05:45 all year. */
export const NEPAL_OFFSET_MS = (5 * 60 + 45) * 60_000

const DAY_MS = 24 * 60 * 60_000

function assertYmd(ymd: string): void {
  if (!isValidYmd(ymd)) throw new Error(`Expected a date in yyyy-mm-dd format, got "${ymd}"`)
}

function nepalDayStartMs(ymd: string): number {
  assertYmd(ymd)
  const [y, m, d] = ymd.split("-").map(Number)
  return Date.UTC(y, m - 1, d) - NEPAL_OFFSET_MS
}

/** UTC instant (ISO) at which the Nepal calendar day `ymd` starts: "2026-07-17" → "2026-07-16T18:15:00.000Z". */
export function nepalDayStartUtc(ymd: string): string {
  return new Date(nepalDayStartMs(ymd)).toISOString()
}

/** UTC instant (ISO) at which the Nepal day after `ymd` starts — an exclusive upper bound for `ymd`. */
export function nepalDayEndExclusiveUtc(ymd: string): string {
  return new Date(nepalDayStartMs(ymd) + DAY_MS).toISOString()
}

/**
 * Last millisecond of the Nepal day `ymd` as a UTC ISO instant — the upper bound for APIs that compare
 * `<= toUtc` (inclusive), e.g. the accounting reports.
 */
export function nepalDayEndInclusiveUtc(ymd: string): string {
  return new Date(nepalDayStartMs(ymd) + DAY_MS - 1).toISOString()
}

/** Inclusive UTC bounds for a whole-day Nepal range `[fromYmd, toYmd]`. */
export function nepalRangeUtc(fromYmd: string, toYmd: string): { fromUtc: string; toUtc: string } {
  return { fromUtc: nepalDayStartUtc(fromYmd), toUtc: nepalDayEndInclusiveUtc(toYmd) }
}

/**
 * One end of a whole-day range filter. A calendar day ("yyyy-MM-dd") becomes 00:00 NPT (start) or the
 * last millisecond of that Nepal day (inclusive end); a value that already carries a time is an exact
 * instant and passes through as ISO.
 */
export function nepalBoundUtc(value: string, endOfDay = false): string {
  if (value.includes("T")) return new Date(value).toISOString()
  return endOfDay ? nepalDayEndInclusiveUtc(value) : nepalDayStartUtc(value)
}

/** The Nepal calendar day ("yyyy-MM-dd") that the instant `at` falls in. */
export function nepalYmdOf(at: Date = new Date()): string {
  return new Date(at.getTime() + NEPAL_OFFSET_MS).toISOString().slice(0, 10)
}

/** The calendar day `days` after (or before, when negative) the day `ymd` — pure date arithmetic, no time zone. */
export function addDaysYmd(ymd: string, days: number): string {
  assertYmd(ymd)
  const [y, m, d] = ymd.split("-").map(Number)
  return new Date(Date.UTC(y, m - 1, d + days)).toISOString().slice(0, 10)
}

/** Today's Nepal day as UTC bounds: start (inclusive) and next day's start (exclusive). */
export function nepalTodayWindowUtc(now: Date = new Date()): { startUtc: string; endExclusiveUtc: string } {
  const ymd = nepalYmdOf(now)
  return { startUtc: nepalDayStartUtc(ymd), endExclusiveUtc: nepalDayEndExclusiveUtc(ymd) }
}

/**
 * A business date ("yyyy-MM-dd") sent as a single posting instant (voucher/payment/deposit date).
 * Midnight UTC is 05:45 NPT on the same day, so the instant lies inside that Nepal day *and* its UTC
 * date part is still the same calendar day — keep it this way for anything the server stores as a date.
 */
export function businessDateInstantUtc(ymd: string): string {
  assertYmd(ymd)
  return `${ymd}T00:00:00Z`
}

const nepalDateTimeFormatters = new Map<string, Intl.DateTimeFormat>()

/**
 * Formats an instant in Nepal time (safe in Server Components, whose runtime is usually UTC).
 * Defaults to "11 Oct 2026, 10:30 AM"-style output.
 */
export function formatNepalDateTime(
  value: string | number | Date,
  options: Intl.DateTimeFormatOptions = { dateStyle: "medium", timeStyle: "short" },
  locale = "en-GB",
): string {
  const date = value instanceof Date ? value : new Date(value)
  if (Number.isNaN(date.getTime())) return "—"
  const key = `${locale}|${JSON.stringify(options)}`
  let formatter = nepalDateTimeFormatters.get(key)
  if (!formatter) {
    formatter = new Intl.DateTimeFormat(locale, { ...options, timeZone: NEPAL_TIME_ZONE })
    nepalDateTimeFormatters.set(key, formatter)
  }
  return formatter.format(date)
}
