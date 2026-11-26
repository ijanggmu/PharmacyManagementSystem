import { describe, expect, it } from "vitest"
import { formatExportDate, formatExportDateTime } from "./date"

describe("formatExportDate", () => {
  it("keeps a date-only string as-is (no UTC shift)", () => {
    expect(formatExportDate("2026-01-05")).toBe("2026-01-05")
  })

  it("formats a Date and an ISO timestamp as local YYYY-MM-DD", () => {
    expect(formatExportDate(new Date(2026, 2, 9, 23, 30))).toBe("2026-03-09")
    const local = new Date(2026, 10, 26, 8, 5)
    expect(formatExportDate(local.toISOString())).toBe("2026-11-26")
  })

  it("returns empty for missing or invalid values", () => {
    expect(formatExportDate(null)).toBe("")
    expect(formatExportDate(undefined)).toBe("")
    expect(formatExportDate("")).toBe("")
    expect(formatExportDate("not a date")).toBe("")
  })
})

describe("formatExportDateTime", () => {
  it("formats as local YYYY-MM-DD HH:mm", () => {
    expect(formatExportDateTime(new Date(2026, 0, 2, 7, 4))).toBe("2026-01-02 07:04")
    const local = new Date(2026, 10, 26, 18, 45)
    expect(formatExportDateTime(local.toISOString())).toBe("2026-11-26 18:45")
  })

  it("returns empty for missing or invalid values", () => {
    expect(formatExportDateTime(null)).toBe("")
    expect(formatExportDateTime("garbage")).toBe("")
  })
})
