import { describe, expect, it } from "vitest"
import NepaliDate from "nepali-date-converter"
import {
  businessDateInstantUtc,
  formatNepalDateTime,
  nepalBoundUtc,
  nepalDayEndExclusiveUtc,
  nepalDayEndInclusiveUtc,
  nepalDayStartUtc,
  nepalRangeUtc,
  nepalTodayWindowUtc,
  nepalYmdOf,
} from "@/lib/utils/nepal-time"

function bsToAdYmd(year: number, month0: number, day: number): string {
  const ad = new NepaliDate(year, month0, day).getAD()
  return `${ad.year}-${String(ad.month + 1).padStart(2, "0")}-${String(ad.date).padStart(2, "0")}`
}

describe("Nepal day bounds", () => {
  it("starts a day at 00:00 NPT, i.e. 18:15 UTC the previous day", () => {
    expect(nepalDayStartUtc("2026-10-01")).toBe("2026-09-30T18:15:00.000Z")
  })

  it("ends a day inclusively 1 ms before the next Nepal midnight", () => {
    expect(nepalDayEndInclusiveUtc("2026-10-01")).toBe("2026-10-01T18:14:59.999Z")
    expect(nepalDayEndExclusiveUtc("2026-10-01")).toBe("2026-10-01T18:15:00.000Z")
  })

  it("covers Shrawan 1 (fiscal-year start) as a whole Nepal day", () => {
    const shrawan1 = bsToAdYmd(2083, 3, 1)
    expect(shrawan1).toBe("2026-07-17")
    expect(nepalDayStartUtc(shrawan1)).toBe("2026-07-16T18:15:00.000Z")
    // The last day of Ashadh ends exactly where Shrawan 1 begins — no gap, no overlap.
    expect(nepalDayEndExclusiveUtc("2026-07-16")).toBe(nepalDayStartUtc(shrawan1))
  })

  it("handles AD month and year boundaries", () => {
    expect(nepalDayEndInclusiveUtc("2026-07-31")).toBe("2026-07-31T18:14:59.999Z")
    expect(nepalDayStartUtc("2026-08-01")).toBe("2026-07-31T18:15:00.000Z")
    expect(nepalDayStartUtc("2027-01-01")).toBe("2026-12-31T18:15:00.000Z")
    expect(nepalDayEndInclusiveUtc("2028-02-29")).toBe("2028-02-29T18:14:59.999Z")
  })

  it("builds an inclusive range for a BS month (Kartik 2083)", () => {
    const from = bsToAdYmd(2083, 6, 1)
    expect(nepalRangeUtc(from, "2026-11-16")).toEqual({
      fromUtc: "2026-10-17T18:15:00.000Z",
      toUtc: "2026-11-16T18:14:59.999Z",
    })
  })

  it("rejects anything that is not a real yyyy-mm-dd date", () => {
    expect(() => nepalDayStartUtc("2026-02-30")).toThrow()
    expect(() => nepalDayEndInclusiveUtc("01/10/2026")).toThrow()
  })

  it("nepalBoundUtc maps calendar days to Nepal bounds and passes instants through", () => {
    expect(nepalBoundUtc("2026-10-01")).toBe("2026-09-30T18:15:00.000Z")
    expect(nepalBoundUtc("2026-10-01", true)).toBe("2026-10-01T18:14:59.999Z")
    expect(nepalBoundUtc("2026-10-01T05:00:00Z", true)).toBe("2026-10-01T05:00:00.000Z")
  })
})

describe("nepalYmdOf / nepalTodayWindowUtc", () => {
  it("rolls over to the next day at 18:15 UTC", () => {
    expect(nepalYmdOf(new Date("2026-10-01T18:14:59.999Z"))).toBe("2026-10-01")
    expect(nepalYmdOf(new Date("2026-10-01T18:15:00.000Z"))).toBe("2026-10-02")
  })

  it("gives today's Nepal window at 01:00 NPT (still the previous UTC day)", () => {
    // 2026-10-01 19:15 UTC = 2026-10-02 01:00 NPT
    expect(nepalTodayWindowUtc(new Date("2026-10-01T19:15:00Z"))).toEqual({
      startUtc: "2026-10-01T18:15:00.000Z",
      endExclusiveUtc: "2026-10-02T18:15:00.000Z",
    })
  })
})

describe("businessDateInstantUtc", () => {
  it("keeps a posting date on the same calendar day (UTC midnight = 05:45 NPT)", () => {
    expect(businessDateInstantUtc("2026-10-01")).toBe("2026-10-01T00:00:00Z")
  })
})

describe("formatNepalDateTime", () => {
  it("renders the instant in Nepal time regardless of the runtime zone", () => {
    expect(formatNepalDateTime("2026-10-01T18:30:00Z", { year: "numeric", month: "short", day: "numeric" })).toBe(
      "2 Oct 2026",
    )
    expect(formatNepalDateTime("2026-10-01T18:30:00Z", { hour: "2-digit", minute: "2-digit", hourCycle: "h23" })).toBe(
      "00:15",
    )
  })

  it("shows a dash for invalid input", () => {
    expect(formatNepalDateTime("not a date")).toBe("—")
  })
})
