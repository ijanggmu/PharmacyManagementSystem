import { describe, expect, it } from "vitest"
import { availableStock, transferSourceBranchId } from "./transfer-source"

describe("transferSourceBranchId", () => {
  it("always sends from the current branch, even for users who can see every branch", () => {
    expect(transferSourceBranchId({ ownBranchId: "branch-a" })).toBe("branch-a")
  })

  it("is empty when the current branch is unknown, so the form blocks the dispatch", () => {
    expect(transferSourceBranchId({ ownBranchId: null })).toBe("")
    expect(transferSourceBranchId({})).toBe("")
  })
})

describe("availableStock", () => {
  it("prefers the current branch's sellable stock (expired and recalled lots never move)", () => {
    expect(
      availableStock({ stock_quantity: 90, sellable_stock_quantity: 60, branch_stock_quantity: 40, branch_sellable_stock_quantity: 25 }),
    ).toBe(25)
  })

  it("falls back to branch on-hand, then all-branch figures", () => {
    expect(availableStock({ stock_quantity: 90, branch_stock_quantity: 40 })).toBe(40)
    expect(availableStock({ stock_quantity: 90, sellable_stock_quantity: 60 })).toBe(60)
    expect(availableStock({ stock_quantity: 90 })).toBe(90)
    expect(availableStock(undefined)).toBeUndefined()
  })
})
