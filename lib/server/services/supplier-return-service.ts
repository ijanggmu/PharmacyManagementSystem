import type { SupabaseClient } from "@supabase/supabase-js"
import { getPrimaryBranchId } from "@/lib/server/services/tenant-branch"

export interface CreateSupplierReturnItemInput {
  medicine_id: string
  quantity: number
  unit_cost: number
  return_reason: string
  notes?: string | null
}

export interface CreateSupplierReturnInput {
  supplier_id: string
  notes?: string | null
  items: CreateSupplierReturnItemInput[]
  /** Explicit branch override — used by voidGoodsReceipt so the reversal targets
   *  the branch that actually received the stock, not wherever the acting user
   *  is currently working from (those can differ for a tenant-wide role). When
   *  omitted, falls back to the acting user's current branch, then the tenant's
   *  primary branch — unchanged behavior for a manual return via the UI, where
   *  "the branch I'm standing in" genuinely is the right branch. */
  branch_id?: string | null
}

/** Supabase multi-row selects always resolve to an array in production; this just
 *  guards against a malformed/unexpected response shape rather than throwing. */
function asArray<T>(data: unknown): T[] {
  return Array.isArray(data) ? (data as T[]) : []
}

/** Total ever received from this supplier for this medicine, across both the
 *  formal PO->GRN path (goods_receipts.purchase_order_id -> purchase_orders.supplier_id)
 *  and direct/bulk-import receipts (goods_receipts.supplier_id set directly) — same
 *  two-path union needed in supplier-cost-history-service.ts, since a receipt can
 *  reach a supplier either way. */
async function getReceivedQuantity(
  supabase: SupabaseClient,
  tenantId: string,
  supplierId: string,
  medicineId: string
): Promise<number> {
  const { data: pos } = await supabase
    .from("purchase_orders")
    .select("id")
    .eq("tenant_id", tenantId)
    .eq("supplier_id", supplierId)
  const poIds = asArray<{ id: string }>(pos).map((p) => p.id)

  const [byPo, direct] = await Promise.all([
    poIds.length > 0
      ? supabase.from("goods_receipts").select("id").eq("tenant_id", tenantId).in("purchase_order_id", poIds)
      : Promise.resolve({ data: [] as { id: string }[] }),
    supabase.from("goods_receipts").select("id").eq("tenant_id", tenantId).eq("supplier_id", supplierId),
  ])
  const receiptIds = [
    ...new Set([...asArray<{ id: string }>(byPo.data), ...asArray<{ id: string }>(direct.data)].map((r) => r.id)),
  ]
  if (receiptIds.length === 0) return 0

  const { data: items } = await supabase
    .from("goods_receipt_items")
    .select("quantity_received")
    .in("goods_receipt_id", receiptIds)
    .eq("medicine_id", medicineId)

  return asArray<{ quantity_received: number }>(items).reduce((sum, i) => sum + Number(i.quantity_received), 0)
}

/** Total already returned to this supplier for this medicine, across all prior
 *  supplier_returns — needed so a return can't exceed what's left to return. */
async function getAlreadyReturnedQuantity(
  supabase: SupabaseClient,
  tenantId: string,
  supplierId: string,
  medicineId: string
): Promise<number> {
  const { data: returns } = await supabase
    .from("supplier_returns")
    .select("id")
    .eq("tenant_id", tenantId)
    .eq("supplier_id", supplierId)
  const returnIds = asArray<{ id: string }>(returns).map((r) => r.id)
  if (returnIds.length === 0) return 0

  const { data: items } = await supabase
    .from("supplier_return_items")
    .select("quantity")
    .in("return_id", returnIds)
    .eq("medicine_id", medicineId)

  return asArray<{ quantity: number }>(items).reduce((sum, i) => sum + Number(i.quantity), 0)
}

export async function createSupplierReturnForTenant(
  supabase: SupabaseClient,
  tenantId: string,
  userId: string,
  input: CreateSupplierReturnInput
): Promise<{ data: unknown | null; error: Error | null; conflict?: string }> {
  const totalQuantity = input.items.reduce((sum, i) => sum + i.quantity, 0)
  const totalCost = input.items.reduce((sum, i) => sum + i.quantity * i.unit_cost, 0)
  const today = new Date().toISOString().slice(0, 10)

  let branchId: string | null = input.branch_id ?? null
  if (!branchId) {
    const { data: actor } = await supabase
      .from("users")
      .select("current_branch_id")
      .eq("id", userId)
      .maybeSingle()
    branchId = (actor as { current_branch_id: string | null } | null)?.current_branch_id ?? null
  }
  if (!branchId) {
    branchId = await getPrimaryBranchId(supabase, tenantId)
  }

  for (const item of input.items) {
    const { data: med, error: medErr } = await supabase
      .from("medicines")
      .select("id")
      .eq("id", item.medicine_id)
      .eq("tenant_id", tenantId)
      .single()
    if (medErr || !med) {
      return { data: null, error: new Error(`Medicine not found: ${item.medicine_id}`) }
    }

    const { data: branchStock } = await supabase
      .from("medicine_branch_stock")
      .select("stock_quantity")
      .eq("branch_id", branchId)
      .eq("medicine_id", item.medicine_id)
      .maybeSingle()
    const available = Number((branchStock as { stock_quantity?: number } | null)?.stock_quantity ?? 0)

    if (available < item.quantity) {
      return {
        data: null,
        error: new Error(`Insufficient stock for medicine ${item.medicine_id} at this branch. Available: ${available}`),
      }
    }

    // R5 (domain audit): a return could otherwise exceed what was ever actually
    // purchased from this supplier — stock availability alone doesn't catch that
    // if the medicine was topped up from a different supplier or a manual adjustment.
    // Only enforced when receipt history actually exists for this supplier+medicine
    // (received > 0): plenty of existing stock predates receipt-tracking entirely
    // (e.g. Add Medicine without a supplier selected), and treating "no tracked
    // receipts found" as "0 ever purchased" would wrongly block legitimate returns
    // for all of that stock rather than catching a real over-return.
    const [received, alreadyReturned] = await Promise.all([
      getReceivedQuantity(supabase, tenantId, input.supplier_id, item.medicine_id),
      getAlreadyReturnedQuantity(supabase, tenantId, input.supplier_id, item.medicine_id),
    ])
    if (received > 0) {
      const eligibleToReturn = received - alreadyReturned
      if (item.quantity > eligibleToReturn) {
        return {
          data: null,
          error: new Error(
            `Cannot return ${item.quantity} of medicine ${item.medicine_id} to this supplier — only ${Math.max(0, eligibleToReturn)} remain eligible (received ${received}, already returned ${alreadyReturned}).`
          ),
        }
      }
    }
  }

  const { data: returnHeader, error: returnErr } = await supabase
    .from("supplier_returns")
    .insert({
      supplier_id: input.supplier_id,
      user_id: userId,
      quantity_returned: totalQuantity,
      total_cost: totalCost,
      return_reason: "supplier_return",
      status: "completed",
      notes: input.notes ?? null,
      tenant_id: tenantId,
      return_date: today,
      medicine_id: null,
    })
    .select()
    .single()

  if (returnErr || !returnHeader) {
    return { data: null, error: new Error(returnErr?.message || "Failed to create supplier return") }
  }

  const rows = input.items.map((i) => ({
    return_id: returnHeader.id,
    medicine_id: i.medicine_id,
    quantity: i.quantity,
    unit_cost: i.unit_cost,
    total_cost: i.quantity * i.unit_cost,
    return_reason: i.return_reason,
    notes: i.notes ?? null,
    tenant_id: tenantId,
  }))
  const { error: itemsErr } = await supabase.from("supplier_return_items").insert(rows)
  if (itemsErr) {
    await supabase.from("supplier_returns").delete().eq("id", returnHeader.id).eq("tenant_id", tenantId)
    return { data: null, error: new Error(itemsErr.message) }
  }

  // Reduce the per-supplier AP subledger to match the GL control account (2100),
  // which trg_supplier_returns_accounting already credits automatically on this
  // insert (status: "completed" above). Without this, the tenant-wide trial balance
  // still reconciles, but this supplier's own statement/aging keeps showing the
  // returned goods as still owed.
  if (totalCost > 0) {
    const { data: existingEntries } = await supabase
      .from("supplier_ledger_entries")
      .select("balance_after")
      .eq("supplier_id", input.supplier_id)
      .order("entry_date", { ascending: false })
      .order("created_at", { ascending: false })
      .limit(1)

    const lastBalance = Number(existingEntries?.[0]?.balance_after ?? 0)
    const newBalance = lastBalance - totalCost

    const { error: ledgerError } = await supabase.from("supplier_ledger_entries").insert({
      tenant_id: tenantId,
      supplier_id: input.supplier_id,
      reference_number: returnHeader.return_number ?? returnHeader.id,
      entry_type: "credit_note",
      description: `Return to supplier: ${input.notes || "goods returned"}`,
      amount: totalCost,
      balance_after: newBalance,
      entry_date: today,
    })
    if (ledgerError) {
      await supabase.from("supplier_return_items").delete().eq("return_id", returnHeader.id)
      await supabase.from("supplier_returns").delete().eq("id", returnHeader.id).eq("tenant_id", tenantId)
      return { data: null, error: new Error(`Supplier ledger update failed: ${ledgerError.message}`) }
    }
  }

  for (const item of input.items) {
    const { data: branchStock } = await supabase
      .from("medicine_branch_stock")
      .select("stock_quantity")
      .eq("branch_id", branchId)
      .eq("medicine_id", item.medicine_id)
      .maybeSingle()
    const newStock = Number((branchStock as { stock_quantity?: number } | null)?.stock_quantity ?? 0) - item.quantity

    const { error: stockErr } = await supabase
      .from("medicine_branch_stock")
      .upsert(
        { tenant_id: tenantId, branch_id: branchId, medicine_id: item.medicine_id, stock_quantity: Math.max(0, newStock) },
        { onConflict: "branch_id,medicine_id" }
      )
    if (stockErr) return { data: null, error: new Error(stockErr.message) }

    const { error: invErr } = await supabase.from("inventory_transactions").insert({
      medicine_id: item.medicine_id,
      transaction_type: "adjustment",
      quantity: -item.quantity,
      reference_id: returnHeader.id,
      reference_type: "supplier_return",
      tenant_id: tenantId,
      branch_id: branchId,
      notes: `Return to supplier ${returnHeader.return_number ?? returnHeader.id}`,
    })
    if (invErr) return { data: null, error: new Error(invErr.message) }
  }

  return { data: returnHeader, error: null }
}

/** Voids a goods receipt (bad delivery, wrong entry, etc.) — item 3 of the
 *  2026-08 domain audit ("PO/goods-receipt void mechanism"). Deliberately reuses
 *  createSupplierReturnForTenant instead of writing a new stock/GL reversal path:
 *  a return-to-supplier for every line already IS the correct reversal (credit
 *  inventory, credit AP, decrement stock), and it already caps against current
 *  stock and against received-minus-already-returned quantity — so voiding a
 *  receipt whose stock has since been partially sold or already returned fails
 *  loudly instead of silently going negative or double-crediting the supplier. */
export async function voidGoodsReceipt(
  supabase: SupabaseClient,
  tenantId: string,
  userId: string,
  goodsReceiptId: string,
  reason: string
): Promise<{ error: Error | null }> {
  const { data: receipt, error: receiptErr } = await supabase
    .from("goods_receipts")
    .select("id, status, supplier_id, purchase_order_id, branch_id")
    .eq("id", goodsReceiptId)
    .eq("tenant_id", tenantId)
    .single()

  if (receiptErr || !receipt) return { error: new Error(receiptErr?.message || "Goods receipt not found") }
  const r = receipt as {
    id: string
    status: string
    supplier_id: string | null
    purchase_order_id: string | null
    branch_id: string | null
  }

  if (r.status !== "received") {
    return { error: new Error(`Only a received goods receipt can be voided (current status: ${r.status})`) }
  }

  let supplierId = r.supplier_id
  if (!supplierId && r.purchase_order_id) {
    const { data: po } = await supabase
      .from("purchase_orders")
      .select("supplier_id")
      .eq("id", r.purchase_order_id)
      .maybeSingle()
    supplierId = (po as { supplier_id?: string } | null)?.supplier_id ?? null
  }
  if (!supplierId) return { error: new Error("Could not resolve a supplier for this goods receipt") }

  const { data: items, error: itemsErr } = await supabase
    .from("goods_receipt_items")
    .select("medicine_id, quantity_received, unit_cost")
    .eq("goods_receipt_id", goodsReceiptId)

  if (itemsErr) return { error: new Error(itemsErr.message) }
  const lineItems = asArray<{ medicine_id: string; quantity_received: number; unit_cost: number }>(items)
  if (lineItems.length === 0) return { error: new Error("This receipt has no line items to void") }

  const { error: returnErr } = await createSupplierReturnForTenant(supabase, tenantId, userId, {
    supplier_id: supplierId,
    notes: `Void of goods receipt ${goodsReceiptId}: ${reason}`,
    // Reverse against the branch that actually received the stock — not the
    // acting user's current branch, which can differ for a tenant-wide role.
    branch_id: r.branch_id,
    items: lineItems.map((line) => ({
      medicine_id: line.medicine_id,
      quantity: line.quantity_received,
      unit_cost: Number(line.unit_cost),
      return_reason: "receipt_void",
      notes: reason,
    })),
  })
  if (returnErr) return { error: returnErr }

  const { error: statusErr } = await supabase
    .from("goods_receipts")
    .update({ status: "cancelled" })
    .eq("id", goodsReceiptId)
    .eq("tenant_id", tenantId)
  if (statusErr) return { error: new Error(`Receipt reversed but status update failed: ${statusErr.message}`) }

  return { error: null }
}
