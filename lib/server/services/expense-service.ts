/**
 * Operating expenses (rent, salaries, utilities, etc.) — item 12 of the 2026-08
 * domain audit. Separate from COGS/purchases; each entry posts a GL voucher via
 * postExpenseVoucher so P&L (already GL-driven, accounting-service.ts) reflects
 * true net profit, not just gross profit.
 */

import type { SupabaseClient } from "@supabase/supabase-js"
import { postExpenseVoucher, reversePostedVoucher } from "@/lib/server/services/accounting-service"

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

export interface CreateExpenseInput {
  category: ExpenseCategory
  description?: string | null
  amount: number
  expense_date: string
  payment_method?: "cash" | "bank" | "card" | "other" | null
  receipt_reference?: string | null
  branch_id?: string | null
}

export interface ListExpensesInput {
  from?: string | null
  to?: string | null
  category?: string | null
  page: number
  limit: number
}

export async function listExpensesForTenant(
  supabase: SupabaseClient,
  tenantId: string,
  input: ListExpensesInput
): Promise<{ data: unknown[]; count: number; error: Error | null }> {
  let query = supabase.from("expenses").select("*", { count: "exact" }).eq("tenant_id", tenantId)
  if (input.from) query = query.gte("expense_date", input.from)
  if (input.to) query = query.lte("expense_date", input.to)
  if (input.category && input.category !== "all") query = query.eq("category", input.category)

  const from = (input.page - 1) * input.limit
  const to = from + input.limit - 1
  const { data, error, count } = await query.order("expense_date", { ascending: false }).range(from, to)

  if (error) return { data: [], count: 0, error: new Error(error.message) }
  return { data: data || [], count: count ?? 0, error: null }
}

export async function createExpenseForTenant(
  supabase: SupabaseClient,
  tenantId: string,
  userId: string,
  input: CreateExpenseInput
): Promise<{ data: unknown | null; error: Error | null }> {
  let branchId = input.branch_id ?? null
  if (!branchId) {
    const { data: actor } = await supabase.from("users").select("current_branch_id").eq("id", userId).maybeSingle()
    branchId = (actor as { current_branch_id: string | null } | null)?.current_branch_id ?? null
  }

  const { data, error } = await supabase
    .from("expenses")
    .insert({
      tenant_id: tenantId,
      branch_id: branchId,
      category: input.category,
      description: input.description ?? null,
      amount: input.amount,
      expense_date: input.expense_date,
      payment_method: input.payment_method ?? null,
      receipt_reference: input.receipt_reference ?? null,
      created_by: userId,
    })
    .select("*")
    .single()

  if (error) return { data: null, error: new Error(error.message) }

  const expenseId = (data as { id: string }).id
  const { error: voucherErr } = await postExpenseVoucher(supabase, tenantId, userId, {
    expenseId,
    voucherDate: input.expense_date,
    amount: input.amount,
    category: input.category,
    paymentMethod: input.payment_method ?? null,
  })
  if (voucherErr) {
    console.error(`[createExpenseForTenant] Voucher posting failed for expense ${expenseId} (tenant ${tenantId}): ${voucherErr.message}`)
  }

  return { data, error: null }
}

export async function deleteExpenseForTenant(
  supabase: SupabaseClient,
  tenantId: string,
  userId: string,
  id: string
): Promise<{ error: Error | null }> {
  // Reverse the posted voucher first — otherwise deleting the expense row leaves
  // a GL entry with nothing behind it, understating net profit forever.
  const { data: voucher } = await supabase
    .from("accounting_vouchers")
    .select("id")
    .eq("tenant_id", tenantId)
    .eq("reference_type", "expense")
    .eq("reference_id", id)
    .eq("status", "posted")
    .maybeSingle()

  if (voucher) {
    const { error: reverseErr } = await reversePostedVoucher(supabase, tenantId, userId, (voucher as { id: string }).id)
    if (reverseErr) return { error: reverseErr }
  }

  const { error } = await supabase.from("expenses").delete().eq("id", id).eq("tenant_id", tenantId)
  if (error) return { error: new Error(error.message) }
  return { error: null }
}
