import type { SupabaseClient } from "@supabase/supabase-js"

/**
 * Maps PostgREST errors to a user-actionable message (migration not run vs schema cache stale).
 */
export function cashShiftTableUnavailableMessage(err: unknown): string | null {
  const msg = err instanceof Error ? err.message : String(err)
  if (!msg.includes("cash_register_shifts")) return null
  if (msg.includes("schema cache") || msg.includes("Could not find the table")) {
    return (
      "The cash_register_shifts table exists in the database but Supabase API has not reloaded its schema yet. " +
      "Open Supabase Dashboard → Project Settings → API → Reload schema, or wait one to two minutes and retry. " +
      "If you have not applied migrations, run: yarn migrate"
    )
  }
  if (/does not exist|42P01/i.test(msg)) {
    return (
      "Missing table cash_register_shifts. From the project root run: yarn migrate " +
      "(applies scripts/60-cash-shifts-supplier-bills-return-items.sql)."
    )
  }
  return null
}

export interface CashShiftRow {
  id: string
  tenant_id: string
  branch_id: string
  status: string
  opened_at: string
  closed_at: string | null
  opened_by_user_id: string | null
  closed_by_user_id: string | null
  opening_float_cash: string | number
  expected_cash_system: string | number | null
  counted_cash_closing: string | number | null
  cash_variance: string | number | null
  notes_opening: string | null
  notes_closing: string | null
}

export async function getOpenShiftForBranch(
  supabase: SupabaseClient,
  tenantId: string,
  branchId: string
): Promise<CashShiftRow | null> {
  const { data, error } = await supabase
    .from("cash_register_shifts")
    .select("*")
    .eq("tenant_id", tenantId)
    .eq("branch_id", branchId)
    .eq("status", "open")
    .order("opened_at", { ascending: false })
    .limit(1)
    .maybeSingle()

  if (error) throw new Error(error.message)
  return (data as CashShiftRow) ?? null
}

async function sumCashMovementInWindow(
  supabase: SupabaseClient,
  tenantId: string,
  branchId: string,
  fromIso: string,
  toIso: string
): Promise<number> {
  const fromDate = fromIso.slice(0, 10)
  const toDate = toIso.slice(0, 10)

  const { data: cashAcct } = await supabase
    .from("accounting_accounts")
    .select("id")
    .eq("tenant_id", tenantId)
    .eq("code", "1000")
    .maybeSingle()

  if (cashAcct?.id) {
    const { data: lines } = await supabase
      .from("accounting_voucher_lines")
      .select(
        `
        debit_amount,
        credit_amount,
        accounting_vouchers!inner ( voucher_date, status, branch_id )
      `
      )
      .eq("tenant_id", tenantId)
      .eq("account_id", cashAcct.id)
      .eq("accounting_vouchers.status", "posted")
      .eq("accounting_vouchers.branch_id", branchId)
      .gte("accounting_vouchers.voucher_date", fromDate)
      .lte("accounting_vouchers.voucher_date", toDate)

    let movement = 0
    for (const raw of lines || []) {
      const r = raw as { debit_amount: string | number; credit_amount: string | number }
      movement += Number(r.debit_amount ?? 0) - Number(r.credit_amount ?? 0)
    }
    return Number(movement.toFixed(2))
  }

  const { data, error } = await supabase
    .from("sales")
    .select("total_amount")
    .eq("tenant_id", tenantId)
    .eq("branch_id", branchId)
    .eq("payment_method", "cash")
    .neq("payment_status", "refunded")
    .gte("sale_date", fromIso)
    .lte("sale_date", toIso)

  if (error) throw new Error(error.message)
  return (data ?? []).reduce((acc, r: { total_amount: string | number | null }) => {
    const n = Number(r.total_amount ?? 0)
    return acc + (Number.isFinite(n) ? n : 0)
  }, 0)
}

export async function openCashShift(
  supabase: SupabaseClient,
  tenantId: string,
  userId: string,
  input: { branch_id: string; opening_float_cash: number; notes_opening?: string | null }
): Promise<CashShiftRow> {
  const existing = await getOpenShiftForBranch(supabase, tenantId, input.branch_id)
  if (existing) {
    throw new Error("This branch already has an open cash shift. Close it before opening a new one.")
  }
  if (!Number.isFinite(input.opening_float_cash) || input.opening_float_cash < 0) {
    throw new Error("Opening float must be a non-negative number")
  }

  const { data, error } = await supabase
    .from("cash_register_shifts")
    .insert({
      tenant_id: tenantId,
      branch_id: input.branch_id,
      status: "open",
      opened_by_user_id: userId,
      opening_float_cash: input.opening_float_cash,
      notes_opening: input.notes_opening ?? null,
    })
    .select()
    .single()

  if (error) throw new Error(error.message)
  return data as CashShiftRow
}

export async function closeCashShift(
  supabase: SupabaseClient,
  tenantId: string,
  userId: string,
  shiftId: string,
  input: { counted_cash_closing: number; notes_closing?: string | null }
): Promise<CashShiftRow> {
  if (!Number.isFinite(input.counted_cash_closing) || input.counted_cash_closing < 0) {
    throw new Error("Counted cash must be a non-negative number")
  }

  const { data: shift, error: fetchErr } = await supabase
    .from("cash_register_shifts")
    .select("*")
    .eq("id", shiftId)
    .eq("tenant_id", tenantId)
    .single()

  if (fetchErr || !shift) throw new Error(fetchErr?.message || "Shift not found")
  const s = shift as CashShiftRow
  if (s.status !== "open") throw new Error("Shift is not open")

  const closedAt = new Date().toISOString()
  const opening = Number(s.opening_float_cash ?? 0)
  const cashMovement = await sumCashMovementInWindow(supabase, tenantId, s.branch_id, s.opened_at, closedAt)
  const expected = opening + cashMovement
  const counted = input.counted_cash_closing
  const variance = counted - expected

  const { data: updated, error: updErr } = await supabase
    .from("cash_register_shifts")
    .update({
      status: "closed",
      closed_at: closedAt,
      closed_by_user_id: userId,
      expected_cash_system: expected,
      counted_cash_closing: counted,
      cash_variance: variance,
      notes_closing: input.notes_closing ?? null,
      updated_at: closedAt,
    })
    .eq("id", shiftId)
    .eq("tenant_id", tenantId)
    .select()
    .single()

  if (updErr || !updated) throw new Error(updErr?.message || "Failed to close shift")

  try {
    await supabase.rpc("accounting_post_cash_shift_variance", {
      p_shift_id: shiftId,
      p_user_id: userId,
    })
  } catch {
    /* variance voucher optional until migration 65 */
  }

  return updated as CashShiftRow
}

export async function listCashShifts(
  supabase: SupabaseClient,
  tenantId: string,
  filters: { branch_id?: string; status?: string; date_from?: string; date_to?: string; limit?: number }
): Promise<CashShiftRow[]> {
  let q = supabase
    .from("cash_register_shifts")
    .select("*")
    .eq("tenant_id", tenantId)
    .order("opened_at", { ascending: false })
    .limit(filters.limit ?? 100)

  if (filters.branch_id) q = q.eq("branch_id", filters.branch_id)
  if (filters.status) q = q.eq("status", filters.status)
  if (filters.date_from) q = q.gte("opened_at", filters.date_from)
  if (filters.date_to) q = q.lte("opened_at", filters.date_to)

  const { data, error } = await q
  if (error) throw new Error(error.message)
  return (data as CashShiftRow[]) ?? []
}

/** Aggregated expected physical cash: last closed shift counted (or 0) + opening floats + cash sales minus closings — simplified: sum opening floats of open shifts + last known drawer per branch is complex; for report we expose per-shift rows only. */
export async function branchCashSummary(
  supabase: SupabaseClient,
  tenantId: string
): Promise<
  Array<{
    branch_id: string
    branch_name: string
    open_shift_id: string | null
    opening_float: number
    cash_sales_since_open: number
    expected_in_drawer: number
  }>
> {
  const { data: branches, error: bErr } = await supabase
    .from("branches")
    .select("id, name")
    .eq("tenant_id", tenantId)
    .eq("is_active", true)
    .order("name")

  if (bErr) throw new Error(bErr.message)
  const list = branches ?? []

  const out: Array<{
    branch_id: string
    branch_name: string
    open_shift_id: string | null
    opening_float: number
    cash_sales_since_open: number
    expected_in_drawer: number
  }> = []

  for (const b of list) {
    const branchId = b.id as string
    const open = await getOpenShiftForBranch(supabase, tenantId, branchId)
    if (!open) {
      out.push({
        branch_id: branchId,
        branch_name: String(b.name),
        open_shift_id: null,
        opening_float: 0,
        cash_sales_since_open: 0,
        expected_in_drawer: 0,
      })
      continue
    }
    const opening = Number(open.opening_float_cash ?? 0)
    const nowIso = new Date().toISOString()
    const sales = await sumCashMovementInWindow(supabase, tenantId, branchId, open.opened_at, nowIso)
    out.push({
      branch_id: branchId,
      branch_name: String(b.name),
      open_shift_id: open.id,
      opening_float: opening,
      cash_sales_since_open: sales,
      expected_in_drawer: opening + sales,
    })
  }

  return out
}
