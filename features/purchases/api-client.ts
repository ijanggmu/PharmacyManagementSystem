/**
 * Purchase orders — HTTP client (BFF).
 */

import { apiGet, apiGetWithMeta, apiPost, getCSRFToken } from "@/lib/api/client-helpers"
import { backendTarget } from "@/lib/api/backend-target"
import { dotnetClient } from "@/lib/api/dotnet-client"
import { dotnetMutate, money2, stockErrorMessage, type DotnetPagedResponse } from "@/lib/api/stock-dotnet"

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

/** PurchaseOrderDto from the .NET Purchasing module (camelCase JSON, enums as strings). */
export interface DotnetPurchaseOrderDto {
  id: string
  supplierId: string
  supplierName: string | null
  orderDateUtc: string
  status: string
  narration: string | null
  totalAmount: number
  createdAtUtc: string
  approvedAtUtc: string | null
  approvedBy: string | null
  receivedAtUtc: string | null
  receivedBy: string | null
  cancelledAtUtc: string | null
  cancelReason: string | null
  lines: {
    id: string
    medicineId: string
    medicineName: string | null
    batchNo: string
    expiryDate: string
    quantity: number
    unitCostPrice: number
    sellingPrice: number
    rackLocation: string | null
  }[]
}

/** DirectGoodsReceiptDto from the .NET Purchasing module. */
export interface DotnetDirectGoodsReceiptDto {
  id: string
  supplierId: string
  supplierName: string | null
  receiptDateUtc: string
  supplierInvoiceNumber: string | null
  status: string
  netAmount: number
  vatAmount: number
  grossAmount: number
  createdAtUtc: string
  createdBy: string
  voidedAtUtc: string | null
  voidedBy: string | null
  voidReason: string | null
  lines: { id: string; medicineId: string; medicineName: string | null; quantity: number; unitCostPrice: number; vatAmount: number; netAmount: number }[]
  branchId: string
}

const DOTNET_PO_STATUS: Record<string, PurchaseOrder["status"]> = {
  Draft: "draft",
  Approved: "approved",
  Received: "received",
  Cancelled: "cancelled",
}

/** Legacy status filter value to the .NET enum name. Null means the .NET side has no equivalent. */
export function toDotnetPurchaseOrderStatus(legacy: string): string | null {
  const entry = Object.entries(DOTNET_PO_STATUS).find(([, value]) => value === legacy)
  return entry ? entry[0] : null
}

export function toPurchaseOrderStatus(status: string): PurchaseOrder["status"] {
  const mapped = DOTNET_PO_STATUS[status]
  if (!mapped) throw new Error(`Unknown purchase order status from .NET API: ${status}`)
  return mapped
}

/**
 * Maps a .NET purchase order to the legacy shape.
 * Known gaps: the .NET DTO has no order number, so the id is shown in its place. Receiving is
 * all-or-nothing on .NET, so quantity_received is the full quantity once the order is Received, else 0.
 */
export function toPurchaseOrder(dto: DotnetPurchaseOrderDto): PurchaseOrder {
  const status = toPurchaseOrderStatus(dto.status)
  const fullyReceived = status === "received"
  return {
    id: dto.id,
    order_number: dto.id,
    supplier_id: dto.supplierId,
    order_date: dto.orderDateUtc,
    expected_delivery_date: null,
    status,
    total_amount: money2(dto.totalAmount),
    notes: dto.narration,
    created_by: null,
    approved_by: dto.approvedBy,
    created_at: dto.createdAtUtc,
    suppliers: dto.supplierName ? { id: dto.supplierId, name: dto.supplierName } : null,
    purchase_order_items: dto.lines.map((line) => ({
      id: line.id,
      purchase_order_id: dto.id,
      medicine_id: line.medicineId,
      quantity_ordered: line.quantity,
      quantity_received: fullyReceived ? line.quantity : 0,
      unit_cost: money2(line.unitCostPrice),
      total_cost: money2(line.unitCostPrice * line.quantity),
      medicines: { id: line.medicineId, name: line.medicineName ?? "" },
    })),
  }
}

/** CancelPurchaseOrderCommand body. The validator requires a non-empty reason of at most 512 characters. */
export function cancelPurchaseOrderBody(reason: string): { reason: string } {
  const trimmed = reason.trim()
  if (trimmed === "") throw new Error("A cancellation reason is required.")
  if (trimmed.length > 512) throw new Error("The cancellation reason must be 512 characters or fewer.")
  return { reason: trimmed }
}

const DOTNET_RECEIPT_STATUS: Record<string, string> = { Received: "received", Voided: "voided" }

/**
 * Maps a .NET direct receipt to the legacy row. The .NET DTO has no receipt number, so the id is
 * shown in its place. total_cost uses the gross amount (net plus VAT). The legacy total is an
 * unverified match for this.
 */
export function toDirectGoodsReceipt(dto: DotnetDirectGoodsReceiptDto): DirectGoodsReceipt {
  const status = DOTNET_RECEIPT_STATUS[dto.status]
  if (!status) throw new Error(`Unknown direct receipt status from .NET API: ${dto.status}`)
  return {
    id: dto.id,
    receipt_number: dto.id,
    receipt_date: dto.receiptDateUtc,
    supplier_id: dto.supplierId,
    supplier_name: dto.supplierName,
    supplier_invoice_number: dto.supplierInvoiceNumber,
    status,
    item_count: dto.lines.length,
    total_cost: dto.grossAmount,
  }
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
    // A status with no .NET equivalent (pending, ordered, partially_received) stays on the legacy path.
    const dotnetStatus = filters.status ? toDotnetPurchaseOrderStatus(filters.status) : null
    const useDotnet = backendTarget("PURCHASING") === "dotnet" && (!filters.status || dotnetStatus !== null)
    if (useDotnet) {
      try {
        const pageNumber = filters.page ?? 1
        const pageSize = filters.limit ?? 50
        const sp = new URLSearchParams({ pageNumber: String(pageNumber), pageSize: String(pageSize) })
        if (filters.supplierId) sp.set("supplierId", filters.supplierId)
        if (dotnetStatus) sp.set("status", dotnetStatus)
        const page = await dotnetClient.get<DotnetPagedResponse<DotnetPurchaseOrderDto>>(`/purchasing/purchase-orders?${sp}`)
        return {
          data: page.items.map(toPurchaseOrder),
          count: page.totalCount,
          page: page.pageNumber,
          limit: page.pageSize,
          totalPages: page.totalPages,
          error: null as string | null,
        }
      } catch (error) {
        return { data: [] as PurchaseOrder[], count: 0, page: filters.page ?? 1, limit: filters.limit ?? 50, totalPages: 0, error: stockErrorMessage(error, "Failed to load purchase orders") }
      }
    }
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

  /** Legacy only: the .NET create command needs a batch number and expiry date per line, which this form does not collect. */
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
    if (backendTarget("PURCHASING") === "dotnet") {
      const approvedId = await dotnetMutate<string>(`/purchasing/purchase-orders/${encodeURIComponent(id)}/approve`, {})
      return { data: { id: approvedId }, error: null as string | null }
    }
    const token = await getCSRFToken()
    const data = await apiPost<{ id: string }>(`/api/purchases/${encodeURIComponent(id)}/approve`, {}, token)
    return { data, error: null as string | null }
  },

  /** Only works pre-receipt — an order with anything received must be reversed
   *  via voidGoodsReceipt instead. The .NET cancel command requires a reason, so the dotnet branch
   *  needs one; the legacy branch never sent a reason and still does not. */
  cancelPurchaseOrder: async (id: string, reason?: string) => {
    if (backendTarget("PURCHASING") === "dotnet") {
      const cancelledId = await dotnetMutate<string>(
        `/purchasing/purchase-orders/${encodeURIComponent(id)}/cancel`,
        cancelPurchaseOrderBody(reason ?? "")
      )
      return { data: { id: cancelledId }, error: null as string | null }
    }
    const token = await getCSRFToken()
    const data = await apiPost<{ id: string }>(`/api/purchases/${encodeURIComponent(id)}/cancel`, {}, token)
    return { data, error: null as string | null }
  },

  voidGoodsReceipt: async (id: string, reason: string) => {
    if (backendTarget("PURCHASING") === "dotnet") {
      const voidedId = await dotnetMutate<string>(`/purchasing/direct-goods-receipts/${encodeURIComponent(id)}/void`, { reason })
      return { data: { id: voidedId }, error: null as string | null }
    }
    const token = await getCSRFToken()
    const data = await apiPost<{ id: string }>(`/api/purchases/receipts/${encodeURIComponent(id)}/void`, { reason }, token)
    return { data, error: null as string | null }
  },

  /** Legacy only: the .NET receive command always takes the full order and cannot take partial quantities, batch overrides or VAT. */
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
    if (backendTarget("PURCHASING") === "dotnet") {
      try {
        // Legacy caps this feed at 100 rows, so keep that cap.
        const rows = await dotnetClient.get<DotnetDirectGoodsReceiptDto[]>("/purchasing/direct-goods-receipts")
        return { data: rows.slice(0, 100).map(toDirectGoodsReceipt), error: null as string | null }
      } catch (error) {
        return { data: [] as DirectGoodsReceipt[], error: stockErrorMessage(error, "Failed to load direct receipts") }
      }
    }
    const data = await apiGet<DirectGoodsReceipt[]>("/api/purchases/direct-receipts")
    return { data: data ?? [], error: null as string | null }
  },

  /** Legacy only: the .NET reorder endpoint has no supplier grouping, unit cost, sales rate or reason. */
  getReorderSuggestions: async () => {
    const data = await apiGet<ReorderSuggestionGroup[]>("/api/purchases/reorder-suggestions")
    return { data: data ?? [], error: null as string | null }
  },
}

export interface ReorderSuggestionItem {
  medicine_id: string
  name: string
  quantity_ordered: number
  unit_cost: string
  current_stock: number
  avg_daily_sales: number
  days_of_stock_left: number | null
  reason: "below_minimum" | "out_of_stock" | "will_stock_out_before_resupply"
}

export interface ReorderSuggestionGroup {
  supplierId: string
  supplierName: string
  items: ReorderSuggestionItem[]
}
