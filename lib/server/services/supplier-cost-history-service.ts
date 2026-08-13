/**
 * Supplier cost-history — unit cost was only ever stored per receipt line, with no
 * dedicated view for comparing a supplier's pricing over time (audit, Module 03).
 * This is a read-only aggregation over goods_receipt_items -> goods_receipts ->
 * purchase_orders, so no schema change is needed.
 */

import type { SupabaseClient } from "@supabase/supabase-js"

export interface SupplierCostHistoryRow {
  medicine_id: string
  medicine_name: string
  receipt_date: string
  unit_cost: number
  quantity_received: number
}

export async function getSupplierCostHistory(
  supabase: SupabaseClient,
  tenantId: string,
  supplierId: string,
  limit = 200
): Promise<{ data: SupplierCostHistoryRow[]; error: Error | null }> {
  const { data: pos, error: poErr } = await supabase
    .from("purchase_orders")
    .select("id")
    .eq("tenant_id", tenantId)
    .eq("supplier_id", supplierId)

  if (poErr) return { data: [], error: new Error(poErr.message) }
  const poIds = (pos || []).map((p: { id: string }) => p.id)
  if (poIds.length === 0) return { data: [], error: null }

  const { data: receipts, error: grErr } = await supabase
    .from("goods_receipts")
    .select("id, receipt_date")
    .eq("tenant_id", tenantId)
    .in("purchase_order_id", poIds)

  if (grErr) return { data: [], error: new Error(grErr.message) }
  const receiptDateById = new Map((receipts || []).map((r: { id: string; receipt_date: string }) => [r.id, r.receipt_date]))
  const receiptIds = [...receiptDateById.keys()]
  if (receiptIds.length === 0) return { data: [], error: null }

  const { data: items, error: itemsErr } = await supabase
    .from("goods_receipt_items")
    .select("goods_receipt_id, medicine_id, unit_cost, quantity_received, medicines (id, name)")
    .in("goods_receipt_id", receiptIds)
    .order("goods_receipt_id", { ascending: false })
    .limit(limit)

  if (itemsErr) return { data: [], error: new Error(itemsErr.message) }

  const rows: SupplierCostHistoryRow[] = ((items || []) as unknown as Array<{
    goods_receipt_id: string
    medicine_id: string
    unit_cost: number
    quantity_received: number
    medicines: { id: string; name: string } | { id: string; name: string }[] | null
  }>).map((row) => {
    const medicine = Array.isArray(row.medicines) ? row.medicines[0] : row.medicines
    return {
      medicine_id: row.medicine_id,
      medicine_name: medicine?.name || "Medicine",
      receipt_date: receiptDateById.get(row.goods_receipt_id) || "",
      unit_cost: Number(row.unit_cost),
      quantity_received: row.quantity_received,
    }
  })

  rows.sort((a, b) => (a.receipt_date < b.receipt_date ? 1 : -1))
  return { data: rows, error: null }
}
