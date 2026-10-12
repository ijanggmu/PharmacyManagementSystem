import { describe, expect, it } from "vitest"
import { medicineSellingPrice, priceCartLine } from "./cart-pricing"
import type { FefoPick } from "@/lib/inventory/fefo"

const picks: FefoPick[] = [
  { batch_number: "A", expiry_date: "2026-12-01", rack_location: null, quantity_remaining: 2, selling_price: 10 },
  { batch_number: "B", expiry_date: "2027-03-01", rack_location: null, quantity_remaining: 10, selling_price: 12 },
]

describe("medicineSellingPrice", () => {
  it("is the first lot's batch price, not the medicine's own price", () => {
    expect(medicineSellingPrice({ unit_price: "9.00", fefo_picks: picks })).toBe(10)
  })

  it("uses the medicine's price only when no lot is on file", () => {
    expect(medicineSellingPrice({ unit_price: "9.00", fefo_picks: [] })).toBe(9)
  })
})

describe("priceCartLine", () => {
  it("keeps quantity x unitPrice equal to the gross across two lot prices", () => {
    const line = priceCartLine({ fefoPicks: picks, basePrice: 10 }, 5, 0)
    expect(line.totalPrice).toBe(2 * 10 + 3 * 12)
    expect(line.unitPrice * 5).toBeCloseTo(56, 10)
  })

  it("applies the percent discount to the batch-priced gross", () => {
    expect(priceCartLine({ fefoPicks: picks, basePrice: 10 }, 2, 10).totalPrice).toBe(18)
  })
})
