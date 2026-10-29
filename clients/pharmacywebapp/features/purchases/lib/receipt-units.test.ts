import { describe, expect, it } from "vitest"
import {
  formatReceiptQuantity,
  initialReceiptSellingPrice,
  orderedRateText,
  proportionalFreeQuantity,
  receiptLineGross,
  receiptRateToSend,
} from "./receipt-units"

const boxed = { units_per_pack: 10, unit_label: "Strip", form: "Tablet", packs_per_box: 10, box_label: null }
const stripped = { units_per_pack: 10, unit_label: "Strip", form: "Tablet" }

describe("formatReceiptQuantity", () => {
  it("shows boxes and strips next to the tablets", () => {
    expect(formatReceiptQuantity(300, boxed)).toBe("300 tablets (3 boxes)")
    expect(formatReceiptQuantity(350, boxed)).toBe("350 tablets (3 boxes 5 strips)")
    expect(formatReceiptQuantity(35, stripped)).toBe("35 tablets (3 strips + 5)")
  })

  it("falls back to the base count when there is nothing to break down", () => {
    expect(formatReceiptQuantity(8, stripped)).toBe("8 tablets")
    expect(formatReceiptQuantity(12, { unit_label: "Bottle" })).toBe("12 bottles")
    expect(formatReceiptQuantity(12, null)).toBe("12")
  })
})

describe("initialReceiptSellingPrice", () => {
  it("keeps the order's price, else takes the catalog price", () => {
    expect(initialReceiptSellingPrice(4.5, "3.00")).toBe("4.5")
    expect(initialReceiptSellingPrice(null, "3")).toBe("3.00")
    expect(initialReceiptSellingPrice(null, "0.00", 95)).toBe("95.00")
    expect(initialReceiptSellingPrice(null, "0.00", null)).toBe("")
    expect(initialReceiptSellingPrice(0, "2.5")).toBe("2.50")
  })

  it("stays blank when no price is known", () => {
    expect(initialReceiptSellingPrice(null, null)).toBe("")
    expect(initialReceiptSellingPrice(null, "0")).toBe("")
  })
})

describe("receipt rate", () => {
  it("starts at the ordered rate, per pack for a pack line", () => {
    expect(orderedRateText({ unit_cost: "5.00", pack_unit_cost: null })).toBe("5")
    expect(orderedRateText({ unit_cost: "0.85", pack_unit_cost: 85 })).toBe("85")
  })

  it("sends nothing while the rate reads as ordered, else the typed rate", () => {
    expect(receiptRateToSend("5", "5")).toBeNull()
    expect(receiptRateToSend("5.00", "5")).toBeNull()
    expect(receiptRateToSend("  ", "5")).toBeNull()
    expect(receiptRateToSend("6.5", "5")).toBe(6.5)
    expect(() => receiptRateToSend("abc", "5")).toThrow()
  })
})

describe("proportionalFreeQuantity", () => {
  it("gives all the free goods for a full delivery and a rounded-down share for a short one", () => {
    expect(proportionalFreeQuantity(10, 2, 10)).toBe(2)
    expect(proportionalFreeQuantity(10, 1, 6)).toBe(0)
    expect(proportionalFreeQuantity(100, 10, 55)).toBe(5)
    expect(proportionalFreeQuantity(10, 2, 0)).toBe(0)
  })
})

describe("receiptLineGross", () => {
  it("is quantity x rate, or packs x pack rate", () => {
    expect(receiptLineGross(10, 6, null)).toBe(60)
    expect(receiptLineGross(30, 85, 10)).toBe(255)
  })
})
