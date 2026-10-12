import { describe, expect, it } from "vitest"
import { paidUnitPrice } from "./paid-price"

describe("paidUnitPrice", () => {
  it("is the after-discount price, not the list price", () => {
    // 4 at Rs 25 with Rs 20 off: the customer paid 80, i.e. 20 a unit.
    expect(paidUnitPrice({ quantity: 4, unit_price: "25.00", total_price: "80.00" })).toBe(20)
  })

  it("keeps enough precision that a full return adds back up to the line total", () => {
    const unit = paidUnitPrice({ quantity: 3, unit_price: "40.00", total_price: "100.00" })
    expect(Math.round(unit * 3 * 100) / 100).toBe(100)
  })
})
