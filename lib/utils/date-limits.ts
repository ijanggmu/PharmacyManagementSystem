/**
 * Pure date-limit rules shared by every date picker.
 *
 * The rule: a date field may not hold a day after "today" (Nepal local time) unless the field
 * explicitly opts in with `allowFuture` (expiry dates, "valid until", scheduled effective dates…).
 * Everything here works on local "yyyy-MM-dd" strings, which compare correctly as plain strings.
 */

/** Nepal Standard Time is UTC+05:45 all year (no DST). */
const NEPAL_OFFSET_MINUTES = 5 * 60 + 45

const YMD_PATTERN = /^(\d{4})-(\d{2})-(\d{2})$/

function pad2(n: number): string {
  return String(n).padStart(2, "0")
}

/** True when `value` is a real calendar day written as "yyyy-MM-dd" (rejects 2026-02-30). */
export function isValidYmd(value: string | null | undefined): value is string {
  if (!value) return false
  const match = YMD_PATTERN.exec(value)
  if (!match) return false
  const year = Number(match[1])
  const month = Number(match[2])
  const day = Number(match[3])
  if (month < 1 || month > 12 || day < 1) return false
  const daysInMonth = new Date(Date.UTC(year, month, 0)).getUTCDate()
  return day <= daysInMonth
}

/** Today's date in Nepal ("yyyy-MM-dd"), independent of the device's time zone. */
export function nepalTodayYmd(now: Date = new Date()): string {
  const shifted = new Date(now.getTime() + NEPAL_OFFSET_MINUTES * 60_000)
  return `${shifted.getUTCFullYear()}-${pad2(shifted.getUTCMonth() + 1)}-${pad2(shifted.getUTCDate())}`
}

function earlier(a: string | undefined, b: string | undefined): string | undefined {
  if (!a) return b
  if (!b) return a
  return a <= b ? a : b
}

export interface DateLimitOptions {
  /** Inclusive lower bound, "yyyy-MM-dd". */
  min?: string
  /** Inclusive upper bound, "yyyy-MM-dd". */
  max?: string
  /** Opt out of the default "no dates after today" rule. */
  allowFuture?: boolean
  /** Override "today" ("yyyy-MM-dd"); defaults to Nepal's current date. */
  today?: string
}

export interface DateBounds {
  min?: string
  max?: string
}

/**
 * Effective inclusive bounds for a picker: the caller's min/max, with max capped at today unless
 * `allowFuture` is set. Malformed bounds are ignored rather than disabling every day.
 */
export function resolveDateBounds({ min, max, allowFuture, today }: DateLimitOptions = {}): DateBounds {
  const safeMin = isValidYmd(min) ? min : undefined
  const safeMax = isValidYmd(max) ? max : undefined
  if (allowFuture) return { min: safeMin, max: safeMax }
  return { min: safeMin, max: earlier(safeMax, today ?? nepalTodayYmd()) }
}

/** True when `ymd` is a valid date inside `bounds` (inclusive). */
export function isDateAllowed(ymd: string, bounds: DateBounds): boolean {
  if (!isValidYmd(ymd)) return false
  if (bounds.min && ymd < bounds.min) return false
  if (bounds.max && ymd > bounds.max) return false
  return true
}

/** Moves `ymd` into `bounds` (inclusive). Returns "" for anything that isn't a valid date. */
export function clampYmd(ymd: string, bounds: DateBounds): string {
  if (!isValidYmd(ymd)) return ""
  if (bounds.max && ymd > bounds.max) return bounds.max
  if (bounds.min && ymd < bounds.min) return bounds.min
  return ymd
}

export interface YmdRange {
  from: string
  to: string
}

/**
 * Normalises a from/to range for a range picker: swaps reversed ends, then clamps both ends to
 * `bounds` (so a "This month" preset ends today instead of at the month's end). Returns null
 * when either end is not a valid date.
 */
export function clampYmdRange(range: YmdRange, bounds: DateBounds): YmdRange | null {
  if (!isValidYmd(range.from) || !isValidYmd(range.to)) return null
  const [lo, hi] = range.from <= range.to ? [range.from, range.to] : [range.to, range.from]
  return { from: clampYmd(lo, bounds), to: clampYmd(hi, bounds) }
}
