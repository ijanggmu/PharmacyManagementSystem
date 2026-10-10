import { describe, expect, it } from "vitest"
import { effectivePurchaseVat, formatRate, suggestedPurchaseVat } from "./purchase-vat"

describe("suggestedPurchaseVat", () => {
  it("is quantity × cost × rate for a taxable medicine", () => {
    expect(suggestedPurchaseVat(100, 2, 13, true)).toBe(26)
    expect(suggestedPurchaseVat(3, 1.15, 13, true)).toBe(0.45)
  })

  it("is 0 for an exempt medicine, a 0% rate, or no stock/cost", () => {
    expect(suggestedPurchaseVat(100, 2, 13, false)).toBe(0)
    expect(suggestedPurchaseVat(100, 2, 0, true)).toBe(0)
    expect(suggestedPurchaseVat(0, 2, 13, true)).toBe(0)
    expect(suggestedPurchaseVat(10, 0, 13, true)).toBe(0)
  })
})

describe("effectivePurchaseVat", () => {
  it("never sends VAT for an exempt medicine, even if typed", () => {
    expect(effectivePurchaseVat(10, 5, 13, false, 6.5)).toBe(0)
  })

  it("uses the typed amount for a taxable medicine", () => {
    expect(effectivePurchaseVat(10, 5, 13, true, 6)).toBe(6)
    expect(effectivePurchaseVat(10, 5, 13, true, 0)).toBe(0)
  })

  it("falls back to the suggestion when nothing was typed", () => {
    expect(effectivePurchaseVat(10, 5, 13, true, null)).toBe(6.5)
    expect(effectivePurchaseVat(10, 5, 13, true, undefined)).toBe(6.5)
  })
})

describe("formatRate", () => {
  it("drops trailing zeros", () => {
    expect(formatRate(13)).toBe("13%")
    expect(formatRate(12.5)).toBe("12.5%")
  })
})
