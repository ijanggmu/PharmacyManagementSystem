import { describe, expect, it } from "vitest"
import { formatLocalDateYmd } from "@/lib/utils/date"
import {
  clampRangeToToday,
  bsMonthRange,
  detectPreset,
  fiscalYearLabel,
  fiscalYearRange,
  fiscalYearStartBsYear,
  formatBsLong,
  formatBsYmd,
  getPresetRange,
} from "./date-presets"

const ymd = (d: Date) => formatLocalDateYmd(d)

describe("fiscal year (Nepal, starts 1 Shrawan)", () => {
  // 2026-10-08 AD is 22 Ashwin 2083 BS -> FY 2083/84.
  const oct2026 = new Date(2026, 9, 8)

  it("starts on 1 Shrawan of the current BS year after Shrawan", () => {
    expect(fiscalYearStartBsYear(oct2026)).toBe(2083)
    expect(fiscalYearLabel(oct2026)).toBe("2083/84")
    const r = fiscalYearRange(oct2026)
    expect(ymd(r.from)).toBe("2026-07-17") // 1 Shrawan 2083
    expect(formatBsYmd(ymd(r.from))).toBe("2083-04-01")
    // ends the day before 1 Shrawan 2084, i.e. the last day of Ashadh 2084
    expect(formatBsYmd(ymd(r.to)).startsWith("2084-03-")).toBe(true)
    expect(r.to.getHours()).toBe(23)
  })

  it("belongs to the previous BS year before Shrawan", () => {
    // 2026-05-01 AD is in Baishakh 2083 -> FY 2082/83
    const may2026 = new Date(2026, 4, 1)
    expect(fiscalYearStartBsYear(may2026)).toBe(2082)
    const r = fiscalYearRange(may2026)
    expect(formatBsYmd(ymd(r.from))).toBe("2082-04-01")
    expect(ymd(r.to)).toBe("2026-07-16")
  })

  it("1 Shrawan itself is the first day of the new fiscal year", () => {
    const shrawan1 = new Date(2026, 6, 17)
    expect(fiscalYearStartBsYear(shrawan1)).toBe(2083)
    expect(fiscalYearStartBsYear(new Date(2026, 6, 16))).toBe(2082)
  })
})

describe("BS month range", () => {
  it("covers the whole BS month containing the date", () => {
    const r = bsMonthRange(new Date(2026, 9, 8)) // Ashwin 2083
    expect(formatBsYmd(ymd(r.from))).toBe("2083-06-01")
    expect(formatBsYmd(ymd(r.to)).startsWith("2083-06-")).toBe(true)
    const nextDay = new Date(r.to.getFullYear(), r.to.getMonth(), r.to.getDate() + 1)
    expect(formatBsYmd(ymd(nextDay))).toBe("2083-07-01")
  })

  it("rolls over Chaitra into the next BS year", () => {
    // 2027-04-01 AD is in Chaitra 2083
    const r = bsMonthRange(new Date(2027, 3, 1))
    expect(formatBsYmd(ymd(r.from))).toBe("2083-12-01")
    const nextDay = new Date(r.to.getFullYear(), r.to.getMonth(), r.to.getDate() + 1)
    expect(formatBsYmd(ymd(nextDay))).toBe("2084-01-01")
  })
})

describe("getPresetRange", () => {
  const now = new Date(2026, 9, 8, 15, 30) // Thursday

  it("today", () => {
    const r = getPresetRange("today", now)
    expect(ymd(r.from)).toBe("2026-10-08")
    expect(ymd(r.to)).toBe("2026-10-08")
    expect(r.from.getHours()).toBe(0)
  })

  it("this week starts on Sunday and ends today rather than on Saturday", () => {
    const r = getPresetRange("this_week", now)
    expect(ymd(r.from)).toBe("2026-10-04")
    expect(ymd(r.to)).toBe("2026-10-08")
  })

  it("this month ends today, not at the month end", () => {
    const r = getPresetRange("this_month", now)
    expect(ymd(r.from)).toBe("2026-10-01")
    expect(ymd(r.to)).toBe("2026-10-08")
    expect(r.to.getHours()).toBe(23)
  })

  it("this BS month and this fiscal year never end in the future", () => {
    for (const id of ["this_bs_month", "fiscal_year"] as const) {
      const r = getPresetRange(id, now)
      expect(ymd(r.to)).toBe("2026-10-08")
      expect(r.from.getTime()).toBeLessThanOrEqual(r.to.getTime())
    }
  })

  it("last 30 days includes today", () => {
    const r = getPresetRange("last_30_days", now)
    expect(ymd(r.from)).toBe("2026-09-09")
    expect(ymd(r.to)).toBe("2026-10-08")
  })
})

describe("detectPreset", () => {
  const now = new Date(2026, 9, 8, 12)
  it("recognises a preset range by calendar day", () => {
    expect(detectPreset(getPresetRange("fiscal_year", now), now)).toBe("fiscal_year")
    expect(detectPreset({ from: new Date(2026, 9, 1, 9), to: new Date(2026, 9, 8, 1) }, now)).toBe("this_month")
  })
  it("returns null for a custom range or no range", () => {
    expect(detectPreset({ from: new Date(2026, 0, 3), to: new Date(2026, 1, 9) }, now)).toBeNull()
    expect(detectPreset(undefined, now)).toBeNull()
  })
})

describe("BS formatting", () => {
  it("formats AD yyyy-mm-dd as BS", () => {
    expect(formatBsYmd("2026-10-08")).toBe("2083-06-22")
    expect(formatBsLong("2026-10-08")).toBe("22 Ashwin 2083")
  })
  it("accepts ISO timestamps and tolerates bad input", () => {
    expect(formatBsYmd("2026-10-08T00:00:00Z")).toBe("2083-06-22")
    expect(formatBsYmd("")).toBe("")
    expect(formatBsYmd(null)).toBe("")
  })
})

describe("clampRangeToToday", () => {
  const now = new Date(2026, 9, 8, 12)
  it("caps a future end at today and leaves past ranges alone", () => {
    const capped = clampRangeToToday({ from: new Date(2026, 9, 1), to: new Date(2026, 11, 31, 23, 59) }, now)
    expect(formatLocalDateYmd(capped.to)).toBe("2026-10-08")
    const past = { from: new Date(2026, 0, 1), to: new Date(2026, 0, 31, 23, 59) }
    expect(clampRangeToToday(past, now)).toEqual(past)
  })
  it("never returns a start after the end", () => {
    const r = clampRangeToToday({ from: new Date(2026, 10, 1), to: new Date(2026, 10, 30) }, now)
    expect(formatLocalDateYmd(r.from)).toBe("2026-10-08")
    expect(formatLocalDateYmd(r.to)).toBe("2026-10-08")
  })
})
