/**
 * Opening-balance / migration wizard (2026-09 ERP audit, priority item #1):
 * lets a pharmacy that already has real stock, cash, bank, and customer/supplier
 * balances — but no reliable historical transaction data — go live in this
 * system without re-entering years of sales. One `migration_sessions` row per
 * tenant records the cutover date; every opening figure posts as a normal,
 * balanced GL voucher against the "Opening balance equity" account (3900) via
 * postSystemVoucher, so the books stay double-entry-correct from day one
 * (rule.md 9.1) instead of being seeded with raw UPDATEs.
 *
 * Deliberately scoped to the spec's "Level 1 — Quick Start" migration: opening
 * stock, cash, bank, and per-customer/per-supplier balances. Historical
 * sales/purchase detail (Level 2/3) is out of scope here.
 */

import type { SupabaseClient } from "@supabase/supabase-js"
import { postSystemVoucher, ensureSupplierPayableAccount, type SystemVoucherLineInput } from "@/lib/server/services/accounting-service"

export interface MigrationSession {
  id: string
  tenant_id: string
  status: "draft" | "completed"
  cutover_date: string
  notes: string | null
  created_at: string
  completed_at: string | null
}

const SESSION_SELECT = "id, tenant_id, status, cutover_date, notes, created_at, completed_at"

export async function getMigrationSession(
  supabase: SupabaseClient,
  tenantId: string
): Promise<{ data: MigrationSession | null; error: Error | null }> {
  const { data, error } = await supabase
    .from("migration_sessions")
    .select(SESSION_SELECT)
    .eq("tenant_id", tenantId)
    .maybeSingle()

  if (error) return { data: null, error: new Error(error.message) }
  return { data: (data as MigrationSession | null) ?? null, error: null }
}

export async function startMigrationSession(
  supabase: SupabaseClient,
  tenantId: string,
  userId: string,
  input: { cutoverDate: string; notes?: string | null }
): Promise<{ data: MigrationSession | null; error: Error | null }> {
  const { data: existing } = await getMigrationSession(supabase, tenantId)
  if (existing) {
    return { data: null, error: new Error("A migration session already exists for this pharmacy.") }
  }

  const { data, error } = await supabase
    .from("migration_sessions")
    .insert({
      tenant_id: tenantId,
      cutover_date: input.cutoverDate,
      notes: input.notes ?? null,
      created_by: userId,
    })
    .select(SESSION_SELECT)
    .single()

  if (error) return { data: null, error: new Error(error.message) }
  return { data: data as MigrationSession, error: null }
}

async function requireDraftSession(
  supabase: SupabaseClient,
  tenantId: string
): Promise<{ session: MigrationSession | null; error: Error | null }> {
  const { data, error } = await getMigrationSession(supabase, tenantId)
  if (error) return { session: null, error }
  if (!data) return { session: null, error: new Error("Start a migration session first (set the cutover date).") }
  if (data.status !== "draft") {
    return { session: null, error: new Error("This migration session is already completed — opening balances are locked.") }
  }
  return { session: data, error: null }
}

export async function completeMigrationSession(
  supabase: SupabaseClient,
  tenantId: string,
  userId: string
): Promise<{ error: Error | null }> {
  const { session, error } = await requireDraftSession(supabase, tenantId)
  if (error || !session) return { error }

  const { data: updated, error: updErr } = await supabase
    .from("migration_sessions")
    .update({ status: "completed", completed_by: userId, completed_at: new Date().toISOString() })
    .eq("id", session.id)
    .eq("tenant_id", tenantId)
    .eq("status", "draft")
    .select("id")

  if (updErr) return { error: new Error(updErr.message) }
  if (!updated || updated.length === 0) return { error: new Error("Session was already completed") }
  return { error: null }
}

export interface OpeningStockItem {
  medicineId: string
  quantity: number
  unitCost: number
  batchNumber?: string | null
  expiryDate?: string | null
}

export interface OpeningStockResult {
  imported: number
  failed: { medicineId: string; message: string }[]
  /** Medicines that already had stock at this branch before this import — the
   *  opening quantity was still added (a pharmacy legitimately topping up an
   *  earlier opening-stock line isn't an error), but this is surfaced so the
   *  user can catch a genuine double count, e.g. a medicine added manually via
   *  "Add Medicine" before running the migration wizard. */
  warnings: { medicineId: string; message: string }[]
  totalValue: number
  voucherId: string | null
}

/** Seeds opening stock for a branch: per-branch stock, an audited inventory
 *  transaction, and a FEFO batch row per item, then one consolidated GL
 *  voucher (Dr inventory, Cr opening balance equity) for the whole batch. */
export async function importOpeningStock(
  supabase: SupabaseClient,
  tenantId: string,
  userId: string,
  branchId: string,
  items: OpeningStockItem[]
): Promise<{ data: OpeningStockResult | null; error: Error | null }> {
  const { session, error: sessErr } = await requireDraftSession(supabase, tenantId)
  if (sessErr || !session) return { data: null, error: sessErr }

  const failed: { medicineId: string; message: string }[] = []
  const warnings: { medicineId: string; message: string }[] = []
  let imported = 0
  let totalValue = 0

  for (const item of items) {
    if (!(item.quantity > 0)) {
      failed.push({ medicineId: item.medicineId, message: "Quantity must be positive" })
      continue
    }

    const { data: medicine, error: medErr } = await supabase
      .from("medicines")
      .select("id, name, cost_price")
      .eq("id", item.medicineId)
      .eq("tenant_id", tenantId)
      .maybeSingle()

    if (medErr || !medicine) {
      failed.push({ medicineId: item.medicineId, message: "Medicine not found in this pharmacy" })
      continue
    }

    const { data: existingStock } = await supabase
      .from("medicine_branch_stock")
      .select("stock_quantity")
      .eq("branch_id", branchId)
      .eq("medicine_id", item.medicineId)
      .maybeSingle()

    const currentStock = Number((existingStock as { stock_quantity?: number } | null)?.stock_quantity ?? 0)
    if (currentStock > 0) {
      const name = (medicine as { name?: string }).name || "This medicine"
      warnings.push({
        medicineId: item.medicineId,
        message: `${name} already has ${currentStock} unit(s) at this branch — opening quantity was added on top. If that existing stock wasn't meant to be part of the opening count, this may double-count it.`,
      })
    }
    const newStock = currentStock + item.quantity

    const { error: stockErr } = await supabase
      .from("medicine_branch_stock")
      .upsert(
        { tenant_id: tenantId, branch_id: branchId, medicine_id: item.medicineId, stock_quantity: newStock },
        { onConflict: "branch_id,medicine_id" }
      )
    if (stockErr) {
      failed.push({ medicineId: item.medicineId, message: `Stock update failed: ${stockErr.message}` })
      continue
    }

    const { error: invErr } = await supabase.from("inventory_transactions").insert({
      tenant_id: tenantId,
      branch_id: branchId,
      medicine_id: item.medicineId,
      transaction_type: "adjustment",
      quantity: item.quantity,
      reference_type: "opening_stock",
      reason_code: "opening_stock",
      notes: "Opening stock — migration wizard",
      user_id: userId,
    })
    if (invErr) {
      // Roll back the stock bump so this item doesn't silently overstate inventory.
      await supabase
        .from("medicine_branch_stock")
        .update({ stock_quantity: currentStock })
        .eq("branch_id", branchId)
        .eq("medicine_id", item.medicineId)
      failed.push({ medicineId: item.medicineId, message: `Could not record inventory transaction: ${invErr.message}` })
      continue
    }

    const resolvedBatchNumber = item.batchNumber?.trim() || `OPEN-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`
    await supabase.from("medicine_batches").insert({
      tenant_id: tenantId,
      branch_id: branchId,
      medicine_id: item.medicineId,
      batch_number: resolvedBatchNumber,
      expiry_date: item.expiryDate || null,
      quantity_received: item.quantity,
      quantity_remaining: item.quantity,
      goods_receipt_id: null,
    })

    const currentCost = Number((medicine as { cost_price?: number | null }).cost_price ?? 0)
    if (!(currentCost > 0) && item.unitCost > 0) {
      await supabase.from("medicines").update({ cost_price: item.unitCost }).eq("id", item.medicineId).eq("tenant_id", tenantId)
    }

    imported += 1
    totalValue += item.quantity * item.unitCost
  }

  let voucherId: string | null = null
  if (totalValue > 0) {
    const value = Number(totalValue.toFixed(2))
    const { voucherId: vid, error: voucherErr } = await postSystemVoucher(supabase, tenantId, userId, {
      branchId,
      voucherDate: session.cutover_date,
      voucherType: "system_opening_balance",
      referenceType: "migration_opening_stock",
      referenceId: session.id,
      narration: "Opening stock (migration wizard)",
      lines: [
        { mapKey: "inventory", fallbackCode: "5000", description: "Opening stock", debit: value },
        { mapKey: "opening_balance_equity", fallbackCode: "3900", description: "Opening balance", credit: value },
      ],
    })
    if (voucherErr) {
      console.error(`[importOpeningStock] Voucher posting failed for tenant ${tenantId}: ${voucherErr.message}`)
    }
    voucherId = vid
  }

  return { data: { imported, failed, warnings, totalValue, voucherId }, error: null }
}

async function resolveUserBranchId(supabase: SupabaseClient, userId: string): Promise<string | null> {
  const { data } = await supabase.from("users").select("current_branch_id").eq("id", userId).maybeSingle()
  return (data as { current_branch_id: string | null } | null)?.current_branch_id ?? null
}

/** Opening cash-in-hand or bank balance (Dr Cash/Bank, Cr Opening balance equity). */
export async function setOpeningCashOrBank(
  supabase: SupabaseClient,
  tenantId: string,
  userId: string,
  input: { kind: "cash" | "bank"; amount: number; branchId?: string | null }
): Promise<{ voucherId: string | null; error: Error | null }> {
  const { session, error: sessErr } = await requireDraftSession(supabase, tenantId)
  if (sessErr || !session) return { voucherId: null, error: sessErr }
  if (!(input.amount > 0)) return { voucherId: null, error: new Error("Amount must be positive") }

  const referenceType = input.kind === "cash" ? "migration_opening_cash" : "migration_opening_bank"
  const { data: existing } = await supabase
    .from("accounting_vouchers")
    .select("id")
    .eq("tenant_id", tenantId)
    .eq("reference_type", referenceType)
    .eq("reference_id", session.id)
    .eq("status", "posted")
    .maybeSingle()
  if (existing) {
    return { voucherId: null, error: new Error(`Opening ${input.kind} balance was already set. Void the existing voucher in Accounting before re-entering it.`) }
  }

  const branchId = input.branchId ?? (await resolveUserBranchId(supabase, userId))
  const value = Number(input.amount.toFixed(2))
  const mapKey = input.kind === "cash" ? "cash_on_hand" : "bank"
  const fallbackCode = input.kind === "cash" ? "1000" : "1010"

  return postSystemVoucher(supabase, tenantId, userId, {
    branchId,
    voucherDate: session.cutover_date,
    voucherType: "system_opening_balance",
    referenceType,
    referenceId: session.id,
    narration: `Opening ${input.kind} balance (migration wizard)`,
    lines: [
      { mapKey, fallbackCode, description: `Opening ${input.kind}`, debit: value },
      { mapKey: "opening_balance_equity", fallbackCode: "3900", description: "Opening balance", credit: value },
    ],
  })
}

export interface OpeningPartyBalance {
  id: string
  amount: number
}

/** Opening customer AR balances: one customer_ledger_entries row per customer
 *  (so the per-customer statement is correct from day one) plus one GL voucher
 *  with a debit line to AR (1100) per customer and a single aggregate credit to
 *  opening balance equity. */
export async function importOpeningCustomerBalances(
  supabase: SupabaseClient,
  tenantId: string,
  userId: string,
  entries: OpeningPartyBalance[]
): Promise<{ data: { imported: number; failed: { id: string; message: string }[]; voucherId: string | null } | null; error: Error | null }> {
  const { session, error: sessErr } = await requireDraftSession(supabase, tenantId)
  if (sessErr || !session) return { data: null, error: sessErr }

  // Resolved once and applied to both the ledger rows and the GL voucher —
  // previously the ledger rows were left branch_id=NULL while the voucher
  // carried a branch, so a branch-scoped AR/AP reconciliation report couldn't
  // find the sub-ledger side of an opening balance and reported a false
  // discrepancy even though the GL and sub-ledger totals actually agreed.
  const branchId = await resolveUserBranchId(supabase, userId)

  const failed: { id: string; message: string }[] = []
  const lines: { mapKey: string; fallbackCode: string; description: string; debit?: number; credit?: number }[] = []
  let imported = 0
  let total = 0

  for (const entry of entries) {
    if (!(entry.amount > 0)) {
      failed.push({ id: entry.id, message: "Amount must be positive" })
      continue
    }
    const { data: customer, error: custErr } = await supabase
      .from("customers")
      .select("id, first_name, last_name")
      .eq("id", entry.id)
      .eq("tenant_id", tenantId)
      .maybeSingle()
    if (custErr || !customer) {
      failed.push({ id: entry.id, message: "Customer not found in this pharmacy" })
      continue
    }

    const { data: last } = await supabase
      .from("customer_ledger_entries")
      .select("balance_after")
      .eq("tenant_id", tenantId)
      .eq("customer_id", entry.id)
      .order("entry_date", { ascending: false })
      .order("created_at", { ascending: false })
      .limit(1)
      .maybeSingle()
    const priorBalance = Number((last as { balance_after?: number | null } | null)?.balance_after ?? 0)
    const value = Number(entry.amount.toFixed(2))

    const { error: ledgerErr } = await supabase.from("customer_ledger_entries").insert({
      tenant_id: tenantId,
      branch_id: branchId,
      customer_id: entry.id,
      entry_type: "adjustment",
      description: "Opening balance (migration wizard)",
      amount: value,
      balance_after: Number((priorBalance + value).toFixed(2)),
      entry_date: session.cutover_date,
      created_by: userId,
    })
    if (ledgerErr) {
      failed.push({ id: entry.id, message: ledgerErr.message })
      continue
    }

    const name = [customer.first_name, customer.last_name].filter(Boolean).join(" ") || "Customer"
    lines.push({ mapKey: "accounts_receivable", fallbackCode: "1100", description: `Opening AR — ${name}`, debit: value })
    imported += 1
    total += value
  }

  let voucherId: string | null = null
  if (total > 0) {
    lines.push({ mapKey: "opening_balance_equity", fallbackCode: "3900", description: "Opening balance", credit: Number(total.toFixed(2)) })
    const { voucherId: vid, error: voucherErr } = await postSystemVoucher(supabase, tenantId, userId, {
      branchId,
      voucherDate: session.cutover_date,
      voucherType: "system_opening_balance",
      referenceType: "migration_opening_customers",
      referenceId: null,
      narration: "Opening customer balances (migration wizard)",
      lines,
    })
    if (voucherErr) console.error(`[importOpeningCustomerBalances] Voucher posting failed for tenant ${tenantId}: ${voucherErr.message}`)
    voucherId = vid
  }

  return { data: { imported, failed, voucherId }, error: null }
}

/** Opening supplier AP balances — mirrors importOpeningCustomerBalances against
 *  supplier_ledger_entries, posted to each supplier's own AP account (same
 *  per-supplier sub-account ordinary purchases use — ensureSupplierPayableAccount
 *  — rather than the shared 2100 control account, so a supplier's opening
 *  balance actually shows up when drilling into their individual account, not
 *  just the shared control account and their ledger statement). */
export async function importOpeningSupplierBalances(
  supabase: SupabaseClient,
  tenantId: string,
  userId: string,
  entries: OpeningPartyBalance[]
): Promise<{ data: { imported: number; failed: { id: string; message: string }[]; voucherId: string | null } | null; error: Error | null }> {
  const { session, error: sessErr } = await requireDraftSession(supabase, tenantId)
  if (sessErr || !session) return { data: null, error: sessErr }

  const branchId = await resolveUserBranchId(supabase, userId)

  const failed: { id: string; message: string }[] = []
  const lines: SystemVoucherLineInput[] = []
  let imported = 0
  let total = 0

  for (const entry of entries) {
    if (!(entry.amount > 0)) {
      failed.push({ id: entry.id, message: "Amount must be positive" })
      continue
    }
    const { data: supplier, error: supErr } = await supabase
      .from("suppliers")
      .select("id, name")
      .eq("id", entry.id)
      .eq("tenant_id", tenantId)
      .maybeSingle()
    if (supErr || !supplier) {
      failed.push({ id: entry.id, message: "Supplier not found in this pharmacy" })
      continue
    }

    const { payableAccountId, error: apErr } = await ensureSupplierPayableAccount(supabase, tenantId, entry.id)
    if (apErr || !payableAccountId) {
      failed.push({ id: entry.id, message: apErr?.message || "Could not resolve supplier payable account" })
      continue
    }

    const { data: last } = await supabase
      .from("supplier_ledger_entries")
      .select("balance_after")
      .eq("tenant_id", tenantId)
      .eq("supplier_id", entry.id)
      .order("entry_date", { ascending: false })
      .order("created_at", { ascending: false })
      .limit(1)
      .maybeSingle()
    const priorBalance = Number((last as { balance_after?: number | null } | null)?.balance_after ?? 0)
    const value = Number(entry.amount.toFixed(2))

    const { error: ledgerErr } = await supabase.from("supplier_ledger_entries").insert({
      tenant_id: tenantId,
      branch_id: branchId,
      supplier_id: entry.id,
      entry_type: "adjustment",
      description: "Opening balance (migration wizard)",
      amount: value,
      balance_after: Number((priorBalance + value).toFixed(2)),
      entry_date: session.cutover_date,
    })
    if (ledgerErr) {
      failed.push({ id: entry.id, message: ledgerErr.message })
      continue
    }

    lines.push({ accountId: payableAccountId, description: `Opening AP — ${supplier.name}`, credit: value })
    imported += 1
    total += value
  }

  let voucherId: string | null = null
  if (total > 0) {
    lines.push({ mapKey: "opening_balance_equity", fallbackCode: "3900", description: "Opening balance", debit: Number(total.toFixed(2)) })
    const { voucherId: vid, error: voucherErr } = await postSystemVoucher(supabase, tenantId, userId, {
      branchId,
      voucherDate: session.cutover_date,
      voucherType: "system_opening_balance",
      referenceType: "migration_opening_suppliers",
      referenceId: null,
      narration: "Opening supplier balances (migration wizard)",
      lines,
    })
    if (voucherErr) console.error(`[importOpeningSupplierBalances] Voucher posting failed for tenant ${tenantId}: ${voucherErr.message}`)
    voucherId = vid
  }

  return { data: { imported, failed, voucherId }, error: null }
}
