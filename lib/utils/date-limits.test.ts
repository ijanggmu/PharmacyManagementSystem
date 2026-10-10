import { describe, expect, it } from "vitest"
import {
  clampYmd,
  clampYmdRange,
  isDateAllowed,
  isValidYmd,
  nepalTodayYmd,
  resolveDateBounds,
} from "./date-limits"

describe("isValidYmd", () => {
  it("accepts real calendar days", () => {
    expect(isValidYmd("2026-10-09")).toBe(true)
    expect(isValidYmd("2024-02-29")).toBe(true)
  })

  it("rejects impossible days, other shapes and empty values", () => {
    expect(isValidYmd("2026-02-29")).toBe(false)
    expect(isValidYmd("2026-13-01")).toBe(false)
    expect(isValidYmd("2026-04-31")).toBe(false)
    expect(isValidYmd("2026-10-00")).toBe(false)
    expect(isValidYmd("2026-1-9")).toBe(false)
    expect(isValidYmd("09/10/2026")).toBe(false)
    expect(isValidYmd("")).toBe(false)
    expect(isValidYmd(undefined)).toBe(false)
    expect(isValidYmd(null)).toBe(false)
  })
})

describe("nepalTodayYmd", () => {
  it("uses UTC+05:45 regardless of the device zone", () => {
    // 18:14 UTC = 23:59 in Kathmandu, still the same day.
    expect(nepalTodayYmd(new Date("2026-10-09T18:14:00Z"))).toBe("2026-10-09")
    // 18:15 UTC = 00:00 next day in Kathmandu.
    expect(nepalTodayYmd(new Date("2026-10-09T18:15:00Z"))).toBe("2026-10-10")
    // Early morning in Nepal is still the previous UTC day.
    expect(nepalTodayYmd(new Date("2026-10-08T19:00:00Z"))).toBe("2026-10-09")
  })

  it("rolls over month and year boundaries", () => {
    expect(nepalTodayYmd(new Date("2026-12-31T18:15:00Z"))).toBe("2027-01-01")
  })
})

describe("resolveDateBounds", () => {
  const today = "2026-10-09"

  it("caps max at today by default", () => {
    expect(resolveDateBounds({ today })).toEqual({ min: undefined, max: today })
  })

  it("keeps an earlier explicit max", () => {
    expect(resolveDateBounds({ max: "2026-01-01", today })).toEqual({ min: undefined, max: "2026-01-01" })
  })

  it("caps a later explicit max at today", () => {
    expect(resolveDateBounds({ max: "2030-01-01", today })).toEqual({ min: undefined, max: today })
  })

  it("keeps min untouched", () => {
    expect(resolveDateBounds({ min: "2026-01-01", today })).toEqual({ min: "2026-01-01", max: today })
  })

  it("lets allowFuture fields go past today, keeping their own bounds", () => {
    expect(resolveDateBounds({ allowFuture: true, today })).toEqual({ min: undefined, max: undefined })
    expect(resolveDateBounds({ allowFuture: true, min: today, max: "2030-01-01", today })).toEqual({
      min: today,
      max: "2030-01-01",
    })
  })

  it("ignores malformed bounds", () => {
    expect(resolveDateBounds({ min: "nope", max: "2026-02-30", today })).toEqual({ min: undefined, max: today })
  })

  it("defaults today to the Nepal date", () => {
    expect(resolveDateBounds().max).toBe(nepalTodayYmd())
  })
})

describe("isDateAllowed", () => {
  const bounds = { min: "2026-01-01", max: "2026-10-09" }

  it("is inclusive at both ends", () => {
    expect(isDateAllowed("2026-01-01", bounds)).toBe(true)
    expect(isDateAllowed("2026-10-09", bounds)).toBe(true)
  })

  it("blocks dates outside the bounds and invalid strings", () => {
    expect(isDateAllowed("2025-12-31", bounds)).toBe(false)
    expect(isDateAllowed("2026-10-10", bounds)).toBe(false)
    expect(isDateAllowed("2026-02-30", bounds)).toBe(false)
    expect(isDateAllowed("", bounds)).toBe(false)
  })

  it("allows anything valid with open bounds", () => {
    expect(isDateAllowed("2099-01-01", {})).toBe(true)
  })
})

describe("clampYmd", () => {
  const bounds = { min: "2026-01-01", max: "2026-10-09" }

  it("clamps into range", () => {
    expect(clampYmd("2027-05-01", bounds)).toBe("2026-10-09")
    expect(clampYmd("2025-05-01", bounds)).toBe("2026-01-01")
    expect(clampYmd("2026-06-15", bounds)).toBe("2026-06-15")
  })

  it("returns empty for invalid input", () => {
    expect(clampYmd("bad", bounds)).toBe("")
  })
})

describe("clampYmdRange", () => {
  const bounds = { max: "2026-10-09" }

  it("clamps the end of a range that runs past today", () => {
    expect(clampYmdRange({ from: "2026-10-01", to: "2026-10-31" }, bounds)).toEqual({
      from: "2026-10-01",
      to: "2026-10-09",
    })
  })

  it("clamps a range entirely in the future down to today", () => {
    expect(clampYmdRange({ from: "2026-11-01", to: "2026-11-30" }, bounds)).toEqual({
      from: "2026-10-09",
      to: "2026-10-09",
    })
  })

  it("swaps reversed ends", () => {
    expect(clampYmdRange({ from: "2026-09-30", to: "2026-09-01" }, bounds)).toEqual({
      from: "2026-09-01",
      to: "2026-09-30",
    })
  })

  it("returns null for invalid ends", () => {
    expect(clampYmdRange({ from: "", to: "2026-09-01" }, bounds)).toBeNull()
  })
})
