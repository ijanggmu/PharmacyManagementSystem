import { describe, expect, it } from "vitest"
import {
  allocateBillDiscount,
  billDiscountBody,
  boxSize,
  computePurchaseBill,
  packFactor,
  formatPurchaseQuantity,
  purchaseLineTermsBody,
  round2,
  type PurchaseLineEntry,
} from "./purchase-bill-totals"

const line = (patch: Partial<PurchaseLineEntry> = {}): PurchaseLineEntry => ({
  quantity: 10,
  freeQuantity: 0,
  rate: 100,
  discountMode: "percent",
  discountValue: 0,
  inPacks: false,
  unitsPerPack: null,
  isTaxable: true,
  vatOverride: null,
  ...patch,
})

describe("round2", () => {
  it("rounds half away from zero", () => {
    expect(round2(1.005)).toBe(1.01)
    expect(round2(24.99975)).toBe(25)
    expect(round2(-1.005)).toBe(-1.01)
  })
})

describe("allocateBillDiscount", () => {
  it("spreads in proportion and adds back exactly", () => {
    expect(allocateBillDiscount([600, 300, 100], 50)).toEqual([30, 15, 5])
  })

  it("gives leftover paisa to the largest remainders, ties to the earlier line", () => {
    const shares = allocateBillDiscount([100, 100, 100], 10)
    expect(shares).toEqual([3.34, 3.33, 3.33])
  })

  it("never goes negative on a tiny discount", () => {
    const shares = allocateBillDiscount([1, 1, 1, 1, 1, 1], 0.03)
    expect(shares.every((s) => s >= 0)).toBe(true)
    expect(round2(shares.reduce((a, b) => a + b, 0))).toBe(0.03)
  })

  it("skips lines with no value", () => {
    expect(allocateBillDiscount([0, 200], 20)).toEqual([0, 20])
  })
})

describe("computePurchaseBill", () => {
  it("matches the server for a 10+1 scheme with trade and bill discounts", () => {
    // A: 10 + 1 free at 100, 10% off (900). B: 5 at 20, exempt (100). Bill discount 50 -> 45 / 5.
    const totals = computePurchaseBill(
      [line({ freeQuantity: 1, discountValue: 10 }), line({ quantity: 5, rate: 20, isTaxable: false })],
      { discountMode: "amount", discountValue: 50 },
      13,
    )

    const [a, b] = totals.lines
    expect(a.gross).toBe(1000)
    expect(a.lineDiscount).toBe(100)
    expect(a.billDiscount).toBe(45)
    expect(a.taxable).toBe(855)
    expect(a.vat).toBe(111.15)
    expect(a.effectiveUnitCost).toBe(77.73)
    expect(b.taxable).toBe(95)
    expect(b.vat).toBe(0)
    expect(b.effectiveUnitCost).toBe(19)

    expect(totals.gross).toBe(1100)
    expect(totals.discount).toBe(150)
    expect(totals.taxable).toBe(855)
    expect(totals.exempt).toBe(95)
    expect(totals.vat).toBe(111.15)
    expect(totals.net).toBe(1061.15)
  })

  it("takes the bill discount as a percent of the discounted total", () => {
    const totals = computePurchaseBill(
      [line({ discountMode: "amount", discountValue: 100 }), line({ quantity: 3, rate: 33.33 })],
      { discountMode: "percent", discountValue: 2 },
      0,
    )
    // (900 + 99.99) × 2% = 19.9998 -> 20.00
    expect(totals.billDiscount).toBe(20)
    expect(round2(totals.lines.reduce((s, l) => s + l.billDiscount, 0))).toBe(20)
  })

  it("converts packs to base units and costs every unit, free ones included", () => {
    // 3 boxes + 1 free box of 10 at Rs 120 a box: 30 + 10 units, gross 360, 9.00 a unit.
    const totals = computePurchaseBill(
      [line({ quantity: 3, freeQuantity: 1, rate: 120, inPacks: true, unitsPerPack: 10, isTaxable: false })],
      { discountMode: "amount", discountValue: 0 },
      13,
    )
    const [l] = totals.lines
    expect(l.baseQuantity).toBe(30)
    expect(l.baseFreeQuantity).toBe(10)
    expect(l.baseRate).toBe(12)
    expect(l.gross).toBe(360)
    expect(l.effectiveUnitCost).toBe(9)
  })

  it("uses a typed VAT figure, but never on an exempt line", () => {
    const totals = computePurchaseBill(
      [line({ vatOverride: 120 }), line({ isTaxable: false, vatOverride: 50 })],
      { discountMode: "amount", discountValue: 0 },
      13,
    )
    expect(totals.lines.map((l) => l.vat)).toEqual([120, 0])
  })

  it("caps a discount at the line and bill amount", () => {
    const totals = computePurchaseBill(
      [line({ quantity: 1, rate: 50, discountMode: "amount", discountValue: 80 })],
      { discountMode: "amount", discountValue: 10 },
      13,
    )
    expect(totals.lines[0].lineDiscount).toBe(50)
    expect(totals.billDiscount).toBe(0)
    expect(totals.net).toBe(0)
  })
})

describe("request bodies", () => {
  it("sends the percent or the amount, and packs only when the medicine has a pack size", () => {
    expect(purchaseLineTermsBody(line({ freeQuantity: 1, discountValue: 10 }))).toEqual({
      freeQuantity: 1,
      discountPercent: 10,
      discountAmount: 0,
      inPacks: false,
      inBoxes: false,
    })
    expect(purchaseLineTermsBody(line({ discountMode: "amount", discountValue: 12.345, inPacks: true, unitsPerPack: 10 }))).toEqual({
      freeQuantity: 0,
      discountPercent: 0,
      discountAmount: 12.35,
      inPacks: true,
      inBoxes: false,
    })
    expect(purchaseLineTermsBody(line({ inPacks: true, unitsPerPack: null })).inPacks).toBe(false)
    expect(billDiscountBody({ discountMode: "percent", discountValue: 2.5 })).toEqual({ billDiscountPercent: 2.5, billDiscountAmount: 0 })
  })

  it("sends boxes only when the medicine has a box, never together with packs", () => {
    expect(purchaseLineTermsBody(line({ inBoxes: true, unitsPerPack: 10, packsPerBox: 5 }))).toMatchObject({ inPacks: false, inBoxes: true })
    expect(purchaseLineTermsBody(line({ inBoxes: true, inPacks: true, unitsPerPack: 10, packsPerBox: 5 }))).toMatchObject({ inPacks: false, inBoxes: true })
    expect(purchaseLineTermsBody(line({ inBoxes: true, unitsPerPack: 10, packsPerBox: null }))).toMatchObject({ inPacks: false, inBoxes: false })
    expect(purchaseLineTermsBody(line({ inBoxes: true, inPacks: true, unitsPerPack: 10, packsPerBox: null }))).toMatchObject({ inPacks: true, inBoxes: false })
  })
})

describe("boxes", () => {
  it("converts boxes to base units with the box size", () => {
    // 2 boxes + 1 free of 5 strips x 10 at Rs 400 a box: 100 + 50 units, gross 800, Rs 8 billed a unit.
    expect(packFactor({ inPacks: false, unitsPerPack: 10, inBoxes: true, packsPerBox: 5 })).toBe(50)
    expect(packFactor({ inPacks: true, unitsPerPack: 10, inBoxes: true, packsPerBox: null })).toBe(10)
    expect(boxSize({ unitsPerPack: 10, packsPerBox: 5 })).toBe(50)
    expect(boxSize({ unitsPerPack: null, packsPerBox: 5 })).toBe(0)
    const [l] = computePurchaseBill(
      [line({ quantity: 2, freeQuantity: 1, rate: 400, inBoxes: true, unitsPerPack: 10, packsPerBox: 5, isTaxable: false })],
      { discountMode: "amount", discountValue: 0 },
      13,
    ).lines
    expect(l.baseQuantity).toBe(100)
    expect(l.baseFreeQuantity).toBe(50)
    expect(l.baseRate).toBe(8)
    expect(l.gross).toBe(800)
    expect(l.effectiveUnitCost).toBe(5.33)
  })
})

describe("formatPurchaseQuantity", () => {
  it("shows packs and free goods", () => {
    expect(formatPurchaseQuantity(10, 1)).toBe("10 + 1 free")
    expect(formatPurchaseQuantity(30, 10, 10, "tab")).toBe("3 × 10 (30 tab) + 10 free")
    expect(formatPurchaseQuantity(5, 0)).toBe("5")
  })
})
