import { dotnetAccountingApi } from "@/lib/api/accounting-api"

export const EXPENSE_CATEGORIES = [
  "rent",
  "utilities",
  "salaries",
  "maintenance",
  "marketing",
  "transport",
  "supplies",
  "insurance",
  "taxes_fees",
  "other",
] as const
export type ExpenseCategory = (typeof EXPENSE_CATEGORIES)[number]

export type ExpensePaymentMethod = "cash" | "bank" | "card" | "other"

export interface Expense {
  id: string
  tenant_id: string
  branch_id: string | null
  category: ExpenseCategory
  description: string | null
  /** Gross bill total (VAT included): what was paid, or for a pay-later expense what is owed. */
  amount: string | number
  expense_date: string
  /** Null on a pay-later expense (see supplier_id) or an unknown method. */
  payment_method: ExpensePaymentMethod | null
  receipt_reference: string | null
  created_by: string | null
  created_at: string
  /** Ledger account the net cost is booked to (General Expenses for older expenses). Null on older API builds. */
  expense_account_id: string | null
  expense_account_code: string | null
  expense_account_name: string | null
  /** Input VAT inside `amount` (a VAT bill); 0 when none. */
  vat_amount: number
  /** Seller's VAT / PAN number on the VAT bill. */
  supplier_vat_number: string | null
  /** Who it was paid or is owed to (the supplier's name on a pay-later expense). */
  vendor_name: string | null
  /** Set on a pay-later expense: owed to this supplier, settled through supplier payments. */
  supplier_id: string | null
}

export interface CreateExpenseInput {
  category: ExpenseCategory
  description?: string | null
  /** Gross bill total, VAT included. */
  amount: number
  expense_date: string
  /** Paid now: picks the Cash or Bank credit. Ignored (and optional) when `supplier_id` is set. */
  payment_method?: ExpensePaymentMethod | null
  receipt_reference?: string | null
  /** Expense-type ledger account; omitted = General Expenses (5100), or on an edit the expense's current account. */
  expense_account_id?: string | null
  /** VAT bill: the input VAT inside `amount`. Takes precedence over `amount_includes_vat`. */
  vat_amount?: number | null
  /** VAT bill: split the tenant VAT rate out of `amount` on the server. */
  amount_includes_vat?: boolean
  supplier_vat_number?: string | null
  vendor_name?: string | null
  /** Pay later: the bill is owed to this supplier (Accounts Payable). */
  supplier_id?: string | null
}

/** UpdateExpenseCommand has no date field — the expense_date cannot change via this call. */
export type UpdateExpenseInput = Omit<CreateExpenseInput, "expense_date">

export interface ExpensesFilters {
  from?: string
  to?: string
  category?: string
  /** Branch scope; omitted = the server's default for this user. */
  branchId?: string
  page?: number
  limit?: number
}

export const expensesApi = {
  getExpenses: async (filters?: ExpensesFilters) => dotnetAccountingApi.listExpenses(filters),

  /** Every expense matching the filters across all pages (date-filter it: the API has no totals endpoint). */
  getAllExpenses: async (filters?: Omit<ExpensesFilters, "page" | "limit">) => dotnetAccountingApi.listAllExpenses(filters),

  /** Records an expense. Paid now needs a payment method (Cash or Bank credit); pay later needs a supplier. */
  createExpense: async (input: CreateExpenseInput, idempotencyKey?: string) => dotnetAccountingApi.recordExpense(input, idempotencyKey),

  deleteExpense: async (id: string) => dotnetAccountingApi.deleteExpense(id),

  /** Updates an expense's figures, account, VAT and texts (not its date — see UpdateExpenseInput). */
  updateExpense: async (id: string, input: UpdateExpenseInput, currentExpenseDate: string) =>
    dotnetAccountingApi.updateExpense(id, input, currentExpenseDate),
}
