import { describe, expect, it } from "vitest"
import { posLineTotal, posSubtotal, posTotal, posUnitPrice } from "./pos-pricing"

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
