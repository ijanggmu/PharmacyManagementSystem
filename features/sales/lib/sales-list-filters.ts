import type { Sale, SalePaymentStatusFilter, SalesFilters, SalesSortField } from "@/features/sales/api-client"
import { formatLocalDateYmd } from "@/lib/utils/date"

/**
 * The Sales history page's filter controls → SalesFilters (which lib/api/sales-api turns into GET
 * /api/v1/sales query params). Kept pure so every control can be unit-tested end to end.
 */

export interface SalesSortOption {
  value: string
  label: string
  sortBy: SalesSortField
  sortOrder: "asc" | "desc"
}

export const SALES_SORT_OPTIONS: SalesSortOption[] = [
  { value: "sale_date:desc", label: "Newest first", sortBy: "sale_date", sortOrder: "desc" },
  { value: "sale_date:asc", label: "Oldest first", sortBy: "sale_date", sortOrder: "asc" },
  { value: "total_amount:desc", label: "Highest total", sortBy: "total_amount", sortOrder: "desc" },
  { value: "total_amount:asc", label: "Lowest total", sortBy: "total_amount", sortOrder: "asc" },
  { value: "balance_due:desc", label: "Largest balance due", sortBy: "balance_due", sortOrder: "desc" },
  { value: "invoice_number:asc", label: "Invoice no. (A–Z)", sortBy: "invoice_number", sortOrder: "asc" },
  { value: "invoice_number:desc", label: "Invoice no. (Z–A)", sortBy: "invoice_number", sortOrder: "desc" },
]

export const DEFAULT_SALES_SORT = SALES_SORT_OPTIONS[0].value
export const SALES_PAGE_SIZES = [10, 20, 50, 100]
export const DEFAULT_SALES_PAGE_SIZE = 10

/** The (already debounced) values of every filter control on the Sales history page. */
export interface SalesListState {
  search: string
  paymentStatuses: SalePaymentStatusFilter[]
  paymentMethods: Sale["payment_method"][]
  dateRange?: { from: Date; to: Date }
  minAmount: string
  maxAmount: string
  medicineId: string
  customerId: string
  /** "" = no explicit branch (all branches for ViewAll users, the own branch otherwise). */
  branchId: string
  /** "" = any cashier. */
  cashierId: string
  /** Only sales with a balance still owed. */
  balanceDueOnly: boolean
  sort: string
  page: number
  pageSize: number
}

export const EMPTY_SALES_LIST_STATE: SalesListState = {
  search: "",
  paymentStatuses: [],
  paymentMethods: [],
  dateRange: undefined,
  minAmount: "",
  maxAmount: "",
  medicineId: "",
  customerId: "",
  branchId: "",
  cashierId: "",
  balanceDueOnly: false,
  sort: DEFAULT_SALES_SORT,
  page: 1,
  pageSize: DEFAULT_SALES_PAGE_SIZE,
}

/** A non-negative amount from a text box, or undefined when blank/invalid. */
export function parseAmount(value: string): number | undefined {
  if (!value.trim()) return undefined
  const n = Number(value)
  return Number.isFinite(n) && n >= 0 ? n : undefined
}

export function isAmountRangeInvalid(state: Pick<SalesListState, "minAmount" | "maxAmount">): boolean {
  const min = parseAmount(state.minAmount)
  const max = parseAmount(state.maxAmount)
  return min !== undefined && max !== undefined && min > max
}

export function hasActiveSalesFilters(state: SalesListState): boolean {
  return (
    state.search.trim().length > 0 ||
    state.paymentStatuses.length > 0 ||
    state.paymentMethods.length > 0 ||
    state.dateRange !== undefined ||
    state.minAmount.trim().length > 0 ||
    state.maxAmount.trim().length > 0 ||
    state.medicineId !== "" ||
    state.customerId !== "" ||
    state.branchId !== "" ||
    state.cashierId !== "" ||
    state.balanceDueOnly
  )
}

/** Page-level filters (`base`, e.g. a customer drawer) apply unless a control on the page overrides them. */
export function toSalesFilters(state: SalesListState, base: SalesFilters = {}): SalesFilters {
  const sort = SALES_SORT_OPTIONS.find((o) => o.value === state.sort) ?? SALES_SORT_OPTIONS[0]
  const invalidRange = isAmountRangeInvalid(state)
  const search = state.search.trim()
  return {
    ...base,
    search: search || undefined,
    paymentStatuses: state.paymentStatuses.length > 0 ? state.paymentStatuses : undefined,
    paymentMethods: state.paymentMethods.length > 0 ? state.paymentMethods : undefined,
    // Calendar days; the server reads them as whole Nepal-time days, both ends inclusive.
    dateFrom: state.dateRange ? formatLocalDateYmd(state.dateRange.from) : base.dateFrom,
    dateTo: state.dateRange ? formatLocalDateYmd(state.dateRange.to) : base.dateTo,
    minAmount: invalidRange ? undefined : parseAmount(state.minAmount),
    maxAmount: invalidRange ? undefined : parseAmount(state.maxAmount),
    medicineId: state.medicineId || base.medicineId,
    customerId: state.customerId || base.customerId,
    branchId: state.branchId || base.branchId,
    cashierUserId: state.cashierId || base.cashierUserId,
    onlyWithBalanceDue: state.balanceDueOnly || base.onlyWithBalanceDue || undefined,
    sortBy: sort.sortBy,
    sortOrder: sort.sortOrder,
    page: state.page,
    limit: state.pageSize,
  }
}
