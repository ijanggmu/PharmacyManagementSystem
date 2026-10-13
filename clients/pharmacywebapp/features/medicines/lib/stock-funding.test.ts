import { describe, expect, it } from "vitest"
import { toDotnetAddMedicineStockCommand, toDotnetCreateMedicineCommand, toDotnetStockFunding } from "@/lib/api/catalog-api"
import {
  isStockFunding,
  STOCK_FUNDING_OPTIONS,
  stockFundingForRequest,
  stockFundingPostingHint,
  validateStockFunding,
} from "@/features/medicines/lib/stock-funding"

describe("stock funding (stock without a supplier bill)", () => {
  it("offers opening stock, cash and bank", () => {
    expect(STOCK_FUNDING_OPTIONS.map((o) => o.value)).toEqual(["opening_stock", "cash", "bank"])
    expect(isStockFunding("cash")).toBe(true)
    expect(isStockFunding("cheque")).toBe(false)
    expect(isStockFunding("")).toBe(false)
  })

  it("requires a choice only when it is asked", () => {
    expect(validateStockFunding("", true)).toBe("Choose how this stock was paid for")
    expect(validateStockFunding("bank", true)).toBeNull()
    expect(validateStockFunding("", false)).toBeNull()
  })

  it("sends the choice only without a supplier", () => {
    expect(stockFundingForRequest("cash", false)).toBe("cash")
    expect(stockFundingForRequest("cash", true)).toBeNull()
    expect(stockFundingForRequest("", false)).toBeNull()
  })

  it("explains the posting for each choice", () => {
    expect(stockFundingPostingHint("opening_stock")).toContain("Owner's Equity")
    expect(stockFundingPostingHint("cash")).toContain("Cash (1000)")
    expect(stockFundingPostingHint("bank")).toContain("Bank (1010)")
  })

  it("maps to the API only for stock without a supplier", () => {
    expect(toDotnetStockFunding("bank", true, null)).toBe("bank")
    expect(toDotnetStockFunding("bank", true, "s1")).toBeNull()
    expect(toDotnetStockFunding("bank", false, null)).toBeNull()
    expect(toDotnetStockFunding("wire", true, null)).toBeNull()
  })

  it("carries the choice on create medicine and add stock", () => {
    const form = { name: "Cetamol", stock_quantity: 10, cost_price: 2, unit_price: 3, stock_funding: "cash" as const }
    expect(toDotnetCreateMedicineCommand(form).stockFunding).toBe("cash")
    expect(toDotnetAddMedicineStockCommand(form).stockFunding).toBe("cash")
    // No stock, or a supplier bill: nothing to fund this way.
    expect(toDotnetCreateMedicineCommand({ ...form, stock_quantity: 0 }).stockFunding).toBeNull()
    expect(toDotnetAddMedicineStockCommand({ ...form, supplier_id: "s1" }).stockFunding).toBeNull()
  })
})
