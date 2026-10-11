import { describe, expect, it } from "vitest"
import { bsMonthRangeYmd, formatBsRange, formatBsShort } from "@/lib/utils/bs-date"
import { parseYmdAsLocalDate } from "@/lib/utils/date"

describe("bsMonthRangeYmd", () => {
  it("returns the current BS month (Ashwin 2083) for an October day", () => {
    const range = bsMonthRangeYmd("2026-10-11")
    expect(formatBsShort(parseYmdAsLocalDate(range.from), true)).toBe("Ashwin 1, 2083")
    expect(range.to).toBe("2026-10-17") // Kartik 1 2083 is 2026-10-18
  })

  it("returns the previous BS month", () => {
    const range = bsMonthRangeYmd("2026-10-11", -1)
    expect(formatBsShort(parseYmdAsLocalDate(range.from), true)).toBe("Bhadra 1, 2083")
    expect(formatBsShort(parseYmdAsLocalDate(range.to))).toMatch(/^Bhadra 3[01]$/)
  })

  it("starts Shrawan on 2026-07-17 (fiscal-year start) and wraps Baishakh back to Chaitra", () => {
    expect(bsMonthRangeYmd("2026-07-20").from).toBe("2026-07-17")
    const chaitra = bsMonthRangeYmd(bsMonthRangeYmd("2026-04-20").from, -1)
    expect(formatBsShort(parseYmdAsLocalDate(chaitra.from), true)).toBe("Chaitra 1, 2082")
  })
})

describe("formatBsRange", () => {
  it("omits the year inside one BS year and shows it across years", () => {
    expect(formatBsRange(parseYmdAsLocalDate("2026-10-01"), parseYmdAsLocalDate("2026-10-11"))).toBe("Ashwin 15 – Ashwin 25")
    expect(formatBsRange(parseYmdAsLocalDate("2026-04-01"), parseYmdAsLocalDate("2026-04-20"))).toMatch(/, 2082 – .*, 2083$/)
  })
})
