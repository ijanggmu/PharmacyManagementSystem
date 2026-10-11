import { describe, expect, it } from "vitest"
import type { Medicine, MedicineBatch } from "@/features/medicines/api-client"
import { estimatedUnitCost, lineVat, medicineStock, returnableBatches } from "./supplier-return-math"

const med = (over: Partial<Medicine> = {}) => ({ stock_quantity: 50, branch_stock_quantity: 12, is_taxable: true, ...over }) as Medicine

const batch = (over: Partial<MedicineBatch>): MedicineBatch => ({
  id: "b",
  batch_number: "B",
  expiry_date: "2027-01-01",
  quantity_received: 10,
  quantity_remaining: 5,
  selling_price: 10,
  cost_price: 8,
  rack_location: null,
  received_at: "2026-01-01",
  recalled_at: null,
  recall_reason: null,
  branches: { id: "br1", name: "Main", code: "MAIN" },
  ...over,
})

describe("medicineStock", () => {
  it("prefers this branch's stock", () => {
    expect(medicineStock(med())).toBe(12)
    expect(medicineStock(med({ branch_stock_quantity: undefined }))).toBe(50)
  })
})

describe("lineVat", () => {
  it("reverses VAT on taxable lines from a VAT bill", () => {
    expect(lineVat({ medicine: med(), quantity: 3, unitCost: 10 }, true, 13)).toBe(3.9)
  })
  it("is zero for exempt medicines or a non-VAT bill", () => {
    expect(lineVat({ medicine: med({ is_taxable: false }), quantity: 3, unitCost: 10 }, true, 13)).toBe(0)
    expect(lineVat({ medicine: med(), quantity: 3, unitCost: 10 }, false, 13)).toBe(0)
  })
})

describe("returnableBatches", () => {
  it("keeps this branch's lots with stock, soonest expiry first", () => {
    const result = returnableBatches(
      [
        batch({ id: "late", expiry_date: "2028-01-01" }),
        batch({ id: "empty", quantity_remaining: 0 }),
        batch({ id: "disposed", is_disposed: true }),
        batch({ id: "other-branch", branches: { id: "br2", name: "B", code: "B" } }),
        batch({ id: "soon", expiry_date: "2026-12-01" }),
      ],
      "br1",
    )
    expect(result.map((b) => b.id)).toEqual(["soon", "late"])
  })
})

describe("estimatedUnitCost", () => {
  it("uses the named batch's cost first", () => {
    expect(estimatedUnitCost(med({ cost_price: "5.00", unit_price: "20.00" }), batch({ cost_price: 8 }))).toBe(8)
  })
  it("falls back to the medicine's purchase cost, never the selling price", () => {
    expect(estimatedUnitCost(med({ cost_price: "5.00", unit_price: "20.00" }), null)).toBe(5)
    expect(estimatedUnitCost(med({ cost_price: "0", unit_price: "20.00" }), batch({ cost_price: 0 }))).toBe(0)
  })
})
