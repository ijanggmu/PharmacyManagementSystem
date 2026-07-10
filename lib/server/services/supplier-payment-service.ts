/**
 * Supplier payments — RPC to ledger + GL (see migration `post_supplier_payment`).
 */

import type { SupabaseClient } from "@supabase/supabase-js"
import { ensureSupplierPayableAccount, getPostingLockDate, assertVoucherDateOpen } from "@/lib/server/services/accounting-service"

export interface PostSupplierPaymentInput {
  supplier_id: string
  amount: number
  payment_method: "cash" | "bank"
  payment_date: string
  reference_note?: string | null
  branch_id?: string | null
}

export async function postSupplierPayment(
  supabase: SupabaseClient,
  tenantId: string,
  userId: string,
  input: PostSupplierPaymentInput
): Promise<{
  data: { ledger_entry_id: string; voucher_id: string } | null
  error: Error | null
}> {
  if (!Number.isFinite(input.amount) || input.amount <= 0) {
    return { data: null, error: new Error("Amount must be positive") }
  }

  const ap = await ensureSupplierPayableAccount(supabase, tenantId, input.supplier_id)
  if (ap.error) return { data: null, error: ap.error }

  const { lockDate, error: lockErr } = await getPostingLockDate(supabase, tenantId)
  if (lockErr) return { data: null, error: lockErr }
  try {
    assertVoucherDateOpen(lockDate, input.payment_date)
  } catch (e) {
    return { data: null, error: e instanceof Error ? e : new Error("Posting not allowed") }
  }

  let branchId = input.branch_id ?? null
  if (!branchId) {
    const { data: userRow } = await supabase
      .from("users")
      .select("current_branch_id")
      .eq("id", userId)
      .maybeSingle()
    branchId = (userRow?.current_branch_id as string | null) ?? null
  }

  const { data, error } = await supabase.rpc("post_supplier_payment", {
    p_tenant_id: tenantId,
    p_supplier_id: input.supplier_id,
    p_amount: input.amount,
    p_payment_method: input.payment_method,
    p_payment_date: input.payment_date.slice(0, 10),
    p_user_id: userId,
    p_reference_note: input.reference_note ?? null,
    p_branch_id: branchId,
  })

  if (error) return { data: null, error: new Error(error.message) }

  const row = Array.isArray(data) ? data[0] : data
  if (!row || typeof row !== "object") {
    return { data: null, error: new Error("Unexpected response from post_supplier_payment") }
  }

  const ledger_entry_id = (row as { ledger_entry_id?: string }).ledger_entry_id
  const voucher_id = (row as { voucher_id?: string }).voucher_id
  if (!ledger_entry_id || !voucher_id) {
    return { data: null, error: new Error("Missing ids from post_supplier_payment") }
  }

  return { data: { ledger_entry_id, voucher_id }, error: null }
}
