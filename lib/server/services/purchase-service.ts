/**
 * Purchase orders — server-side orchestration (GRN, inventory, supplier ledger).
 */

import type { SupabaseClient } from "@supabase/supabase-js"
import { ensureSupplierPayableAccount } from "@/lib/server/services/accounting-service"
import { getPrimaryBranchId } from "@/lib/server/services/tenant-branch"

export interface PurchaseOrderListFilters {
  status?: string
  supplierId?: string
  page?: number
  limit?: number
}

export interface CreatePurchaseOrderInput {
  supplier_id: string
  order_date: string
  expected_delivery_date?: string
  notes?: string
  items: Array<{
    medicine_id: string
    quantity_ordered: number
    unit_cost: string
  }>
}

export interface ReceiveGoodsInput {
  purchaseOrderId: string
  receiptDate: string
  /** App user posting the receipt (accounting_voucher / goods_receipts.created_by). */
  actorUserId?: string | null
  /** Supplier tax invoice / bill number on this delivery (for AP and IRD reconciliation). */
  supplierInvoiceNumber?: string | null
  items: Array<{
    purchase_order_item_id: string
    medicine_id: string
    quantity_to_receive: number
    unit_cost: string
    /** Recoverable VAT on this line; AP / supplier ledger use net + VAT (gross). */
    vat_amount?: number
    /** Batch/lot number on this delivery; auto-generated from the GRN number if omitted. */
    batch_number?: string | null
    /** Expiry date for this batch — enables FEFO deduction at sale time. */
    expiry_date?: string | null
  }>
}

const purchaseSelect = `
  *,
  suppliers (id, name),
  purchase_order_items (
    *,
    medicines (id, name)
  )
`

export async function listPurchaseOrders(
  supabase: SupabaseClient,
  filters: PurchaseOrderListFilters = {}
) {
  let query = supabase
    .from("purchase_orders")
    .select(purchaseSelect, { count: "exact" })
    .order("created_at", { ascending: false })

  if (filters.status) {
    query = query.eq("status", filters.status)
  }
  if (filters.supplierId) {
    query = query.eq("supplier_id", filters.supplierId)
  }

  const page = filters.page || 1
  const limit = filters.limit || 50
  const from = (page - 1) * limit
  const to = from + limit - 1
  query = query.range(from, to)

  const { data, error, count } = await query
  if (error) throw new Error(error.message)

  return {
    data: data || [],
    count: count || 0,
    page,
    limit,
    totalPages: Math.ceil((count || 0) / limit),
  }
}

export async function createPurchaseOrder(
  supabase: SupabaseClient,
  orderData: CreatePurchaseOrderInput,
  tenantId: string,
  actorUserId?: string | null
) {
  const ap = await ensureSupplierPayableAccount(supabase, tenantId, orderData.supplier_id)
  if (ap.error) throw ap.error

  const orderNumber = `PO-${Date.now()}`

  const { data: order, error: orderError } = await supabase
    .from("purchase_orders")
    .insert({
      order_number: orderNumber,
      supplier_id: orderData.supplier_id,
      order_date: orderData.order_date,
      expected_delivery_date: orderData.expected_delivery_date || null,
      status: "draft",
      notes: orderData.notes || null,
      tenant_id: tenantId,
      created_by: actorUserId || null,
    })
    .select()
    .single()

  if (orderError) throw new Error(orderError.message)
  if (!order) throw new Error("Failed to create purchase order")

  if (orderData.items.length > 0) {
    const items = orderData.items.map((item) => ({
      purchase_order_id: order.id,
      medicine_id: item.medicine_id,
      quantity_ordered: item.quantity_ordered,
      quantity_received: 0,
      unit_cost: item.unit_cost,
      total_cost: (parseFloat(item.unit_cost) * item.quantity_ordered).toString(),
      tenant_id: tenantId,
    }))

    const { error: itemsError } = await supabase.from("purchase_order_items").insert(items)

    if (itemsError) {
      await supabase.from("purchase_orders").delete().eq("id", order.id)
      throw new Error(itemsError.message)
    }
  }

  const { data: full, error: fetchError } = await supabase
    .from("purchase_orders")
    .select(purchaseSelect)
    .eq("id", order.id)
    .single()

  if (fetchError) throw new Error(fetchError.message)
  return full
}

/** Segregation-of-duties gate: only a draft/pending PO can be approved, and the
 *  approver can't be the same user who created it (enforced in approve_purchase_order).
 *  receive_purchase_goods then refuses to run against anything but an approved PO. */
export async function approvePurchaseOrder(
  supabase: SupabaseClient,
  tenantId: string,
  purchaseOrderId: string,
  approverUserId: string
): Promise<{ error: Error | null }> {
  const { error } = await supabase.rpc("approve_purchase_order", {
    p_tenant_id: tenantId,
    p_purchase_order_id: purchaseOrderId,
    p_approver_user_id: approverUserId,
  })
  if (error) return { error: new Error(error.message) }
  return { error: null }
}

export async function receiveGoods(
  supabase: SupabaseClient,
  params: ReceiveGoodsInput,
  tenantId: string
) {
  // Use the receiving user's active branch when known, falling back to the tenant's
  // primary branch — previously this always posted to the primary branch regardless
  // of which branch the user was actually operating from.
  let branchId: string | null = null
  if (params.actorUserId) {
    const { data: actor } = await supabase
      .from("users")
      .select("current_branch_id")
      .eq("id", params.actorUserId)
      .maybeSingle()
    branchId = (actor as { current_branch_id: string | null } | null)?.current_branch_id ?? null
  }
  if (!branchId) {
    branchId = await getPrimaryBranchId(supabase, tenantId)
  }

  const itemsForRpc = params.items
    .filter((item) => item.quantity_to_receive > 0)
    .map((item) => ({
      purchase_order_item_id: item.purchase_order_item_id,
      medicine_id: item.medicine_id,
      quantity_to_receive: item.quantity_to_receive,
      unit_cost: item.unit_cost,
      vat_amount: item.vat_amount ?? 0,
      batch_number: item.batch_number || null,
      expiry_date: item.expiry_date || null,
    }))

  const { data, error } = await supabase
    .rpc("receive_purchase_goods", {
      p_tenant_id: tenantId,
      p_purchase_order_id: params.purchaseOrderId,
      p_branch_id: branchId,
      p_receipt_date: params.receiptDate,
      p_actor_user_id: params.actorUserId ?? null,
      p_supplier_invoice_number: params.supplierInvoiceNumber?.trim() || null,
      p_items: itemsForRpc,
    })
    .single()

  if (error) throw new Error(error.message)

  const result = data as { goods_receipt_id: string; receipt_number: string }
  return { goods_receipt_id: result.goods_receipt_id, receipt_number: result.receipt_number }
}
