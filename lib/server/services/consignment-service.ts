/**
 * Consignment inventory (2026-09 ERP audit, priority item #8): stock a
 * supplier places on the shelf that the pharmacy does not own — and does not
 * owe for — until it actually sells.
 *
 * Receiving intentionally bypasses the purchase-order/GRN pipeline: ownership
 * hasn't transferred, so unlike a normal GRN this posts no accounting voucher
 * and no supplier_ledger_entries row at receipt. It only makes the stock
 * physically sellable (medicine_branch_stock + a medicine_batches row flagged
 * is_consignment), so FEFO and the POS treat it exactly like owned stock.
 *
 * Settlement is what actually recognizes the purchase. It can't happen at
 * sale time — deduct_fefo_batches (the FEFO deduction the ordinary sale flow
 * already calls) decrements medicine_batches.quantity_remaining without
 * recording which sale drew from which batch (a documented limitation, see
 * scripts/93-sale-cancellation.sql). Settlement instead reads how far each
 * consignment batch's quantity_remaining has dropped since it was last
 * settled and posts one correcting voucher — Dr Inventory / Cr the supplier's
 * AP account — for that value. This undoes the phantom inventory credit the
 * automatic per-sale voucher already posted against stock the pharmacy never
 * owned, and records the real payable. Net effect of a sale plus its later
 * settlement: Dr COGS / Cr Supplier AP — exactly what happened in the
 * business, with no inventory asset ever booked for stock still on
 * consignment.
 */

import type { SupabaseClient } from "@supabase/supabase-js"
import { ensureSupplierPayableAccount, postSystemVoucher, getPostingLockDate, assertVoucherDateOpen } from "@/lib/server/services/accounting-service"
import { getPrimaryBranchId } from "@/lib/server/services/tenant-branch"

export interface ReceiveConsignmentStockInput {
  medicineId: string
  supplierId: string
  branchId?: string | null
  quantity: number
  unitCost: number
  batchNumber?: string | null
  expiryDate?: string | null
  rackLocation?: string | null
}

export async function receiveConsignmentStock(
  supabase: SupabaseClient,
  tenantId: string,
  userId: string,
  input: ReceiveConsignmentStockInput
): Promise<{ data: { batchId: string } | null; error: Error | null }> {
  if (!(input.quantity > 0)) return { data: null, error: new Error("Quantity must be positive") }
  if (!(input.unitCost >= 0)) return { data: null, error: new Error("Unit cost cannot be negative") }

  const { data: medicine, error: medErr } = await supabase
    .from("medicines")
    .select("id")
    .eq("id", input.medicineId)
    .eq("tenant_id", tenantId)
    .maybeSingle()
  if (medErr || !medicine) return { data: null, error: new Error("Medicine not found in this pharmacy") }

  const { data: supplier, error: supErr } = await supabase
    .from("suppliers")
    .select("id")
    .eq("id", input.supplierId)
    .eq("tenant_id", tenantId)
    .maybeSingle()
  if (supErr || !supplier) return { data: null, error: new Error("Supplier not found in this pharmacy") }

  const branchId = input.branchId || (await getPrimaryBranchId(supabase, tenantId))

  const { data: existingStock } = await supabase
    .from("medicine_branch_stock")
    .select("stock_quantity")
    .eq("branch_id", branchId)
    .eq("medicine_id", input.medicineId)
    .maybeSingle()

  const currentStock = Number((existingStock as { stock_quantity?: number } | null)?.stock_quantity ?? 0)
  const newStock = currentStock + input.quantity

  const { error: stockErr } = await supabase
    .from("medicine_branch_stock")
    .upsert(
      { tenant_id: tenantId, branch_id: branchId, medicine_id: input.medicineId, stock_quantity: newStock },
      { onConflict: "branch_id,medicine_id" }
    )
  if (stockErr) return { data: null, error: new Error(`Stock update failed: ${stockErr.message}`) }

  const { error: invErr } = await supabase.from("inventory_transactions").insert({
    tenant_id: tenantId,
    branch_id: branchId,
    medicine_id: input.medicineId,
    transaction_type: "purchase",
    quantity: input.quantity,
    reference_type: "consignment_receipt",
    reason_code: "consignment_receipt",
    notes: "Consignment stock received — supplier retains ownership until settled",
    user_id: userId,
  })
  if (invErr) {
    await supabase.from("medicine_branch_stock").update({ stock_quantity: currentStock }).eq("branch_id", branchId).eq("medicine_id", input.medicineId)
    return { data: null, error: new Error(`Could not record inventory transaction: ${invErr.message}`) }
  }

  const resolvedBatchNumber = input.batchNumber?.trim() || `CONSIGN-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`
  const { data: batch, error: batchErr } = await supabase
    .from("medicine_batches")
    .insert({
      tenant_id: tenantId,
      branch_id: branchId,
      medicine_id: input.medicineId,
      batch_number: resolvedBatchNumber,
      expiry_date: input.expiryDate || null,
      rack_location: input.rackLocation?.trim() || null,
      quantity_received: input.quantity,
      quantity_remaining: input.quantity,
      goods_receipt_id: null,
      is_consignment: true,
      consignment_supplier_id: input.supplierId,
      consignment_unit_cost: input.unitCost,
    })
    .select("id")
    .single()

  if (batchErr || !batch) {
    // Roll back — leaving stock bumped with no batch row would let it be sold
    // as if it were ordinary owned stock with no consignment trail at all.
    await Promise.all([
      supabase.from("medicine_branch_stock").update({ stock_quantity: currentStock }).eq("branch_id", branchId).eq("medicine_id", input.medicineId),
      supabase.from("inventory_transactions").delete().eq("tenant_id", tenantId).eq("reference_type", "consignment_receipt").eq("medicine_id", input.medicineId).eq("quantity", input.quantity).eq("user_id", userId),
    ])
    return { data: null, error: new Error(`Could not record consignment batch: ${batchErr?.message}`) }
  }

  return { data: { batchId: (batch as { id: string }).id }, error: null }
}

export interface ConsignmentPositionRow {
  batch_id: string
  medicine_id: string
  medicine_name: string
  batch_number: string
  supplier_id: string
  supplier_name: string
  quantity_received: number
  quantity_remaining: number
  settled_quantity: number
  /** quantity_received - quantity_remaining - settled_quantity: sold but not yet settled. */
  unsettled_sold_quantity: number
  unit_cost: number
  unsettled_value: number
}

/** Outstanding consignment position — what's still on the shelf plus what's
 *  been sold but not yet settled with the supplier. Drives both the "what do I
 *  owe if I settle now" view and the settlement action itself. */
export async function listConsignmentPositions(
  supabase: SupabaseClient,
  tenantId: string,
  filters: { supplierId?: string | null } = {}
): Promise<{ data: ConsignmentPositionRow[]; error: Error | null }> {
  let query = supabase
    .from("medicine_batches")
    .select(
      `
      id,
      medicine_id,
      batch_number,
      consignment_supplier_id,
      quantity_received,
      quantity_remaining,
      consignment_settled_quantity,
      consignment_unit_cost,
      medicines ( name ),
      suppliers:consignment_supplier_id ( name )
    `
    )
    .eq("tenant_id", tenantId)
    .eq("is_consignment", true)

  if (filters.supplierId) query = query.eq("consignment_supplier_id", filters.supplierId)

  const { data, error } = await query
  if (error) return { data: [], error: new Error(error.message) }

  const rows: ConsignmentPositionRow[] = (data || []).map((raw) => {
    const r = raw as {
      id: string
      medicine_id: string
      batch_number: string
      consignment_supplier_id: string
      quantity_received: number
      quantity_remaining: number
      consignment_settled_quantity: number
      consignment_unit_cost: number
      medicines: { name: string } | { name: string }[] | null
      suppliers: { name: string } | { name: string }[] | null
    }
    const medicine = Array.isArray(r.medicines) ? r.medicines[0] : r.medicines
    const supplier = Array.isArray(r.suppliers) ? r.suppliers[0] : r.suppliers
    const sold = r.quantity_received - r.quantity_remaining
    const unsettledSold = Math.max(0, sold - r.consignment_settled_quantity)
    return {
      batch_id: r.id,
      medicine_id: r.medicine_id,
      medicine_name: medicine?.name ?? "Unknown",
      batch_number: r.batch_number,
      supplier_id: r.consignment_supplier_id,
      supplier_name: supplier?.name ?? "Unknown",
      quantity_received: r.quantity_received,
      quantity_remaining: r.quantity_remaining,
      settled_quantity: r.consignment_settled_quantity,
      unsettled_sold_quantity: unsettledSold,
      unit_cost: Number(r.consignment_unit_cost),
      unsettled_value: Number((unsettledSold * Number(r.consignment_unit_cost)).toFixed(2)),
    }
  })

  rows.sort((a, b) => b.unsettled_value - a.unsettled_value)
  return { data: rows, error: null }
}

/** Settles every consignment batch for one supplier that has unsettled sold
 *  quantity: bumps consignment_settled_quantity, posts one voucher (Dr
 *  Inventory / Cr supplier AP) for the total, and writes a supplier ledger
 *  entry so the supplier's statement reflects it like any other invoice. */
export async function settleConsignmentForSupplier(
  supabase: SupabaseClient,
  tenantId: string,
  userId: string,
  supplierId: string,
  settlementDate: string
): Promise<{ data: { settlementId: string | null; totalQuantity: number; totalValue: number } | null; error: Error | null }> {
  const { data: positions, error: posErr } = await listConsignmentPositions(supabase, tenantId, { supplierId })
  if (posErr) return { data: null, error: posErr }

  const due = positions.filter((p) => p.unsettled_sold_quantity > 0)
  if (due.length === 0) {
    return { data: { settlementId: null, totalQuantity: 0, totalValue: 0 }, error: null }
  }

  const { lockDate, error: lockErr } = await getPostingLockDate(supabase, tenantId)
  if (lockErr) return { data: null, error: lockErr }
  try {
    assertVoucherDateOpen(lockDate, settlementDate)
  } catch (e) {
    return { data: null, error: e instanceof Error ? e : new Error("Posting not allowed") }
  }

  const { payableAccountId, error: apErr } = await ensureSupplierPayableAccount(supabase, tenantId, supplierId)
  if (apErr || !payableAccountId) return { data: null, error: apErr || new Error("Could not resolve supplier payable account") }

  const totalQuantity = due.reduce((s, p) => s + p.unsettled_sold_quantity, 0)
  const totalValue = Number(due.reduce((s, p) => s + p.unsettled_value, 0).toFixed(2))

  const branchId = await getPrimaryBranchId(supabase, tenantId).catch(() => null)

  const { voucherId, error: voucherErr } = await postSystemVoucher(supabase, tenantId, userId, {
    branchId,
    voucherDate: settlementDate,
    voucherType: "system_consignment_settlement",
    referenceType: "consignment_settlement",
    referenceId: null,
    narration: `Consignment settlement — ${totalQuantity} unit(s) across ${due.length} batch(es)`,
    lines: [
      { mapKey: "inventory", fallbackCode: "5000", description: "Consignment stock sold — recognize as inventory movement", debit: totalValue },
      { accountId: payableAccountId, description: "Consignment payable", credit: totalValue },
    ],
  })
  if (voucherErr || !voucherId) {
    return { data: null, error: voucherErr || new Error("Voucher posting failed") }
  }

  const { data: settlement, error: setErr } = await supabase
    .from("consignment_settlements")
    .insert({
      tenant_id: tenantId,
      branch_id: branchId,
      supplier_id: supplierId,
      settlement_date: settlementDate,
      total_quantity: totalQuantity,
      total_value: totalValue,
      voucher_id: voucherId,
      created_by: userId,
    })
    .select("id")
    .single()

  if (setErr || !settlement) {
    return { data: null, error: new Error(setErr?.message || "Could not record settlement") }
  }
  const settlementId = (settlement as { id: string }).id

  const { error: lineErr } = await supabase.from("consignment_settlement_lines").insert(
    due.map((p) => ({
      tenant_id: tenantId,
      settlement_id: settlementId,
      batch_id: p.batch_id,
      quantity: p.unsettled_sold_quantity,
      unit_cost: p.unit_cost,
      value: p.unsettled_value,
    }))
  )
  if (lineErr) {
    return { data: null, error: new Error(`Settlement recorded but detail lines failed: ${lineErr.message}`) }
  }

  for (const p of due) {
    await supabase
      .from("medicine_batches")
      .update({ consignment_settled_quantity: p.settled_quantity + p.unsettled_sold_quantity })
      .eq("id", p.batch_id)
      .eq("tenant_id", tenantId)
  }

  const { data: last } = await supabase
    .from("supplier_ledger_entries")
    .select("balance_after")
    .eq("tenant_id", tenantId)
    .eq("supplier_id", supplierId)
    .order("entry_date", { ascending: false })
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle()
  const priorBalance = Number((last as { balance_after?: number | null } | null)?.balance_after ?? 0)

  await supabase.from("supplier_ledger_entries").insert({
    tenant_id: tenantId,
    branch_id: branchId,
    supplier_id: supplierId,
    entry_type: "invoice",
    description: `Consignment settlement — ${totalQuantity} unit(s)`,
    amount: totalValue,
    balance_after: Number((priorBalance + totalValue).toFixed(2)),
    entry_date: settlementDate,
  })

  return { data: { settlementId, totalQuantity, totalValue }, error: null }
}

export interface ConsignmentSettlement {
  id: string
  supplier_id: string
  supplier_name: string
  settlement_date: string
  total_quantity: number
  total_value: number
  voucher_id: string | null
  created_at: string
}

export async function listConsignmentSettlements(
  supabase: SupabaseClient,
  tenantId: string,
  filters: { supplierId?: string | null; limit?: number } = {}
): Promise<{ data: ConsignmentSettlement[]; error: Error | null }> {
  let query = supabase
    .from("consignment_settlements")
    .select("id, supplier_id, settlement_date, total_quantity, total_value, voucher_id, created_at, suppliers ( name )")
    .eq("tenant_id", tenantId)
    .order("settlement_date", { ascending: false })
    .limit(Math.min(200, Math.max(1, filters.limit ?? 50)))

  if (filters.supplierId) query = query.eq("supplier_id", filters.supplierId)

  const { data, error } = await query
  if (error) return { data: [], error: new Error(error.message) }

  const rows: ConsignmentSettlement[] = (data || []).map((raw) => {
    const r = raw as {
      id: string
      supplier_id: string
      settlement_date: string
      total_quantity: number
      total_value: number
      voucher_id: string | null
      created_at: string
      suppliers: { name: string } | { name: string }[] | null
    }
    const supplier = Array.isArray(r.suppliers) ? r.suppliers[0] : r.suppliers
    return {
      id: r.id,
      supplier_id: r.supplier_id,
      supplier_name: supplier?.name ?? "Unknown",
      settlement_date: r.settlement_date,
      total_quantity: r.total_quantity,
      total_value: Number(r.total_value),
      voucher_id: r.voucher_id,
      created_at: r.created_at,
    }
  })

  return { data: rows, error: null }
}
