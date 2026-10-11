import type { QueryClient } from "@tanstack/react-query"

/** Root key of every cash-shift / cash-drawer query (the cashier page's summary lives under it). */
export const CASH_SHIFTS_QUERY_KEY = ["cash-shifts"] as const

/** The multi-branch "expected in drawer" summary on the cashier page. */
export const CASH_SHIFT_BRANCH_SUMMARY_QUERY_KEY = [...CASH_SHIFTS_QUERY_KEY, "branch-summary"] as const

/**
 * Query roots that a sale, return, refund or cancellation changes: the sales lists and detail, the
 * returns/refunds lists, the customer's balance (credit sales, on-account credits), the cash drawer
 * summary and stock.
 */
export const MONEY_MOVEMENT_QUERY_ROOTS: readonly (readonly string[])[] = [
  ["sales"],
  ["returns"],
  ["refunds"],
  ["customers"],
  CASH_SHIFTS_QUERY_KEY,
  ["medicines"],
]

/** Marks everything a sale/return/refund/cancel touched as stale so open screens refetch. */
export function invalidateMoneyMovementQueries(queryClient: Pick<QueryClient, "invalidateQueries">): void {
  for (const queryKey of MONEY_MOVEMENT_QUERY_ROOTS) {
    void queryClient.invalidateQueries({ queryKey: [...queryKey] })
  }
}
