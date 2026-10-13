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
  /** Recoverable input VAT on this line, as entered on the order (on the discounted value). */
  vat_amount: number
  /** Bonus units on top of the ordered quantity (base units); 0 when none. */
  free_quantity: number
  /** Units per pack when the line was entered in packs. */
  pack_size: number | null
  /** Taxable value after the line and bill discounts. */
  net_amount: number
  /** Cost of each unit put into stock (free ones included). */
  effective_unit_cost: number
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
    freeQuantity?: number
    discountPercent?: number
    discountAmount?: number
    billDiscountAmount?: number
    grossAmount?: number
    netAmount?: number
    effectiveUnitCost?: number
    packSize?: number | null
    packUnitCost?: number | null
  }[]
  branchId?: string | null
  subtotalAmount?: number
  lineDiscountAmount?: number
  billDiscountPercent?: number
  billDiscountAmount?: number
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
  lines: {
    id: string
    medicineId: string
    medicineName: string | null
    quantity: number
    unitCostPrice: number
    vatAmount: number
    netAmount: number
    /** The lot the line's stock went into (null on lines received before lots were recorded). */
    batchId?: string | null
    batchNo?: string | null
    freeQuantity?: number
    discountPercent?: number
    discountAmount?: number
    billDiscountAmount?: number
    grossAmount?: number
    effectiveUnitCost?: number
    packSize?: number | null
    packUnitCost?: number | null
  }[]
  branchId: string
  receiptNumber?: string | null
  fiscalYear?: string | null
  subtotalAmount?: number
  lineDiscountAmount?: number
  billDiscountPercent?: number
  billDiscountAmount?: number
}

/** One line of a purchase bill (order or direct receipt) for the detail view. Quantities are base units. */
export interface PurchaseBillLineView {
  id: string
  medicine_id: string
  medicine_name: string
  batch_no: string | null
  expiry_date: string | null
  quantity: number
  free_quantity: number
  /** Rate per base unit. */
  unit_cost: number
  pack_size: number | null
  pack_unit_cost: number | null
  gross: number
  discount_percent: number
  discount_amount: number
  bill_discount_amount: number
  taxable: number
  vat: number
  effective_unit_cost: number
}

/** A purchase order or direct receipt as a supplier bill: lines plus the discount/VAT breakdown. */
export interface PurchaseBillView {
  kind: "order" | "receipt"
  id: string
  number: string
  date: string
  supplier_name: string | null
  supplier_invoice_number: string | null
  status: string
  lines: PurchaseBillLineView[]
  subtotal: number
  line_discount: number
  bill_discount_percent: number
  bill_discount: number
  /** Taxable value after all discounts. */
  taxable: number
  vat: number
  /** taxable + VAT: the supplier's bill. */
  total: number
}

function effectiveCost(net: number, quantity: number, free: number): number {
  const units = quantity + free
  return units > 0 ? Math.round((net / units) * 100) / 100 : 0
}

/** The detail view of a purchase order. Older servers without discount fields read as undiscounted. */
export function purchaseOrderBillView(dto: DotnetPurchaseOrderDto): PurchaseBillView {
  const lines = dto.lines.map((l): PurchaseBillLineView => {
    const gross = l.grossAmount ?? Math.round(l.quantity * l.unitCostPrice * 100) / 100
    const taxable = l.netAmount ?? gross - (l.discountAmount ?? 0) - (l.billDiscountAmount ?? 0)
    const free = l.freeQuantity ?? 0
    return {
      id: l.id,
      medicine_id: l.medicineId,
      medicine_name: l.medicineName ?? "",
      batch_no: l.batchNo,
      expiry_date: l.expiryDate,
      quantity: l.quantity,
      free_quantity: free,
      unit_cost: l.unitCostPrice,
      pack_size: l.packSize ?? null,
      pack_unit_cost: l.packUnitCost ?? null,
      gross,
      discount_percent: l.discountPercent ?? 0,
      discount_amount: l.discountAmount ?? 0,
      bill_discount_amount: l.billDiscountAmount ?? 0,
      taxable,
      vat: l.vatAmount,
      effective_unit_cost: l.effectiveUnitCost ?? effectiveCost(taxable, l.quantity, free),
    }
  })
  const subtotal = dto.subtotalAmount ?? lines.reduce((s, l) => s + l.gross, 0)
  return {
    kind: "order",
    id: dto.id,
    number: dto.id,
    date: dto.receivedAtUtc ?? dto.orderDateUtc,
    supplier_name: dto.supplierName,
    supplier_invoice_number: dto.supplierInvoiceNumber,
    status: toPurchaseOrderStatus(dto.status),
    lines,
    subtotal,
    line_discount: dto.lineDiscountAmount ?? 0,
    bill_discount_percent: dto.billDiscountPercent ?? 0,
    bill_discount: dto.billDiscountAmount ?? 0,
    taxable: dto.totalAmount,
    vat: dto.totalVatAmount,
    total: Math.round((dto.totalAmount + dto.totalVatAmount) * 100) / 100,
  }
}

/** The detail view of a direct receipt. Older servers without discount fields read as undiscounted. */
export function directReceiptBillView(dto: DotnetDirectGoodsReceiptDto): PurchaseBillView {
  const lines = dto.lines.map((l): PurchaseBillLineView => {
    const free = l.freeQuantity ?? 0
    return {
      id: l.id,
      medicine_id: l.medicineId,
      medicine_name: l.medicineName ?? "",
      batch_no: l.batchNo ?? null,
      expiry_date: null,
      quantity: l.quantity,
      free_quantity: free,
      unit_cost: l.unitCostPrice,
      pack_size: l.packSize ?? null,
      pack_unit_cost: l.packUnitCost ?? null,
      gross: l.grossAmount ?? l.netAmount,
      discount_percent: l.discountPercent ?? 0,
      discount_amount: l.discountAmount ?? 0,
      bill_discount_amount: l.billDiscountAmount ?? 0,
      taxable: l.netAmount,
      vat: l.vatAmount,
      effective_unit_cost: l.effectiveUnitCost ?? effectiveCost(l.netAmount, l.quantity, free),
    }
  })
  return {
    kind: "receipt",
    id: dto.id,
    number: dto.receiptNumber ?? dto.id,
    date: dto.receiptDateUtc,
    supplier_name: dto.supplierName,
    supplier_invoice_number: dto.supplierInvoiceNumber,
    status: DOTNET_RECEIPT_STATUS[dto.status] ?? dto.status.toLowerCase(),
    lines,
    subtotal: dto.subtotalAmount ?? lines.reduce((s, l) => s + l.gross, 0),
    line_discount: dto.lineDiscountAmount ?? 0,
    bill_discount_percent: dto.billDiscountPercent ?? 0,
    bill_discount: dto.billDiscountAmount ?? 0,
    taxable: dto.netAmount,
    vat: dto.vatAmount,
    total: dto.grossAmount,
  }
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
      total_cost: money2(line.grossAmount ?? line.unitCostPrice * line.quantity),
      vat_amount: line.vatAmount,
      free_quantity: line.freeQuantity ?? 0,
      pack_size: line.packSize ?? null,
      net_amount: line.netAmount ?? Math.round(line.unitCostPrice * line.quantity * 100) / 100,
      effective_unit_cost: line.effectiveUnitCost ?? line.unitCostPrice,
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

export interface DirectReceiptsFilters {
  branchId?: string
  page?: number
  limit?: number
  /** "received" | "voided"; omitted or "all" = both. */
  status?: string
  search?: string
}

/** Path + query for GET /purchasing/direct-goods-receipts (server-paged). */
export function directReceiptsListQuery(filters: DirectReceiptsFilters = {}): string {
  const sp = new URLSearchParams({
    pageNumber: String(Math.max(1, filters.page ?? 1)),
    pageSize: String(Math.min(200, Math.max(1, filters.limit ?? 10))),
  })
  if (filters.branchId) sp.set("branchId", filters.branchId)
  if (filters.status && filters.status !== "all") sp.set("status", filters.status)
  const search = filters.search?.trim()
  if (search) sp.set("search", search)
  return `/purchasing/direct-goods-receipts?${sp.toString()}`
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

/**
 * Supplier-bill terms of one entered line (see purchase-bill-totals.ts): free quantity, the trade discount
 * (percent or amount) and whether quantity/free/rate are per pack. All optional; absent = none.
 */
export interface PurchaseLineTermsInput {
  free_quantity?: number
  discount_percent?: number
  discount_amount?: number
  in_packs?: boolean
}

/** Bill-level (cash/trade) discount: a positive amount wins over the percent. */
export interface BillDiscountInput {
  bill_discount_percent?: number
  bill_discount_amount?: number
}

function lineTerms(item: PurchaseLineTermsInput) {
  return {
    freeQuantity: item.free_quantity ?? 0,
    discountPercent: item.discount_percent ?? 0,
    discountAmount: item.discount_amount ?? 0,
    inPacks: item.in_packs ?? false,
  }
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
  } & PurchaseLineTermsInput>
} & BillDiscountInput) {
  return {
    supplierId: orderData.supplier_id,
    orderDateUtc: `${orderData.order_date}T00:00:00Z`,
    narration: optionalText(orderData.notes),
    supplierInvoiceNumber: optionalText(orderData.supplier_invoice_number),
    billDiscountPercent: orderData.bill_discount_percent ?? 0,
    billDiscountAmount: orderData.bill_discount_amount ?? 0,
    lines: orderData.items.map((item) => ({
      medicineId: item.medicine_id,
      batchNo: optionalText(item.batch_number),
      expiryDate: optionalText(item.expiry_date),
      quantity: item.quantity_ordered,
      unitCostPrice: optionalPrice(item.unit_cost, "Unit cost") ?? 0,
      sellingPrice: optionalPrice(item.selling_price, "Selling price"),
      rackLocation: null,
      vatAmount: optionalPrice(item.vat_amount, "VAT") ?? 0,
      ...lineTerms(item),
    })),
  }
}

/** One line of a supplier bill received without a purchase order. Batch and expiry are required. */
export interface DirectReceiptLineInput extends PurchaseLineTermsInput {
  medicine_id: string
  batch_number: string
  expiry_date: string
  quantity: number
  /** Rate per pack when `in_packs`, else per unit. */
  unit_cost: number
  vat_amount: number
  /** Per base unit; blank = the medicine's price. */
  selling_price?: string | null
}

/** Body for POST /purchasing/direct-goods-receipts (CreateDirectGoodsReceiptCommand). */
export function createDirectReceiptBody(data: {
  supplier_id: string
  receipt_date: string
  supplier_invoice_number?: string | null
  items: DirectReceiptLineInput[]
  /** Paid at entry: the method; omitted = on credit. */
  payment_method?: string | null
  /** yyyy-MM-dd the bill falls due, set on the bill; omitted = the supplier's credit days decide. */
  due_date?: string | null
} & BillDiscountInput) {
  return {
    supplierId: data.supplier_id,
    receiptDateUtc: `${data.receipt_date}T00:00:00Z`,
    supplierInvoiceNumber: optionalText(data.supplier_invoice_number),
    billDiscountPercent: data.bill_discount_percent ?? 0,
    billDiscountAmount: data.bill_discount_amount ?? 0,
    payment: data.payment_method ? { method: data.payment_method } : null,
    dueDateUtc: data.due_date ? `${data.due_date}T00:00:00Z` : null,
    lines: data.items.map((item) => {
      const batchNo = optionalText(item.batch_number)
      if (!batchNo) throw new Error("Each line needs a batch number.")
      if (!optionalText(item.expiry_date)) throw new Error("Each line needs an expiry date.")
      return {
        medicineId: item.medicine_id,
        batchNo,
        expiryDate: item.expiry_date,
        quantity: item.quantity,
        unitCostPrice: item.unit_cost,
        vatAmount: item.vat_amount,
        rackLocation: null,
        sellingPrice: optionalPrice(item.selling_price, "Selling price"),
        ...lineTerms(item),
      }
    }),
  }
}

/** One line of a receipt. `quantity_to_receive` below the ordered quantity is a short delivery (0 = nothing arrived). */
export interface ReceiveLineInput {
  purchase_order_item_id: string
  quantity_to_receive?: number | null
  /** Free (bonus) units that arrived; null = in proportion to the paid quantity received. */
  free_quantity_to_receive?: number | null
  batch_number?: string | null
  expiry_date?: string | null
  selling_price?: string | null
}

/**
 * Body for POST /purchasing/purchase-orders/{id}/receive (ReceivePurchaseOrderRequest). `receiptDate` is a
 * YYYY-MM-DD day. A line that did not arrive (quantity 0) sends no batch details, as none are needed.
 */
export function receivePurchaseOrderBody(
  items: ReceiveLineInput[],
  receiptDate?: string,
  createBackorder = true,
  /** yyyy-MM-dd the bill falls due; omitted = the supplier's credit days decide. */
  dueDate?: string | null,
) {
  return {
    receiptDateUtc: receiptDate ? `${receiptDate}T00:00:00Z` : null,
    createBackorder,
    dueDateUtc: dueDate ? `${dueDate}T00:00:00Z` : null,
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
        freeQuantityReceived: arrived ? (item.free_quantity_to_receive ?? null) : null,
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
    } & PurchaseLineTermsInput>
  } & BillDiscountInput, idempotencyKey?: string): Promise<{ data: { id: string } | null; error: string | null }> => {
    const id = await dotnetMutate<string>("/purchasing/purchase-orders", createPurchaseOrderBody(orderData), idempotencyKey)
    return { data: { id }, error: null as string | null }
  },

  /**
   * Records a supplier bill received without a purchase order: stock goes into the lots (paid + free units at
   * the effective cost) and the payable / purchase voucher are posted from the discounted bill.
   */
  createDirectReceipt: async (
    data: Parameters<typeof createDirectReceiptBody>[0],
    idempotencyKey?: string,
  ): Promise<{ data: { id: string } | null; error: string | null }> => {
    const id = await dotnetMutate<string>("/purchasing/direct-goods-receipts", createDirectReceiptBody(data), idempotencyKey)
    return { data: { id }, error: null as string | null }
  },

  /** A purchase order as a supplier bill (lines, discounts, VAT), for the detail view. */
  getPurchaseOrderBill: async (id: string): Promise<PurchaseBillView> =>
    purchaseOrderBillView(await dotnetClient.get<DotnetPurchaseOrderDto>(`/purchasing/purchase-orders/${encodeURIComponent(id)}`)),

  /** A direct receipt as a supplier bill, for the detail view. */
  getDirectReceiptBill: async (id: string): Promise<PurchaseBillView> =>
    directReceiptBillView(
      await dotnetClient.get<DotnetDirectGoodsReceiptDto>(`/purchasing/direct-goods-receipts/${encodeURIComponent(id)}`),
    ),

  /** `idempotencyKey`: one per user action, reused when the same action is retried (lib/api/idempotency.ts). */
  approvePurchaseOrder: async (id: string, idempotencyKey?: string) => {
    const approvedId = await dotnetMutate<string>(`/purchasing/purchase-orders/${encodeURIComponent(id)}/approve`, {}, idempotencyKey)
    return { data: { id: approvedId }, error: null as string | null }
  },

  /** Only works pre-receipt — an order with anything received must be reversed
   *  via voidGoodsReceipt instead. The .NET cancel command requires a reason. */
  cancelPurchaseOrder: async (id: string, reason?: string, idempotencyKey?: string) => {
    const cancelledId = await dotnetMutate<string>(
      `/purchasing/purchase-orders/${encodeURIComponent(id)}/cancel`,
      cancelPurchaseOrderBody(reason ?? ""),
      idempotencyKey,
    )
    return { data: { id: cancelledId }, error: null as string | null }
  },

  /** Takes the receipt's stock back out of the lots it created; refused when any of it was sold or moved. */
  voidGoodsReceipt: async (id: string, reason: string, idempotencyKey?: string) => {
    const voidedId = await dotnetMutate<string>(
      `/purchasing/direct-goods-receipts/${encodeURIComponent(id)}/void`,
      { reason },
      idempotencyKey,
    )
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
    /** yyyy-MM-dd; omitted = the supplier's credit days decide. */
    dueDate?: string | null
    items: Array<ReceiveLineInput & { medicine_id: string; unit_cost: string }>
    /** One per receive action, reused when it is retried. */
    idempotencyKey?: string
  }): Promise<{
    data: { goods_receipt_id: string; receipt_number: string; backorder_id: string | null; short_line_count: number } | null
    error: string | null
  }> => {
    const result = await dotnetMutate<DotnetReceivePurchaseOrderResult>(
      `/purchasing/purchase-orders/${encodeURIComponent(params.purchaseOrderId)}/receive`,
      receivePurchaseOrderBody(params.items, params.receiptDate, params.createBackorder ?? true, params.dueDate),
      params.idempotencyKey,
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

  /** One server page of direct receipts, newest first; status and search are applied on the server. */
  getDirectReceipts: async (filters: DirectReceiptsFilters = {}) => {
    try {
      const page = await dotnetClient.get<DotnetPagedResponse<DotnetDirectGoodsReceiptDto>>(directReceiptsListQuery(filters))
      return {
        data: page.items.map(toDirectGoodsReceipt),
        count: page.totalCount,
        totalPages: page.totalPages,
        error: null as string | null,
      }
    } catch (error) {
      return {
        data: [] as DirectGoodsReceipt[],
        count: 0,
        totalPages: 0,
        error: stockErrorMessage(error, "Failed to load direct receipts"),
      }
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
