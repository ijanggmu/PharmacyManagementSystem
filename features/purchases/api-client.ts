/**
 * Purchase orders — HTTP client (BFF).
 */

import { apiGet, apiGetWithMeta, apiPost, getCSRFToken } from "@/lib/api/client-helpers"

export interface DirectGoodsReceipt {
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

export interface PurchaseOrder {
  id: string
  order_number: string
  supplier_id: string
  order_date: string
  expected_delivery_date: string | null
  status: "draft" | "pending" | "approved" | "ordered" | "partially_received" | "received" | "cancelled"
  total_amount: string
  notes: string | null
  created_by?: string | null
  approved_by?: string | null
  created_at: string
  suppliers: {
    id: string
    name: string
  } | null
  purchase_order_items: PurchaseOrderItem[]
}

export interface PurchaseOrderItem {
  id: string
  purchase_order_id: string
  medicine_id: string
  quantity_ordered: number
  quantity_received: number
  unit_cost: string
  total_cost: string
  medicines: {
    id: string
    name: string
  } | null
}

function purchasesListPath(filters: {
  status?: string
  supplierId?: string
  page?: number
  limit?: number
}): string {
  const p = new URLSearchParams()
  if (filters.status) p.set("status", filters.status)
  if (filters.supplierId) p.set("supplierId", filters.supplierId)
  if (filters.page != null) p.set("page", String(filters.page))
  if (filters.limit != null) p.set("limit", String(filters.limit))
  const q = p.toString()
  return `/api/purchases${q ? `?${q}` : ""}`
}

export const purchasesApi = {
  getPurchaseOrders: async (filters: {
    status?: string
    supplierId?: string
    page?: number
    limit?: number
  } = {}) => {
    const { data, meta } = await apiGetWithMeta<PurchaseOrder[]>(purchasesListPath(filters))
    return {
      data: data ?? [],
      count: meta?.total ?? 0,
      page: meta?.page ?? filters.page ?? 1,
      limit: meta?.limit ?? filters.limit ?? 50,
      totalPages: meta?.totalPages ?? 0,
      error: null as string | null,
    }
  },

  createPurchaseOrder: async (orderData: {
    supplier_id: string
    order_date: string
    expected_delivery_date?: string
    notes?: string
    items: Array<{
      medicine_id: string
      quantity_ordered: number
      unit_cost: string
    }>
  }) => {
    const token = await getCSRFToken()
    const data = await apiPost<PurchaseOrder>("/api/purchases", orderData, token)
    return { data, error: null as string | null }
  },

  approvePurchaseOrder: async (id: string) => {
    const token = await getCSRFToken()
    const data = await apiPost<{ id: string }>(`/api/purchases/${encodeURIComponent(id)}/approve`, {}, token)
    return { data, error: null as string | null }
  },

  receiveGoods: async (params: {
    purchaseOrderId: string
    receiptDate: string
    supplierInvoiceNumber?: string | null
    items: Array<{
      purchase_order_item_id: string
      medicine_id: string
      quantity_to_receive: number
      unit_cost: string
      vat_amount?: number
      batch_number?: string | null
      expiry_date?: string | null
    }>
  }) => {
    const token = await getCSRFToken()
    const data = await apiPost<{ goods_receipt_id: string; receipt_number: string }>(
      "/api/purchases/receive",
      params,
      token
    )
    return { data, error: null as string | null }
  },

  getDirectReceipts: async () => {
    const data = await apiGet<DirectGoodsReceipt[]>("/api/purchases/direct-receipts")
    return { data: data ?? [], error: null as string | null }
  },
}
