import { describe, expect, it } from "vitest"
import { computeInclusiveVat, formatVatRate, roundMoneyAwayFromZero, type VatCartLine } from "./vat"

function line(quantity: number, unitPrice: number, isTaxable = true, discountPercent = 0): VatCartLine {
  return { quantity, unitPrice, totalPrice: quantity * unitPrice * (1 - discountPercent / 100), discountPercent, isTaxable }
}

describe("computeInclusiveVat", () => {
  it("carves VAT out of an all-taxable cart (113 at 13% holds 13)", () => {
    expect(computeInclusiveVat([line(1, 113)], 13)).toBe(13)
    expect(computeInclusiveVat([line(2, 56.5), line(1, 113)], 13)).toBe(26)
  })

  it("leaves exempt lines out of a mixed cart", () => {
    // Only the 113 taxable line carries VAT; the 500 exempt line carries none.
    expect(computeInclusiveVat([line(1, 113), line(5, 100, false)], 13)).toBe(13)
  })

  it("is zero when every line is exempt", () => {
    expect(computeInclusiveVat([line(1, 113, false), line(3, 20, false)], 13)).toBe(0)
  })

  it("is zero at a 0% rate", () => {
    expect(computeInclusiveVat([line(1, 113)], 0)).toBe(0)
  })

  it("is zero for an empty cart", () => {
    expect(computeInclusiveVat([], 13)).toBe(0)
  })

  it("rounds half away from zero to 2 dp", () => {
    // 100 × 13 / 113 = 11.504424… → 11.50
    expect(computeInclusiveVat([line(1, 100)], 13)).toBe(11.5)
    // 0.01 × 100 / 200 = 0.005 → 0.01 (banker's rounding would give 0.00)
    expect(computeInclusiveVat([line(1, 0.01)], 100)).toBe(0.01)
    // 2.05 × 100 / 200 = 1.025 → 1.03 (binary floating point holds 1.02499…)
    expect(computeInclusiveVat([line(1, 2.05)], 100)).toBe(1.03)
  })

  it("supports a fractional rate", () => {
    // 227 × 13.5 / 113.5 = 27.0
    expect(computeInclusiveVat([line(1, 227)], 13.5)).toBe(27)
  })

  it("applies the line percent discount rounded to 2 dp before VAT", () => {
    // gross 113, 10% off = 11.30 → line total 101.70; VAT = 101.70 × 13 / 113 = 11.70
    expect(computeInclusiveVat([line(1, 113, true, 10)], 13)).toBe(11.7)
  })

  it("splits the order discount across lines so only the taxable share reduces VAT", () => {
    // Lines 113 (taxable) and 113 (exempt); a 22.60 order discount takes 11.30 from each.
    // Taxable total 101.70 → VAT 11.70.
    expect(computeInclusiveVat([line(1, 113), line(1, 113, false)], 13, 22.6)).toBe(11.7)
  })

  it("treats a line with no isTaxable flag as taxable", () => {
    expect(computeInclusiveVat([{ quantity: 1, unitPrice: 113, totalPrice: 113 }], 13)).toBe(13)
  })
})

describe("roundMoneyAwayFromZero", () => {
  it("rounds midpoints away from zero despite floating point noise", () => {
    expect(roundMoneyAwayFromZero(1.005)).toBe(1.01)
    expect(roundMoneyAwayFromZero(-1.005)).toBe(-1.01)
    expect(roundMoneyAwayFromZero(2.344)).toBe(2.34)
  })
})

describe("formatVatRate", () => {
  it("drops trailing zeros", () => {
    expect(formatVatRate(13)).toBe("13%")
    expect(formatVatRate(13.5)).toBe("13.5%")
    expect(formatVatRate(0)).toBe("0%")
  })
})
