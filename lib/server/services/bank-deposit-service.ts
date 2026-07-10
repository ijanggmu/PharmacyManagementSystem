/**
 * Bank deposits — transfer cash to bank via GL voucher (Dr 1010, Cr 1000).
 */

import type { SupabaseClient } from "@supabase/supabase-js"
import { assertVoucherDateOpen, getPostingLockDate } from "@/lib/server/services/accounting-service"

export interface RecordBankDepositInput {
  branch_id: string
  amount: number
  deposit_date: string
  reference_note?: string | null
}

export async function recordBankDeposit(
  supabase: SupabaseClient,
  userId: string,
  input: RecordBankDepositInput
): Promise<{ data: { deposit_id: string } | null; error: Error | null }> {
  if (!input.branch_id) return { data: null, error: new Error("branch_id is required") }
  if (!Number.isFinite(input.amount) || input.amount <= 0) {
    return { data: null, error: new Error("Amount must be positive") }
  }

  const { data: userRow, error: uErr } = await supabase
    .from("users")
    .select("tenant_id")
    .eq("id", userId)
    .single()

  if (uErr || !userRow?.tenant_id) {
    return { data: null, error: new Error(uErr?.message ?? "User tenant not found") }
  }

  const tenantId = userRow.tenant_id as string
  const { lockDate, error: lockErr } = await getPostingLockDate(supabase, tenantId)
  if (lockErr) return { data: null, error: lockErr }
  try {
    assertVoucherDateOpen(lockDate, input.deposit_date)
  } catch (e) {
    return { data: null, error: e instanceof Error ? e : new Error("Posting not allowed") }
  }

  const { data, error } = await supabase.rpc("record_bank_deposit", {
    p_branch_id: input.branch_id,
    p_amount: input.amount,
    p_deposit_date: input.deposit_date.slice(0, 10),
    p_reference_note: input.reference_note ?? null,
    p_user_id: userId,
  })

  if (error) {
    const msg = error.message
    if (msg.includes("bank_deposits") && /does not exist|schema cache/i.test(msg)) {
      return {
        data: null,
        error: new Error(
          "Bank deposits not available. Run yarn migrate (script 64) and reload Supabase API schema."
        ),
      }
    }
    return { data: null, error: new Error(msg) }
  }

  const deposit_id = data as string
  if (!deposit_id) {
    return { data: null, error: new Error("Unexpected response from record_bank_deposit") }
  }

  return { data: { deposit_id }, error: null }
}

export async function listBankDeposits(
  supabase: SupabaseClient,
  tenantId: string,
  filters: { branch_id?: string; date_from?: string; date_to?: string; limit?: number }
) {
  let q = supabase
    .from("bank_deposits")
    .select("id, branch_id, deposit_date, amount, reference_note, voucher_id, created_at")
    .eq("tenant_id", tenantId)
    .order("deposit_date", { ascending: false })
    .order("created_at", { ascending: false })
    .limit(filters.limit ?? 50)

  if (filters.branch_id) q = q.eq("branch_id", filters.branch_id)
  if (filters.date_from) q = q.gte("deposit_date", filters.date_from)
  if (filters.date_to) q = q.lte("deposit_date", filters.date_to)

  const { data, error } = await q
  if (error) throw new Error(error.message)
  return data ?? []
}
