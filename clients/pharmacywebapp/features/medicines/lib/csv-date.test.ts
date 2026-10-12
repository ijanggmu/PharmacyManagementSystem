import { describe, expect, it } from "vitest"
import { normalizeCsvDate } from "./csv-date"

describe("normalizeCsvDate", () => {
  it("keeps an empty cell empty without an error", () => {
    expect(normalizeCsvDate("")).toEqual({ ymd: null, error: null })
    expect(normalizeCsvDate("   ")).toEqual({ ymd: null, error: null })
    expect(normalizeCsvDate(undefined)).toEqual({ ymd: null, error: null })
  })

  it("accepts year-first dates with any separator and pads them", () => {
    expect(normalizeCsvDate("2027-04-03").ymd).toBe("2027-04-03")
    expect(normalizeCsvDate("2027/4/3").ymd).toBe("2027-04-03")
    expect(normalizeCsvDate(" 2027.04.03 ").ymd).toBe("2027-04-03")
  })

  it("reads a day-first date when the first part can only be a day", () => {
    expect(normalizeCsvDate("25/12/2027").ymd).toBe("2027-12-25")
    expect(normalizeCsvDate("25-12-2027").ymd).toBe("2027-12-25")
  })

  it("reads a month-first date when the second part can only be a day", () => {
    expect(normalizeCsvDate("12/25/2027").ymd).toBe("2027-12-25")
  })

  it("accepts a date that reads the same either way", () => {
    expect(normalizeCsvDate("05/05/2027").ymd).toBe("2027-05-05")
  })

  it("rejects an ambiguous day/month date and names both readings", () => {
    const result = normalizeCsvDate("03/04/2027", "Expiry date")
    expect(result.ymd).toBeNull()
    expect(result.error).toContain("ambiguous")
    expect(result.error).toContain("2027-04-03")
    expect(result.error).toContain("2027-03-04")
    expect(result.error).toContain("Expiry date")
  })

  it("rejects dates that do not exist", () => {
    expect(normalizeCsvDate("2027-02-30").error).toMatch(/not a real date/)
    expect(normalizeCsvDate("31/02/2027").error).toMatch(/not a real date/)
  })

  it("rejects formats it would have to guess", () => {
    expect(normalizeCsvDate("03/04/27").error).toMatch(/yyyy-mm-dd/)
    expect(normalizeCsvDate("April 3 2027").error).toMatch(/yyyy-mm-dd/)
  })
})
