/**
 * Dates typed into a bulk-import CSV, normalized to the "yyyy-MM-dd" the .NET API binds to a DateOnly.
 *
 * Spreadsheets export dates in whatever the machine's locale says: "2027-04-03", "03/04/2027" (Nepal, UK:
 * day first) or "04/03/2027" (US: month first). Sent as-is, "03/04/2027" either fails to bind (400) or is
 * read month-first — a lot expiring in April stored as expiring in March. So:
 *
 * - year first ("2027-04-03", "2027/4/3", "2027.04.03") is unambiguous and accepted;
 * - day/month first is accepted only when it can be only one of the two (a part above 12 is the day, or
 *   both parts are equal); "03/04/2027" could be either and is rejected with a message naming both readings;
 * - anything else (two-digit years, month names, 31 Feb) is rejected rather than guessed.
 */

export interface CsvDateResult {
  /** The date as "yyyy-MM-dd", or null when the cell was empty or could not be read. */
  ymd: string | null
  /** Why the cell could not be read; null when it was empty or valid. */
  error: string | null
}

const pad = (n: number) => String(n).padStart(2, "0")

function validYmd(year: number, month: number, day: number): string | null {
  if (year < 1900 || year > 9999 || month < 1 || month > 12 || day < 1) return null
  const daysInMonth = new Date(Date.UTC(year, month, 0)).getUTCDate()
  if (day > daysInMonth) return null
  return `${year}-${pad(month)}-${pad(day)}`
}

export function normalizeCsvDate(value: string | null | undefined, label = "Date"): CsvDateResult {
  const text = (value ?? "").trim()
  if (!text) return { ymd: null, error: null }

  // Year first: yyyy-mm-dd (also with / or . separators, with or without leading zeros).
  const yearFirst = /^(\d{4})[-/.](\d{1,2})[-/.](\d{1,2})$/.exec(text)
  if (yearFirst) {
    const ymd = validYmd(Number(yearFirst[1]), Number(yearFirst[2]), Number(yearFirst[3]))
    return ymd ? { ymd, error: null } : { ymd: null, error: `${label} "${text}" is not a real date.` }
  }

  // Day/month first with a four-digit year.
  const dayOrMonthFirst = /^(\d{1,2})[-/.](\d{1,2})[-/.](\d{4})$/.exec(text)
  if (dayOrMonthFirst) {
    const a = Number(dayOrMonthFirst[1])
    const b = Number(dayOrMonthFirst[2])
    const year = Number(dayOrMonthFirst[3])
    const asDayMonth = validYmd(year, b, a)
    const asMonthDay = validYmd(year, a, b)
    if (asDayMonth && asMonthDay && asDayMonth !== asMonthDay) {
      return {
        ymd: null,
        error: `${label} "${text}" is ambiguous — it could be ${asDayMonth} or ${asMonthDay}. Write it as yyyy-mm-dd.`,
      }
    }
    const ymd = asDayMonth ?? asMonthDay
    return ymd ? { ymd, error: null } : { ymd: null, error: `${label} "${text}" is not a real date.` }
  }

  return { ymd: null, error: `${label} "${text}" is not a date the import understands. Write it as yyyy-mm-dd.` }
}
