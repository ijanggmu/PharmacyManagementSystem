/**
 * Customer payments (receipts) — RPC to customer ledger + GL voucher.
 * See migration `record_customer_payment`.
 */

import type { SupabaseClient } from "@supabase/supabase-js"
import { getPostingLockDate, assertVoucherDateOpen } from "@/lib/server/services/accounting-service"

export interface RecordCustomerPaymentInput {
  customer_id: string
  amount: number
  payment_method: "cash" | "bank"
  payment_date: string
  reference_note?: string | null
  allocations?: Array<{ sale_id: string; amount: number }> | null
}

export async function recordCustomerPayment(
  supabase: SupabaseClient,
  tenantId: string,
  userId: string,
  input: RecordCustomerPaymentInput
): Promise<{
  data: { payment_id: string } | null
  error: Error | null
}> {
  if (!input.customer_id) return { data: null, error: new Error("customer_id is required") }
  if (!Number.isFinite(input.amount) || input.amount <= 0) return { data: null, error: new Error("Amount must be positive") }

  const { lockDate, error: lockErr } = await getPostingLockDate(supabase, tenantId)
  if (lockErr) return { data: null, error: lockErr }
  try {
    assertVoucherDateOpen(lockDate, input.payment_date)
  } catch (e) {
    return { data: null, error: e instanceof Error ? e : new Error("Posting not allowed") }
  }

  const allocationsJson: Array<{ sale_id: string; amount: number }> | null =
    input.allocations && input.allocations.length
      ? input.allocations.map((a) => ({ sale_id: a.sale_id, amount: a.amount }))
      : null

  const { data, error } = await supabase.rpc("record_customer_payment", {
    p_customer_id: input.customer_id,
    p_amount: input.amount,
    p_payment_method: input.payment_method,
    p_payment_date: input.payment_date.slice(0, 10),
    p_reference_note: input.reference_note ?? null,
    p_user_id: userId,
    p_allocations: allocationsJson,
  } as any)

  if (error) return { data: null, error: new Error(error.message) }

  const payment_id = (data as string) || (Array.isArray(data) ? (data[0] as any) : null)
  if (!payment_id || typeof payment_id !== "string") {
    return { data: null, error: new Error("Unexpected response from record_customer_payment") }
  }

  return { data: { payment_id }, error: null }
}

