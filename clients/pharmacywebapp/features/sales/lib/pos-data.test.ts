import { describe, expect, it } from "vitest"
import { isTotalMismatchError, posCustomerSearchFilters, posMedicinesQueryKey, posSellableQuantity, toPosMedicines } from "./pos-data"

describe("POS sellable stock", () => {
  it("prefers the branch's sellable quantity, then branch on-hand, then the tenant total", () => {
    expect(posSellableQuantity({ stock_quantity: 50, branch_stock_quantity: 10, branch_sellable_stock_quantity: 4 })).toBe(4)
    expect(posSellableQuantity({ stock_quantity: 50, branch_stock_quantity: 10 })).toBe(10)
    expect(posSellableQuantity({ stock_quantity: 50 })).toBe(50)
  })

  it("lists only medicines with sellable stock, showing that quantity", () => {
    const rows = [
      { id: "a", stock_quantity: 9, branch_stock_quantity: 9, branch_sellable_stock_quantity: 0 },
      { id: "b", stock_quantity: 9, branch_stock_quantity: 5, branch_sellable_stock_quantity: 3 },
    ]
    expect(toPosMedicines(rows)).toEqual([{ id: "b", stock_quantity: 3, branch_stock_quantity: 5, branch_sellable_stock_quantity: 3 }])
  })

  it("keys the catalog by branch under the medicines root", () => {
    expect(posMedicinesQueryKey("br-1")).toEqual(["medicines", "pos", "br-1"])
  })
})

describe("posCustomerSearchFilters", () => {
  it("searches active customers server-side within the page cap", () => {
    expect(posCustomerSearchFilters("  ram ")).toMatchObject({ search: "ram", activity: "active", limit: 50 })
    expect(posCustomerSearchFilters("")).not.toHaveProperty("search")
  })
})

describe("isTotalMismatchError", () => {
  it("recognises the server's total / stock refusals", () => {
    expect(isTotalMismatchError(new Error("Payments (100) must sum to the sale total (110), or include a credit line"))).toBe(true)
    expect(isTotalMismatchError(new Error("Payment amount 120 exceeds the sale total 110."))).toBe(true)
    expect(isTotalMismatchError(new Error("Customer is inactive"))).toBe(false)
  })
})
