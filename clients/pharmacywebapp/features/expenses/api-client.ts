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

export interface Expense {
  id: string
  tenant_id: string
  branch_id: string | null
  category: ExpenseCategory
  description: string | null
  amount: string | number
  expense_date: string
  payment_method: "cash" | "bank" | "card" | "other" | null
  receipt_reference: string | null
  created_by: string | null
  created_at: string
}

export interface CreateExpenseInput {
  category: ExpenseCategory
  description?: string | null
  amount: number
  expense_date: string
  payment_method?: "cash" | "bank" | "card" | "other" | null
  receipt_reference?: string | null
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

  /** Records an expense. A payment method is required (it picks the Cash or Bank credit account). */
  createExpense: async (input: CreateExpenseInput, idempotencyKey?: string) => dotnetAccountingApi.recordExpense(input, idempotencyKey),

  deleteExpense: async (id: string) => dotnetAccountingApi.deleteExpense(id),

  /** Updates an expense's category, amount, payment method, description and receipt reference (not its date — see UpdateExpenseInput). */
  updateExpense: async (id: string, input: UpdateExpenseInput, currentExpenseDate: string) =>
    dotnetAccountingApi.updateExpense(id, input, currentExpenseDate),
}
