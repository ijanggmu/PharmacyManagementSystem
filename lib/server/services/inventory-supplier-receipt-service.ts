/**
 * Post supplier payables + purchase voucher for stock already recorded on medicines
 * (create medicine, bulk import, CSV import, stock increase) — no second stock movement.
 */

import type { SupabaseClient } from "@supabase/supabase-js"
import { ensureSupplierPayableAccount } from "@/lib/server/services/accounting-service"
import { getPrimaryBranchId } from "@/lib/server/services/tenant-branch"

export type DirectGoodsReceiptRow = {
  id: string
  receipt_number: string
  receipt_date: string
  supplier_id: string | null
  supplier_name: string | null
  supplier_invoice_number: string | null
  status: string
  item_count: number
  total_cost: number
}

/** Receipts posted without a purchase order (create/edit medicine with a supplier,
 *  bulk import) — these never appear in listPurchaseOrders since they have no PO,
 *  so the Purchases page needs this separate feed to show them at all. */
export async function listDirectGoodsReceipts(
  supabase: SupabaseClient,
  tenantId: string,
  limit = 100
): Promise<{ data: DirectGoodsReceiptRow[]; error: Error | null }> {
  const { data: receipts, error: grErr } = await supabase
    .from("goods_receipts")
    .select("id, receipt_number, receipt_date, supplier_id, supplier_invoice_number, status, suppliers ( name )")
    .eq("tenant_id", tenantId)
    .is("purchase_order_id", null)
    .order("receipt_date", { ascending: false })
    .order("created_at", { ascending: false })
    .limit(limit)

  if (grErr) return { data: [], error: new Error(grErr.message) }
  const receiptRows = (receipts || []) as Array<{
    id: string
    receipt_number: string
    receipt_date: string
    supplier_id: string | null
    supplier_invoice_number: string | null
    status: string
    suppliers: { name: string } | { name: string }[] | null
  }>
  if (receiptRows.length === 0) return { data: [], error: null }

  const receiptIds = receiptRows.map((r) => r.id)
  const { data: items, error: itemsErr } = await supabase
    .from("goods_receipt_items")
    .select("goods_receipt_id, total_cost")
    .in("goods_receipt_id", receiptIds)

  if (itemsErr) return { data: [], error: new Error(itemsErr.message) }

  const totalsByReceipt = new Map<string, { count: number; total: number }>()
  for (const item of (items || []) as Array<{ goods_receipt_id: string; total_cost: number }>) {
    const entry = totalsByReceipt.get(item.goods_receipt_id) ?? { count: 0, total: 0 }
    entry.count += 1
    entry.total += Number(item.total_cost)
    totalsByReceipt.set(item.goods_receipt_id, entry)
  }

  const data: DirectGoodsReceiptRow[] = receiptRows.map((r) => {
    const supplier = Array.isArray(r.suppliers) ? r.suppliers[0] : r.suppliers
    const totals = totalsByReceipt.get(r.id) ?? { count: 0, total: 0 }
    return {
      id: r.id,
      receipt_number: r.receipt_number,
      receipt_date: r.receipt_date,
      supplier_id: r.supplier_id,
      supplier_name: supplier?.name ?? null,
      supplier_invoice_number: r.supplier_invoice_number,
      status: r.status,
      item_count: totals.count,
      total_cost: totals.total,
    }
  })

  return { data, error: null }
}

export type DirectSupplierReceiptLine = {
  medicineId: string
  quantity: number
  unitCost: number
  vatAmount?: number
}

export type DirectSupplierReceiptBatch = {
  supplierId: string
  lines: DirectSupplierReceiptLine[]
  /** Per-batch bill number — lets one call post several distinct supplier bills at
   *  once (e.g. bulk import's bill-group cards), each as its own goods_receipt +
   *  ledger entry. Falls back to the call-level `supplierInvoiceNumber` when omitted,
   *  so single-batch callers (create/update medicine) are unaffected. */
  supplierInvoiceNumber?: string | null
  /** Per-batch receipt date, same fallback rationale as above. */
  receiptDate?: string
}

export type PostDirectInventorySupplierReceiptsInput = {
  receiptDate: string
  supplierInvoiceNumber?: string | null
  batches: DirectSupplierReceiptBatch[]
}

function isMissingSupplierIdColumnError(message: string | undefined): boolean {
  if (!message) return false
  return (
    message.includes("Could not find the 'supplier_id' column of 'goods_receipts'") ||
    message.includes("column \"supplier_id\" of relation \"goods_receipts\" does not exist")
  )
}

export async function postDirectInventorySupplierReceipts(
  supabase: SupabaseClient,
  tenantId: string,
  userId: string,
  input: PostDirectInventorySupplierReceiptsInput
) {
  const { data: actor } = await supabase
    .from("users")
    .select("current_branch_id")
    .eq("id", userId)
    .maybeSingle()
  const branchId =
    (actor as { current_branch_id: string | null } | null)?.current_branch_id ??
    (await getPrimaryBranchId(supabase, tenantId))
  const receipts: Array<{ goods_receipt_id: string; receipt_number: string }> = []

  for (const batch of input.batches) {
    const rawLines = batch.lines.filter((l) => l.quantity > 0)
    if (rawLines.length === 0) continue

    const { data: sup, error: supErr } = await supabase
      .from("suppliers")
      .select("id")
      .eq("id", batch.supplierId)
      .eq("tenant_id", tenantId)
      .single()

    if (supErr || !sup) {
      throw new Error("Supplier not found for this tenant")
    }

    await ensureSupplierPayableAccount(supabase, tenantId, batch.supplierId)

    type Validated = {
      medicineId: string
      qty: number
      unitCost: string
      lineNet: number
      lineVat: number
    }

    const validated: Validated[] = []
    let totalGrossForAp = 0

    for (const line of rawLines) {
      // Re-selecting a medicine inserted moments earlier in the same request has
      // occasionally come back empty (transient PostgREST/connection-pool hiccup)
      // — retry once after a short delay before giving up, rather than throwing
      // and rolling back a perfectly valid medicine over a one-off blip.
      let med: { id: string; tenant_id: string } | null = null
      let medErr: { message: string } | null = null
      for (let attempt = 0; attempt < 2; attempt++) {
        const result = await supabase.from("medicines").select("id, tenant_id").eq("id", line.medicineId).single()
        med = result.data as { id: string; tenant_id: string } | null
        medErr = result.error ? { message: result.error.message } : null
        if (med) break
        if (attempt === 0) await new Promise((resolve) => setTimeout(resolve, 250))
      }

      if (medErr || !med || med.tenant_id !== tenantId) {
        throw new Error(
          `Medicine not found for this tenant (medicine ${line.medicineId}${medErr ? `: ${medErr.message}` : ""})`
        )
      }

      const vatRaw = line.vatAmount ?? 0
      if (Number.isNaN(vatRaw) || vatRaw < 0) {
        throw new Error("Invalid VAT amount on receipt line")
      }

      const unitCost = Number(line.unitCost)
      if (Number.isNaN(unitCost) || unitCost < 0) {
        throw new Error("Invalid unit cost on receipt line")
      }

      const lineNet = unitCost * line.quantity
      if (lineNet <= 0) continue

      totalGrossForAp += lineNet + vatRaw
      validated.push({
        medicineId: line.medicineId,
        qty: line.quantity,
        unitCost: String(unitCost),
        lineNet,
        lineVat: vatRaw,
      })
    }

    if (validated.length === 0 || totalGrossForAp <= 0) continue

    const receiptNumber = `DGR-${Date.now()}-${Math.random().toString(36).slice(2, 10)}`

    const supplierBill = (batch.supplierInvoiceNumber ?? input.supplierInvoiceNumber)?.trim() || null
    const batchReceiptDate = batch.receiptDate || input.receiptDate

    const receiptBase = {
      tenant_id: tenantId,
      purchase_order_id: null,
      receipt_number: receiptNumber,
      receipt_date: batchReceiptDate,
      status: "draft",
      supplier_invoice_number: supplierBill,
      branch_id: branchId,
      created_by: userId,
    }

    let grn: { id: string } | null = null
    let grnError: { message: string } | null = null

    const withSupplierInsert = await supabase
      .from("goods_receipts")
      .insert({
        ...receiptBase,
        supplier_id: batch.supplierId,
      })
      .select()
      .single()

    if (withSupplierInsert.error && isMissingSupplierIdColumnError(withSupplierInsert.error.message)) {
      // Compatibility fallback for DBs where migration adding goods_receipts.supplier_id is not yet applied.
      const fallbackInsert = await supabase.from("goods_receipts").insert(receiptBase).select().single()
      grn = (fallbackInsert.data as { id: string } | null) ?? null
      grnError = fallbackInsert.error ? { message: fallbackInsert.error.message } : null
    } else {
      grn = (withSupplierInsert.data as { id: string } | null) ?? null
      grnError = withSupplierInsert.error ? { message: withSupplierInsert.error.message } : null
    }

    if (grnError || !grn) {
      throw new Error(grnError?.message || "Failed to create goods receipt")
    }

    for (const v of validated) {
      const { error: griError } = await supabase.from("goods_receipt_items").insert({
        goods_receipt_id: grn.id,
        medicine_id: v.medicineId,
        quantity_received: v.qty,
        unit_cost: v.unitCost,
        total_cost: v.lineNet.toString(),
        vat_amount: v.lineVat.toString(),
        branch_id: branchId,
      })
      if (griError) throw new Error(griError.message)
    }

    const { data: existingEntries } = await supabase
      .from("supplier_ledger_entries")
      .select("balance_after")
      .eq("supplier_id", batch.supplierId)
      .order("entry_date", { ascending: false })
      .order("created_at", { ascending: false })
      .limit(1)

    const lastBalance = Number(existingEntries?.[0]?.balance_after ?? 0)
    const newBalance = lastBalance + totalGrossForAp

    const { error: ledgerError } = await supabase.from("supplier_ledger_entries").insert({
      tenant_id: tenantId,
      supplier_id: batch.supplierId,
      purchase_order_id: null,
      goods_receipt_id: grn.id,
      reference_number: receiptNumber,
      supplier_bill_number: supplierBill,
      entry_type: "invoice",
      amount: totalGrossForAp.toString(),
      balance_after: newBalance.toString(),
      entry_date: batchReceiptDate,
    })

    if (ledgerError) throw new Error(ledgerError.message)

    const { error: updErr } = await supabase.from("goods_receipts").update({ status: "received" }).eq("id", grn.id)

    if (updErr) throw new Error(updErr.message)

    receipts.push({ goods_receipt_id: grn.id, receipt_number: receiptNumber })
  }

  return { receipts }
}
