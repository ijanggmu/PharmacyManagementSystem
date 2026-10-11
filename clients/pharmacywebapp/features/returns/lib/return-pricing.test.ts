import { describe, expect, it } from "vitest"
import { effectiveUnitPrice, includedVat, netRefundAmount, returnLineAmount } from "./return-pricing"

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
