import { describe, expect, it, vi } from "vitest"
import { CASH_SHIFT_BRANCH_SUMMARY_QUERY_KEY, invalidateMoneyMovementQueries } from "./money-movement-queries"

describe("invalidateMoneyMovementQueries", () => {
  it("invalidates sales, returns, refunds, customers, cash shifts and stock", () => {
    const invalidateQueries = vi.fn()
    invalidateMoneyMovementQueries({ invalidateQueries })
    const keys = invalidateQueries.mock.calls.map(([arg]) => (arg as { queryKey: string[] }).queryKey[0])
    expect(keys).toEqual(expect.arrayContaining(["sales", "returns", "refunds", "customers", "cash-shifts", "medicines"]))
  })

  it("keeps the cashier summary under the cash-shifts root", () => {
    expect(CASH_SHIFT_BRANCH_SUMMARY_QUERY_KEY[0]).toBe("cash-shifts")
  })
})
