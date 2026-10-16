import { describe, expect, it } from "vitest"
import {
  reorderUnitCost,
  buildLowStockLines,
  dominantSupplierId,
  isLowStock,
  suggestReorderQuantity,
  type LowStockMedicine,
} from "./low-stock"

function medicine(overrides: Partial<LowStockMedicine> & { id: string }): LowStockMedicine {
  return {
    name: overrides.id,
    supplier_id: "s1",
    stock_quantity: 0,
    minimum_stock: 10,
    maximum_stock: 0,
    cost_price: "5.00",
    ...overrides,
  }
}

describe("suggestReorderQuantity", () => {
  it("refills to twice the reorder level when no maximum is set", () => {
    expect(suggestReorderQuantity({ onHand: 4, reorderLevel: 10 })).toBe(16)
    expect(suggestReorderQuantity({ onHand: 0, reorderLevel: 10, maximumStock: 0 })).toBe(20)
    expect(suggestReorderQuantity({ onHand: 10, reorderLevel: 10, maximumStock: null })).toBe(10)
  })

  it("refills to the maximum stock when one is set", () => {
    expect(suggestReorderQuantity({ onHand: 4, reorderLevel: 10, maximumStock: 50 })).toBe(46)
  })

  it("never suggests less than 1", () => {
    expect(suggestReorderQuantity({ onHand: 0, reorderLevel: 0 })).toBe(1)
    expect(suggestReorderQuantity({ onHand: 60, reorderLevel: 10, maximumStock: 50 })).toBe(1)
  })

  it("rounds fractional quantities up and treats negative stock as zero", () => {
    expect(suggestReorderQuantity({ onHand: 2.5, reorderLevel: 5 })).toBe(8)
    expect(suggestReorderQuantity({ onHand: -3, reorderLevel: 5 })).toBe(10)
  })

  it("keeps at least the shortfall for odd reorder levels", () => {
    expect(suggestReorderQuantity({ onHand: 0, reorderLevel: -2 })).toBe(1)
  })
})

describe("isLowStock", () => {
  it("is true at or below the reorder level and when out of stock", () => {
    expect(isLowStock(10, 10)).toBe(true)
    expect(isLowStock(11, 10)).toBe(false)
    expect(isLowStock(0, 0)).toBe(true)
  })
})

describe("buildLowStockLines", () => {
  const medicines = [
    medicine({ id: "plenty", stock_quantity: 50 }),
    medicine({ id: "low", name: "Low", stock_quantity: 8, cost_price: "12.5" }),
    medicine({ id: "out", name: "Out", stock_quantity: 0, maximum_stock: 30 }),
    medicine({ id: "other", name: "Other", stock_quantity: 1, supplier_id: "s2" }),
    medicine({ id: "nosupplier", name: "No supplier", stock_quantity: 2, supplier_id: null }),
  ]

  it("keeps only low-stock medicines, most urgent first, with quantity and last cost", () => {
    const lines = buildLowStockLines(medicines)
    expect(lines.map((l) => l.medicine_id)).toEqual(["out", "other", "nosupplier", "low"])
    const out = lines[0]
    expect(out.quantity_ordered).toBe(30)
    const low = lines.find((l) => l.medicine_id === "low")
    expect(low).toMatchObject({ quantity_ordered: 12, unit_cost: "12.50", on_hand: 8, reorder_level: 10 })
  })

  it("filters by supplier", () => {
    const lines = buildLowStockLines(medicines, { supplierId: "s2" })
    expect(lines.map((l) => l.medicine_id)).toEqual(["other"])
  })

  it("skips medicines already on the order and duplicates", () => {
    const lines = buildLowStockLines([...medicines, medicine({ id: "low", stock_quantity: 1 })], {
      excludeMedicineIds: ["out"],
    })
    expect(lines.map((l) => l.medicine_id)).not.toContain("out")
    expect(lines.filter((l) => l.medicine_id === "low")).toHaveLength(1)
  })

  it("falls back to a zero cost for an unparseable price", () => {
    const [line] = buildLowStockLines([medicine({ id: "x", cost_price: "n/a" })])
    expect(line.unit_cost).toBe("0.00")
  })
})

describe("dominantSupplierId", () => {
  it("picks the supplier most lines come from, ties to the most urgent", () => {
    expect(dominantSupplierId([{ supplier_id: "a" }, { supplier_id: "b" }, { supplier_id: "b" }])).toBe("b")
    expect(dominantSupplierId([{ supplier_id: "a" }, { supplier_id: "b" }])).toBe("a")
    expect(dominantSupplierId([{ supplier_id: null }])).toBeNull()
  })
})

describe("reorderUnitCost", () => {
  it("costs a reorder line at the latest purchase cost, not the medicine's creation-time cost", () => {
    expect(reorderUnitCost({ cost_price: "0.00", latest_cost_price: 64.13 })).toBe(64.13)
    expect(reorderUnitCost({ cost_price: "12.00", latest_cost_price: null })).toBe("12.00")
    expect(reorderUnitCost({ cost_price: "12.00", latest_cost_price: 0 })).toBe("12.00")
  })
})
