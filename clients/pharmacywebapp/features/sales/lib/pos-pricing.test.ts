import { describe, expect, it } from "vitest"
import { posLineTotal, posPriceLine, posSubtotal, posTotal, posUnitPrice } from "./pos-pricing"

describe("posUnitPrice", () => {
  it("uses the first FEFO lot's selling price when above zero", () => {
    expect(posUnitPrice({ unit_price: "10.00", fefo_picks: [{ selling_price: 12.5 }, { selling_price: 9 }] })).toBe(12.5)
  })

  it("falls back to the catalog price when the lot has no price", () => {
    expect(posUnitPrice({ unit_price: "10.00", fefo_picks: [{ selling_price: 0 }] })).toBe(10)
    expect(posUnitPrice({ unit_price: "10.00", fefo_picks: [{}] })).toBe(10)
    expect(posUnitPrice({ unit_price: 7.25 })).toBe(7.25)
  })
})

describe("posLineTotal", () => {
  it("rounds the percent discount half away from zero like the server", () => {
    // gross 33.30, 15% = 4.995 -> 5.00 off
    expect(posLineTotal(3, 11.1, 15)).toBe(28.3)
  })

  it("has no discount by default", () => {
    expect(posLineTotal(3, 0.1)).toBe(0.3)
  })
})

describe("posSubtotal / posTotal", () => {
  it("sums in paisa and applies the rounded order discount", () => {
    const subtotal = posSubtotal([{ totalPrice: 0.1 }, { totalPrice: 0.2 }])
    expect(subtotal).toBe(0.3)
    expect(posTotal(100, 10.005)).toBe(89.99)
  })
})

describe("posPriceLine", () => {
  const lot = (batch_number: string, quantity_remaining: number, selling_price: number) => ({
    batch_number,
    quantity_remaining,
    selling_price,
  })

  it("charges each unit at the price of the lot it is taken from", () => {
    const priced = posPriceLine([lot("A", 2, 10), lot("B", 5, 12)], 99, 3)
    expect(priced.totalPrice).toBe(32)
    expect(priced.unitPrice).toBeCloseTo(32 / 3)
    expect(priced.mixedPrices).toBe(true)
    expect(priced.unpricedBatch).toBeNull()
  })

  it("rounds the percent discount per lot, as the server's per-lot sale lines do", () => {
    // Lot A: 1 x 10.05 less 10% (1.005 -> 1.01) = 9.04; lot B: 1 x 10.15 less 10% (1.015 -> 1.02) = 9.13.
    expect(posPriceLine([lot("A", 1, 10.05), lot("B", 1, 10.15)], 0, 2, 10).totalPrice).toBe(18.17)
  })

  it("flags a lot with no selling price", () => {
    const priced = posPriceLine([lot("A", 1, 10), lot("NOPRICE", 4, 0)], 10, 3)
    expect(priced.unpricedBatch).toBe("NOPRICE")
  })

  it("uses the catalog price only for units with no lot on file", () => {
    const priced = posPriceLine([], 25, 2)
    expect(priced.totalPrice).toBe(50)
    expect(priced.mixedPrices).toBe(false)
  })
})
