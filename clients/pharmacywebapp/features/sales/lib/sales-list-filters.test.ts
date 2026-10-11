import { describe, expect, it } from "vitest"
import { buildSalesListQuery } from "@/lib/api/sales-api"
import { saleKeys } from "@/features/sales/hooks/use-sales"
import {
  EMPTY_SALES_LIST_STATE,
  hasActiveSalesFilters,
  isAmountRangeInvalid,
  toSalesFilters,
  type SalesListState,
} from "./sales-list-filters"

const MEDICINE_ID = "bbbbbbbb-1111-4222-8333-444455556666"
const CUSTOMER_ID = "aaaaaaaa-1111-4222-8333-444455556666"
const BRANCH_ID = "cccccccc-1111-4222-8333-444455556666"

/** Sales history control state → the GET /api/v1/sales query string the page sends. */
function paramsFor(overrides: Partial<SalesListState>): URLSearchParams {
  return new URLSearchParams(buildSalesListQuery(toSalesFilters({ ...EMPTY_SALES_LIST_STATE, ...overrides })))
}

const baseline = paramsFor({})

/** Params a control adds or changes relative to the untouched page. */
function changedBy(overrides: Partial<SalesListState>): Record<string, string> {
  const params = paramsFor(overrides)
  const diff: Record<string, string> = {}
  params.forEach((value, key) => {
    if (baseline.get(key) !== value) diff[key] = value
  })
  return diff
}

describe("Sales history: every filter control reaches the request", () => {
  it("sends only the default sort and paging when nothing is set", () => {
    expect(Object.fromEntries(baseline)).toEqual({ sortBy: "sale_date", sortOrder: "desc", pageNumber: "1", pageSize: "10" })
  })

  it("search", () => {
    expect(changedBy({ search: "  INV-0042 " })).toEqual({ search: "INV-0042" })
  })

  it("payment status (incl. cancelled)", () => {
    expect(changedBy({ paymentStatuses: ["pending", "cancelled"] })).toEqual({ paymentStatuses: "pending,cancelled" })
  })

  it("payment method (incl. split payment)", () => {
    expect(changedBy({ paymentMethods: ["cash", "mixed"] })).toEqual({ paymentMethods: "cash,mixed" })
  })

  it("amount range", () => {
    expect(changedBy({ minAmount: "100", maxAmount: "250.5" })).toEqual({ minAmount: "100", maxAmount: "250.5" })
    expect(changedBy({ minAmount: "0" })).toEqual({ minAmount: "0" })
  })

  it("an inverted or invalid amount range is not sent", () => {
    expect(changedBy({ minAmount: "500", maxAmount: "100" })).toEqual({})
    expect(changedBy({ minAmount: "abc", maxAmount: "-5" })).toEqual({})
    expect(isAmountRangeInvalid({ minAmount: "500", maxAmount: "100" })).toBe(true)
  })

  it("date range (local calendar days → whole Nepal days)", () => {
    expect(changedBy({ dateRange: { from: new Date(2026, 9, 1), to: new Date(2026, 9, 5, 23, 59, 59) } })).toEqual({
      fromDate: "2026-10-01",
      toDate: "2026-10-05",
    })
  })

  it("medicine", () => {
    expect(changedBy({ medicineId: MEDICINE_ID })).toEqual({ medicineId: MEDICINE_ID })
  })

  it("customer", () => {
    expect(changedBy({ customerId: CUSTOMER_ID })).toEqual({ customerId: CUSTOMER_ID })
  })

  it("branch", () => {
    expect(changedBy({ branchId: BRANCH_ID })).toEqual({ branchId: BRANCH_ID })
  })

  it("sort", () => {
    expect(changedBy({ sort: "total_amount:asc" })).toEqual({ sortBy: "total_amount", sortOrder: "asc" })
    expect(changedBy({ sort: "invoice_number:desc" })).toEqual({ sortBy: "invoice_number" })
    expect(changedBy({ sort: "balance_due:desc" })).toEqual({ sortBy: "balance_due" })
    expect(changedBy({ sort: "sale_date:asc" })).toEqual({ sortOrder: "asc" })
  })

  it("page and page size", () => {
    expect(changedBy({ page: 3 })).toEqual({ pageNumber: "3" })
    expect(changedBy({ pageSize: 50 })).toEqual({ pageSize: "50" })
  })

  it("every control changes the React Query key, so the list refetches", () => {
    const keyOf = (overrides: Partial<SalesListState>) =>
      JSON.stringify(saleKeys.list(toSalesFilters({ ...EMPTY_SALES_LIST_STATE, ...overrides })))
    const base = keyOf({})
    const variants: Partial<SalesListState>[] = [
      { search: "x" },
      { paymentStatuses: ["paid"] },
      { paymentMethods: ["card"] },
      { minAmount: "1" },
      { maxAmount: "2" },
      { dateRange: { from: new Date(2026, 0, 1), to: new Date(2026, 0, 2) } },
      { medicineId: MEDICINE_ID },
      { customerId: CUSTOMER_ID },
      { branchId: BRANCH_ID },
      { sort: "total_amount:desc" },
      { page: 2 },
      { pageSize: 20 },
    ]
    for (const v of variants) expect(keyOf(v)).not.toBe(base)
  })

  it("page-level filters apply unless a control overrides them", () => {
    const filters = toSalesFilters({ ...EMPTY_SALES_LIST_STATE }, { customerId: CUSTOMER_ID, dateFrom: "2026-01-01" })
    expect(filters.customerId).toBe(CUSTOMER_ID)
    expect(filters.dateFrom).toBe("2026-01-01")
    const overridden = toSalesFilters({ ...EMPTY_SALES_LIST_STATE, customerId: "other" }, { customerId: CUSTOMER_ID })
    expect(overridden.customerId).toBe("other")
  })

  it("knows when any filter is active (drives Clear filters and the empty state)", () => {
    expect(hasActiveSalesFilters(EMPTY_SALES_LIST_STATE)).toBe(false)
    expect(hasActiveSalesFilters({ ...EMPTY_SALES_LIST_STATE, medicineId: MEDICINE_ID })).toBe(true)
    expect(hasActiveSalesFilters({ ...EMPTY_SALES_LIST_STATE, sort: "total_amount:asc" })).toBe(false)
  })

  it("sends the cashier and balance-due-only controls", () => {
    expect(changedBy({ cashierId: "user-1" })).toEqual({ cashierUserId: "user-1" })
    expect(changedBy({ balanceDueOnly: true })).toEqual({ onlyWithBalanceDue: "true" })
    expect(hasActiveSalesFilters({ ...EMPTY_SALES_LIST_STATE, balanceDueOnly: true })).toBe(true)
    expect(hasActiveSalesFilters({ ...EMPTY_SALES_LIST_STATE, cashierId: "user-1" })).toBe(true)
  })
})
