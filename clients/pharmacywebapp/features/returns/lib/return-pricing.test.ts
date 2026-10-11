import { describe, expect, it } from "vitest"
import {
  alreadyReversedQuantity,
  effectiveUnitPrice,
  includedVat,
  netRefundAmount,
  remainingReversibleQuantity,
  returnLineAmount,
} from "./return-pricing"

describe("returnLineAmount", () => {
  // 3 sold at 100 with 10% off: line total 270.
  const line = { quantity: 3, lineTotal: "270.00" }

  it("prices returned units at the discounted (effective) price", () => {
    expect(returnLineAmount(line, 1)).toBe(90)
    expect(effectiveUnitPrice(line)).toBe(90)
  })

  it("returns the exact line total for the whole line", () => {
    expect(returnLineAmount({ quantity: 3, lineTotal: 100 }, 3)).toBe(100)
    expect(returnLineAmount({ quantity: 3, lineTotal: 100 }, 1)).toBe(33.33)
  })

  it("is zero for nothing returned", () => {
    expect(returnLineAmount(line, 0)).toBe(0)
  })
})

describe("includedVat", () => {
  it("carves VAT out of taxable lines only (prices are VAT-inclusive)", () => {
    expect(includedVat([{ amount: 113 }, { amount: 50, isTaxable: false }], 13)).toBe(13)
  })

  it("is null without a stored rate", () => {
    expect(includedVat([{ amount: 113 }], null)).toBeNull()
  })
})

describe("netRefundAmount", () => {
  it("subtracts the processing fee and never adds VAT", () => {
    expect(netRefundAmount(113, 10)).toBe(103)
    expect(netRefundAmount(5, 10)).toBe(0)
  })
})

describe("returnLineAmount after earlier returns/refunds", () => {
  const line = { quantity: 3, lineTotal: 100 }

  it("gives the last portion exactly what is left of the line", () => {
    // 1 of 3 already returned for 33.33 -> the last 2 take 66.67, so the pieces add up to 100.
    expect(returnLineAmount(line, 2, { quantity: 1, amount: 33.33 })).toBe(66.67)
    expect(returnLineAmount(line, 1, { quantity: 2, amount: 66.66 })).toBe(33.34)
  })

  it("estimates what was already given back when only the quantity is known", () => {
    expect(returnLineAmount(line, 2, { quantity: 1 })).toBe(66.67)
  })

  it("prices a middle portion pro rata", () => {
    expect(returnLineAmount({ quantity: 4, lineTotal: 100 }, 1, { quantity: 1 })).toBe(25)
  })
})

describe("remainingReversibleQuantity", () => {
  it("subtracts returned and refunded units", () => {
    expect(remainingReversibleQuantity({ quantity: 5, returned_quantity: 2, refunded_quantity: 1 })).toBe(2)
    expect(remainingReversibleQuantity({ quantity: 5 })).toBe(5)
    expect(remainingReversibleQuantity({ quantity: 2, returned_quantity: 3 })).toBe(0)
    expect(alreadyReversedQuantity({ returned_quantity: 2, refunded_quantity: 1 })).toBe(3)
  })
})
