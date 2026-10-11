/**
 * Purchase orders — HTTP client (BFF).
 */

import { dotnetClient } from "@/lib/api/dotnet-client"
import { dotnetMutate, money2, stockErrorMessage, type DotnetPagedResponse } from "@/lib/api/stock-dotnet"

export interface DirectGoodsReceipt {
  id: string
  /** Serial per branch and fiscal year, e.g. GRN-MAIN-2083/84-00001 (the id until a receipt is numbered). */
  receipt_number: string
  /** Nepali fiscal year label, e.g. "2083/84". */
  fiscal_year: string | null
  receipt_date: string
  supplier_id: string | null
  supplier_name: string | null
  supplier_invoice_number: string | null
  status: string
  item_count: number
  total_cost: number
  /** Branch the goods were received at. */
  branch_id: string | null
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
  /** Supplier tax invoice / bill number captured on the order. */
  supplier_invoice_number: string | null
  created_by?: string | null
  approved_by?: string | null
  created_at: string
  /** Date the goods were received (null until the order is received). */
  received_at: string | null
  /** Branch the order was raised for; it must be received there. Null on orders from before branches. */
  branch_id: string | null
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
  /** Recoverable input VAT on this line, as entered on the order. */
  vat_amount: number
  /** Null until the batch details are captured (order time or receipt). */
  batch_number: string | null
  expiry_date: string | null
  selling_price: number | null
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
  supplierInvoiceNumber: string | null
  totalVatAmount: number
  lines: {
    id: string
    medicineId: string
    medicineName: string | null
    batchNo: string | null
    expiryDate: string | null
    quantity: number
    unitCostPrice: number
    sellingPrice: number | null
    rackLocation: string | null
    vatAmount: number
  }[]
  branchId?: string | null
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
  receiptNumber?: string | null
  fiscalYear?: string | null
}

const DOTNET_PO_STATUS: Record<string, PurchaseOrder["status"]> = {
  Draft: "draft",
  Approved: "approved",
  Received: "received",
  Cancelled: "cancelled",
}

/**
 * Status filter values the Purchases page offers, mapped to the .NET status list (comma-separated).
 * The .NET lifecycle is Draft -> Approved -> Received | Cancelled, so the legacy names map onto it:
 * "pending" (awaiting approval) is a Draft, "ordered" (sent, awaiting goods) is Approved, and "open"
 * is both. There is no partially-received state: a short delivery closes the order as Received and
 * can raise a draft backorder for the balance.
 */
const PO_STATUS_FILTER: Record<string, string> = {
  open: "Draft,Approved",
  draft: "Draft",
  pending: "Draft",
  approved: "Approved",
  ordered: "Approved",
  received: "Received",
  cancelled: "Cancelled",
}

/** Legacy status filter value to the .NET status list. Null means the .NET side has no equivalent. */
export function toDotnetPurchaseOrderStatus(legacy: string): string | null {
  return PO_STATUS_FILTER[legacy] ?? null
}

/** Server cap on the purchase order page size (SearchPurchaseOrdersQueryValidator). */
export const PURCHASE_ORDERS_MAX_PAGE_SIZE = 200

/** GET /purchasing/purchase-orders query string. */
export function purchaseOrdersListQuery(filters: {
  status?: string
  supplierId?: string
  search?: string
  branchId?: string
  page?: number
  limit?: number
} = {}): string {
  const wantsStatus = !!filters.status && filters.status !== "all"
  const dotnetStatus = wantsStatus ? toDotnetPurchaseOrderStatus(filters.status as string) : null
  if (wantsStatus && dotnetStatus === null) {
    throw new Error(`Filtering purchase orders by "${filters.status}" is not supported.`)
  }
  const pageSize = Math.min(Math.max(Math.trunc(filters.limit ?? 50), 1), PURCHASE_ORDERS_MAX_PAGE_SIZE)
  const sp = new URLSearchParams({ pageNumber: String(Math.max(filters.page ?? 1, 1)), pageSize: String(pageSize) })
  if (filters.supplierId) sp.set("supplierId", filters.supplierId)
  if (dotnetStatus) sp.set("status", dotnetStatus)
  const search = filters.search?.trim()
  if (search) sp.set("search", search)
  if (filters.branchId) sp.set("branchId", filters.branchId)
  return `/purchasing/purchase-orders?${sp.toString()}`
}

/** PurchaseOrderStatusCountsDto. */
export interface PurchaseOrderStatusCounts {
  total: number
  draft: number
  approved: number
  received: number
  cancelled: number
}

export function toPurchaseOrderStatus(status: string): PurchaseOrder["status"] {
  const mapped = DOTNET_PO_STATUS[status]
  if (!mapped) throw new Error(`Unknown purchase order status from .NET API: ${status}`)
  return mapped
}

/**
 * Maps a .NET purchase order to the legacy shape.
 * Known gaps: the .NET DTO has no order number, so the id is shown in its place. An order is received
 * once; a short delivery cuts the lines down to what arrived, so quantity_received is the line quantity
 * once the order is Received, else 0.
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
    supplier_invoice_number: dto.supplierInvoiceNumber,
    created_by: null,
    approved_by: dto.approvedBy,
    created_at: dto.createdAtUtc,
    received_at: dto.receivedAtUtc,
    branch_id: dto.branchId ?? null,
    suppliers: dto.supplierName ? { id: dto.supplierId, name: dto.supplierName } : null,
    purchase_order_items: dto.lines.map((line) => ({
      id: line.id,
      purchase_order_id: dto.id,
      medicine_id: line.medicineId,
      quantity_ordered: line.quantity,
      quantity_received: fullyReceived ? line.quantity : 0,
      unit_cost: money2(line.unitCostPrice),
      total_cost: money2(line.unitCostPrice * line.quantity),
      vat_amount: line.vatAmount,
      batch_number: line.batchNo,
      expiry_date: line.expiryDate,
      selling_price: line.sellingPrice,
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
 * Maps a .NET direct receipt to the legacy row. The id stands in for the receipt number only on a
 * receipt that hasn't been numbered yet. total_cost uses the gross amount (net plus VAT). The legacy
 * total is an unverified match for this.
 */
export function toDirectGoodsReceipt(dto: DotnetDirectGoodsReceiptDto): DirectGoodsReceipt {
  const status = DOTNET_RECEIPT_STATUS[dto.status]
  if (!status) throw new Error(`Unknown direct receipt status from .NET API: ${dto.status}`)
  return {
    id: dto.id,
    receipt_number: dto.receiptNumber ?? dto.id,
    fiscal_year: dto.fiscalYear ?? null,
    receipt_date: dto.receiptDateUtc,
    supplier_id: dto.supplierId,
    supplier_name: dto.supplierName,
    supplier_invoice_number: dto.supplierInvoiceNumber,
    status,
    item_count: dto.lines.length,
    total_cost: dto.grossAmount,
    branch_id: dto.branchId ?? null,
  }
}

/** Blank text becomes null; anything else is trimmed. */
export function optionalText(value: string | null | undefined): string | null {
  const trimmed = (value ?? "").trim()
  return trimmed === "" ? null : trimmed
}

/** Blank becomes null; otherwise a non-negative number. Throws when the value is not a valid price. */
export function optionalPrice(value: string | number | null | undefined, field: string): number | null {
  if (value === null || value === undefined) return null
  if (typeof value === "string" && value.trim() === "") return null
  const n = typeof value === "number" ? value : Number(String(value).trim())
  if (!Number.isFinite(n) || n < 0) throw new Error(`${field} must be a non-negative number.`)
  return n
}

/** Body for POST /purchasing/purchase-orders (CreatePurchaseOrderCommand). */
export function createPurchaseOrderBody(orderData: {
  supplier_id: string
  order_date: string
  notes?: string
  supplier_invoice_number?: string | null
  items: Array<{
    medicine_id: string
    quantity_ordered: number
    unit_cost: string
    vat_amount?: string | null
    batch_number?: string | null
    expiry_date?: string | null
    selling_price?: string | null
  }>
}) {
  return {
    supplierId: orderData.supplier_id,
    orderDateUtc: `${orderData.order_date}T00:00:00Z`,
    narration: optionalText(orderData.notes),
    supplierInvoiceNumber: optionalText(orderData.supplier_invoice_number),
    lines: orderData.items.map((item) => ({
      medicineId: item.medicine_id,
      batchNo: optionalText(item.batch_number),
      expiryDate: optionalText(item.expiry_date),
      quantity: item.quantity_ordered,
      unitCostPrice: optionalPrice(item.unit_cost, "Unit cost") ?? 0,
      sellingPrice: optionalPrice(item.selling_price, "Selling price"),
      rackLocation: null,
      vatAmount: optionalPrice(item.vat_amount, "VAT") ?? 0,
    })),
  }
}

/** One line of a receipt. `quantity_to_receive` below the ordered quantity is a short delivery (0 = nothing arrived). */
export interface ReceiveLineInput {
  purchase_order_item_id: string
  quantity_to_receive?: number | null
  batch_number?: string | null
  expiry_date?: string | null
  selling_price?: string | null
}

/**
 * Body for POST /purchasing/purchase-orders/{id}/receive (ReceivePurchaseOrderRequest). `receiptDate` is a
 * YYYY-MM-DD day. A line that did not arrive (quantity 0) sends no batch details, as none are needed.
 */
export function receivePurchaseOrderBody(items: ReceiveLineInput[], receiptDate?: string, createBackorder = true) {
  return {
    receiptDateUtc: receiptDate ? `${receiptDate}T00:00:00Z` : null,
    createBackorder,
    lines: items.map((item) => {
      const quantity = item.quantity_to_receive
      if (quantity != null && (!Number.isFinite(quantity) || quantity < 0)) {
        throw new Error("Received quantity must be zero or more.")
      }
      const arrived = quantity == null || quantity > 0
      return {
        lineId: item.purchase_order_item_id,
        batchNo: arrived ? optionalText(item.batch_number) : null,
        expiryDate: arrived ? optionalText(item.expiry_date) : null,
        sellingPrice: arrived ? optionalPrice(item.selling_price, "Selling price") : null,
        quantityReceived: quantity ?? null,
      }
    }),
  }
}

/** ReceivePurchaseOrderResult. */
export interface DotnetReceivePurchaseOrderResult {
  purchaseOrderId: string
  backorderPurchaseOrderId: string | null
  shortLineCount: number
}

/** Ids of the lines received short (less than the remaining quantity, including nothing at all). */
export function shortReceivedLines(
  items: Array<{ id: string; quantity_ordered: number; quantity_received: number }>,
  quantities: Record<string, number | undefined>,
): string[] {
  return items
    .filter((item) => {
      const remaining = item.quantity_ordered - item.quantity_received
      const qty = quantities[item.id] ?? remaining
      return qty < remaining
    })
    .map((item) => item.id)
}

export const purchasesApi = {
  /** Server-paged, filtered and searched (search matches supplier, order id start, invoice no. and notes). */
  getPurchaseOrders: async (filters: {
    status?: string
    supplierId?: string
    search?: string
    branchId?: string
    page?: number
    limit?: number
  } = {}) => {
    try {
      const page = await dotnetClient.get<DotnetPagedResponse<DotnetPurchaseOrderDto>>(purchaseOrdersListQuery(filters))
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
  },

  /** Order counts per status, for the summary cards. */
  getStatusCounts: async (branchId?: string): Promise<{ data: PurchaseOrderStatusCounts | null; error: string | null }> => {
    try {
      const query = branchId ? `?branchId=${encodeURIComponent(branchId)}` : ""
      const data = await dotnetClient.get<PurchaseOrderStatusCounts>(`/purchasing/purchase-orders/status-counts${query}`)
      return { data, error: null }
    } catch (error) {
      return { data: null, error: stockErrorMessage(error, "Failed to load purchase order totals") }
    }
  },

  /**
   * Creates a draft order. Batch number, expiry date and selling price are optional per line and are
   * sent as null when blank; they must be supplied at receipt before the order can be received.
   */
  createPurchaseOrder: async (orderData: {
    supplier_id: string
    order_date: string
    expected_delivery_date?: string
    notes?: string
    supplier_invoice_number?: string | null
    items: Array<{
      medicine_id: string
      quantity_ordered: number
      unit_cost: string
      vat_amount?: string | null
      batch_number?: string | null
      expiry_date?: string | null
      selling_price?: string | null
    }>
  }): Promise<{ data: { id: string } | null; error: string | null }> => {
    const id = await dotnetMutate<string>("/purchasing/purchase-orders", createPurchaseOrderBody(orderData))
    return { data: { id }, error: null as string | null }
  },

  approvePurchaseOrder: async (id: string) => {
    const approvedId = await dotnetMutate<string>(`/purchasing/purchase-orders/${encodeURIComponent(id)}/approve`, {})
    return { data: { id: approvedId }, error: null as string | null }
  },

  /** Only works pre-receipt — an order with anything received must be reversed
   *  via voidGoodsReceipt instead. The .NET cancel command requires a reason. */
  cancelPurchaseOrder: async (id: string, reason?: string) => {
    const cancelledId = await dotnetMutate<string>(
      `/purchasing/purchase-orders/${encodeURIComponent(id)}/cancel`,
      cancelPurchaseOrderBody(reason ?? "")
    )
    return { data: { id: cancelledId }, error: null as string | null }
  },

  voidGoodsReceipt: async (id: string, reason: string) => {
    const voidedId = await dotnetMutate<string>(`/purchasing/direct-goods-receipts/${encodeURIComponent(id)}/void`, { reason })
    return { data: { id: voidedId }, error: null as string | null }
  },

  /**
   * Receives an approved order. A line received short (quantity below the ordered amount, 0 when it
   * did not arrive) closes the order at the delivered quantities; with `createBackorder` the balance
   * goes onto a new draft order to the same supplier. Batch number, expiry and selling price are
   * required for every line that arrived (captured here when not set at order time).
   */
  receiveGoods: async (params: {
    purchaseOrderId: string
    receiptDate: string
    createBackorder?: boolean
    items: Array<ReceiveLineInput & { medicine_id: string; unit_cost: string }>
  }): Promise<{
    data: { goods_receipt_id: string; receipt_number: string; backorder_id: string | null; short_line_count: number } | null
    error: string | null
  }> => {
    const result = await dotnetMutate<DotnetReceivePurchaseOrderResult>(
      `/purchasing/purchase-orders/${encodeURIComponent(params.purchaseOrderId)}/receive`,
      receivePurchaseOrderBody(params.items, params.receiptDate, params.createBackorder ?? true)
    )
    return {
      data: {
        goods_receipt_id: result.purchaseOrderId,
        receipt_number: result.purchaseOrderId,
        backorder_id: result.backorderPurchaseOrderId,
        short_line_count: result.shortLineCount,
      },
      error: null as string | null,
    }
  },

  getDirectReceipts: async (branchId?: string) => {
    try {
      // The .NET endpoint has no server-side pagination for this list (returns every row for the
      // tenant/branch), so all rows are fetched here and paginated client-side by the caller.
      const query = branchId ? `?branchId=${encodeURIComponent(branchId)}` : ""
      const rows = await dotnetClient.get<DotnetDirectGoodsReceiptDto[]>(`/purchasing/direct-goods-receipts${query}`)
      return { data: rows.map(toDirectGoodsReceipt), error: null as string | null }
    } catch (error) {
      return { data: [] as DirectGoodsReceipt[], error: stockErrorMessage(error, "Failed to load direct receipts") }
    }
  },

  /** Medicines to reorder, grouped by supplier for the PO-per-supplier flow. */
  getReorderSuggestions: async (): Promise<{ data: ReorderSuggestionGroup[]; error: string | null }> => {
    try {
      const rows = await dotnetClient.get<DotnetReorderSuggestion[]>("/purchasing/reorder-suggestions")
      const bySupplier = new Map<string, ReorderSuggestionGroup>()
      for (const row of rows) {
        const group = bySupplier.get(row.supplierId) ?? {
          supplierId: row.supplierId,
          supplierName: row.supplierName,
          items: [],
        }
        group.items.push({
          medicine_id: row.medicineId,
          name: row.medicineName,
          quantity_ordered: row.suggestedQuantity,
          unit_cost: String(row.unitCost),
          current_stock: row.currentStock,
          avg_daily_sales: row.averageDailySales,
          days_of_stock_left: row.daysOfStockLeft,
          reason: row.reason as ReorderSuggestionItem["reason"],
        })
        bySupplier.set(row.supplierId, group)
      }
      return { data: [...bySupplier.values()], error: null as string | null }
    } catch (error) {
      return { data: [] as ReorderSuggestionGroup[], error: stockErrorMessage(error, "Failed to load reorder suggestions") }
    }
  },
}

/** Purchasing.Contracts PurchasingReorderSuggestionDto (camelCase JSON). */
interface DotnetReorderSuggestion {
  medicineId: string
  medicineName: string
  supplierId: string
  supplierName: string
  unitCost: number
  currentStock: number
  reorderLevel: number
  maximumStock: number | null
  suggestedQuantity: number
  averageDailySales: number
  daysOfStockLeft: number | null
  reason: string
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
