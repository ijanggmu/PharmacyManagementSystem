import { describe, expect, it } from "vitest"
import { currentBsMonthRange, isValidYmdRange, summarizeExpenses } from "./expense-period"

describe("currentBsMonthRange", () => {
  it("covers the BS month from its first day up to today", () => {
    // 2026-10-08 is 22 Ashwin 2083, so Ashwin began on 2026-09-17.
    expect(currentBsMonthRange("2026-10-08")).toEqual({ from: "2026-09-17", to: "2026-10-08", label: "Ashwin 2083" })
  })

  it("starts a new range on the first day of the next BS month, not the AD month", () => {
    const r = currentBsMonthRange("2026-10-01")
    expect(r.from).toBe("2026-09-17")
    expect(r.label).toBe("Ashwin 2083")
    const first = currentBsMonthRange(r.from)
    expect(first).toEqual({ from: "2026-09-17", to: "2026-09-17", label: "Ashwin 2083" })
    const lastOfBhadra = currentBsMonthRange("2026-09-16")
    expect(lastOfBhadra.label).toBe("Bhadra 2083")
    expect(lastOfBhadra.to).toBe("2026-09-16")
  })
})

describe("summarizeExpenses", () => {
  it("totals amounts and picks the largest category", () => {
    const s = summarizeExpenses([
      { amount: 1000, category: "rent" },
      { amount: 300.5, category: "utilities" },
      { amount: 800, category: "utilities" },
    ])
    expect(s).toEqual({ total: 2100.5, count: 3, topCategory: { category: "utilities", amount: 1100.5 } })
  })

  it("handles no expenses", () => {
    expect(summarizeExpenses([])).toEqual({ total: 0, count: 0, topCategory: null })
  })
})

describe("isValidYmdRange", () => {
  it("accepts open-ended and ordered ranges, rejects inverted ones", () => {
    expect(isValidYmdRange("", "")).toBe(true)
    expect(isValidYmdRange("2026-10-01", "")).toBe(true)
    expect(isValidYmdRange("2026-10-01", "2026-10-01")).toBe(true)
    expect(isValidYmdRange("2026-10-02", "2026-10-01")).toBe(false)
  })
})
