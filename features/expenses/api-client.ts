import { apiGetWithMeta, apiPost, apiDelete, getCSRFToken } from "@/lib/api/client-helpers"
import { backendTarget } from "@/lib/api/backend-target"
import { canRecordExpenseOnDotnet, dotnetAccountingApi } from "@/lib/api/accounting-api"

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

export interface ExpensesFilters {
  from?: string
  to?: string
  category?: string
  page?: number
  limit?: number
}

function expensesListPath(filters?: ExpensesFilters): string {
  const p = new URLSearchParams()
  if (filters?.from) p.set("from", filters.from)
  if (filters?.to) p.set("to", filters.to)
  if (filters?.category && filters.category !== "all") p.set("category", filters.category)
  if (filters?.page != null) p.set("page", String(filters.page))
  if (filters?.limit != null) p.set("limit", String(filters.limit))
  const q = p.toString()
  return `/api/expenses${q ? `?${q}` : ""}`
}

export const expensesApi = {
  getExpenses: async (filters?: ExpensesFilters) => {
    if (backendTarget("ACCOUNTING") === "dotnet") return dotnetAccountingApi.listExpenses(filters)
    const { data, meta } = await apiGetWithMeta<Expense[]>(expensesListPath(filters))
    return { data: data ?? [], total: meta?.total ?? 0, error: null as string | null }
  },

  createExpense: async (input: CreateExpenseInput) => {
    // Inputs the .NET command cannot carry (receipt reference, no payment method) stay on the legacy path.
    if (backendTarget("ACCOUNTING") === "dotnet" && canRecordExpenseOnDotnet(input)) {
      return dotnetAccountingApi.recordExpense(input)
    }
    const token = await getCSRFToken()
    const data = await apiPost<Expense>("/api/expenses", input, token)
    return { data, error: null as string | null }
  },

  deleteExpense: async (id: string) => {
    if (backendTarget("ACCOUNTING") === "dotnet") return dotnetAccountingApi.deleteExpense(id)
    const token = await getCSRFToken()
    await apiDelete(`/api/expenses/${encodeURIComponent(id)}`, token)
    return { error: null as string | null }
  },
}
