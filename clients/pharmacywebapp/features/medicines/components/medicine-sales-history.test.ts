import { describe, expect, it } from "vitest"
import type { Sale } from "@/features/sales/api-client"
import { medicineLineTotals } from "./medicine-sales-history"

const sale = {
  sale_items: [
    { medicine_id: "m-1", quantity: 2, total_price: "50.00" },
    { medicine_id: "m-2", quantity: 1, total_price: "30.00" },
    { medicine_id: "m-1", quantity: 3, total_price: "75.00" },
  ],
} as unknown as Sale

describe("medicineLineTotals", () => {
  it("sums every line of the medicine on the sale", () => {
    expect(medicineLineTotals(sale, "m-1")).toEqual({ quantity: 5, amount: 125 })
  })

  it("returns zeros when the sale has no line of the medicine", () => {
    expect(medicineLineTotals(sale, "m-9")).toEqual({ quantity: 0, amount: 0 })
    expect(medicineLineTotals({} as Sale, "m-1")).toEqual({ quantity: 0, amount: 0 })
  })
})
