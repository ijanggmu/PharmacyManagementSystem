/**
 * Sales, returns and refunds calls for the .NET Sales module, switchable per backend target (SALES).
 * The legacy path stays in features/{sales,returns,refunds}/api-client.ts and is untouched; those
 * methods delegate here only when backendTarget("SALES") is "dotnet".
 *
 * Gaps versus the legacy UI shape (SaleDto / SaleReturnDto / SaleRefundDto carry less):
 * - no sale or return number: a display label is derived from the id (refund numbers do come from .NET)
 * - no tax, payment status, or customer name/phone/email on sales: tax reads "0.00", payment status is
 *   derived from balanceDue, and customer names are blank (the .NET list and detail never fill CustomerName)
 * - no strength/form on medicines, no customer on returns or refunds, no sale total on returns
 * Calls with filters the .NET list cannot apply stay on the legacy path (see canList* below).
 */

import type { CreateSaleData, Sale, SalesFilters } from "@/features/sales/api-client"
import type { CreateReturnData, Return, ReturnsFilters, UpdateReturnData } from "@/features/returns/api-client"
import type { CreateRefundData, Refund, RefundsFilters, UpdateRefundData } from "@/features/refunds/api-client"
import { dotnetClient } from "@/lib/api/dotnet-client"

const SALES_BASE = "/api/v1/sales"
const SALES_LIST_PATH = SALES_BASE
const RETURNS_PATH = `${SALES_BASE}/returns`
const REFUNDS_PATH = `${SALES_BASE}/refunds`

/** SaleDto (Sales module, camelCase JSON). */
export interface DotnetSaleItemDto {
  id: string
  medicineId: string
  medicineName: string | null
  quantity: number
  unitPrice: number
  discountAmount: number
  unitCostPrice: number
  lineTotal: number
}

export interface DotnetSaleDto {
  id: string
  customerId: string | null
  customerName: string | null
  saleDateUtc: string
  status: string
  paymentMethod: string
  paymentAmount: number
  totalAmount: number
  balanceDue: number
  prescriptionId: string | null
  notes: string | null
  createdAtUtc: string
  cancelledAtUtc: string | null
  cancelReason: string | null
  items: DotnetSaleItemDto[]
}

export interface DotnetSaleReturnItemDto {
  id: string
  saleItemId: string
  medicineId: string
  medicineName: string | null
  quantityReturned: number
  unitPrice: number
  totalAmount: number
  reason: string
  packagingCondition: string
}

export interface DotnetSaleReturnDto {
  id: string
  saleId: string
  customerId: string | null
  returnDateUtc: string
  status: string
  returnReason: string
  notes: string | null
  totalReturnAmount: number
  createdAtUtc: string
  stockRestoredAtUtc: string | null
  items: DotnetSaleReturnItemDto[]
}

export interface DotnetSaleRefundItemDto {
  id: string
  saleItemId: string
  medicineId: string
  medicineName: string | null
  quantityRefunded: number
  unitPrice: number
  totalRefundAmount: number
}

export interface DotnetSaleRefundDto {
  id: string
  originalSaleId: string
  customerId: string | null
  refundDateUtc: string
  status: string
  refundReason: string
  refundType: string
  refundMethod: string
  refundAmount: number
  taxRefundAmount: number
  processingFee: number
  netRefundAmount: number
  refundNumber: string
  creditNoteNumber: string | null
  notes: string | null
  createdAtUtc: string
  items: DotnetSaleRefundItemDto[]
}

/** ReturnsStatsDto and RefundsStatsDto share one shape. */
export interface DotnetReturnsStatsDto {
  total: number
  totalRefundAmount: number
  pending: number
  approved: number
  rejected: number
  completed: number
}

export interface DotnetPagedList<T> {
  items: T[]
  pageNumber: number
  pageSize: number
  totalCount: number
  totalPages: number
}

export type ReturnsStats = DotnetReturnsStatsDto

// ---------------------------------------------------------------------------
// Pure helpers
// ---------------------------------------------------------------------------

/** Money crosses the wire as a number; the legacy UI reads two-decimal strings. */
export function toMoney(value: number): string {
  return value.toFixed(2)
}

/** The .NET side stores no sale or return number, so a stable display label is derived from the id. */
export function displayNumber(prefix: string, id: string): string {
  return `${prefix}-${id.replace(/-/g, "").slice(0, 8).toUpperCase()}`
}

export function splitName(name: string | null): { first: string; last: string } {
  const trimmed = (name ?? "").trim()
  const space = trimmed.indexOf(" ")
  if (space === -1) return { first: trimmed, last: "" }
  return { first: trimmed.slice(0, space), last: trimmed.slice(space + 1).trim() }
}

function lower<T extends string>(value: string): T {
  return value.toLowerCase() as T
}

/** Date-only filters ("YYYY-MM-DD") become UTC day bounds; values that already carry a time pass through. */
export function toUtcDateTime(value: string, endOfDay = false): string {
  if (value.includes("T")) return new Date(value).toISOString()
  return `${value}T${endOfDay ? "23:59:59.999" : "00:00:00"}Z`
}

/** The legacy sale carries a customer object; .NET gives an id and, when filled, a single name. */
export function toCustomerRef(customerId: string | null, customerName: string | null): Sale["customers"] {
  if (!customerId) return null
  const name = splitName(customerName)
  return { id: customerId, first_name: name.first, last_name: name.last, phone: null, email: null }
}

export function toSale(dto: DotnetSaleDto): Sale {
  const discount = dto.items.reduce((sum, item) => sum + item.discountAmount, 0)
  const method = lower<Sale["payment_method"]>(dto.paymentMethod)
  return {
    id: dto.id,
    sale_number: displayNumber("SALE", dto.id),
    invoice_number: null,
    customer_id: dto.customerId ?? "",
    total_amount: toMoney(dto.totalAmount),
    discount_amount: toMoney(discount),
    // Tax is computed by Accounting and not stored on the sale, so it cannot be shown accurately.
    tax_amount: "0.00",
    payment_method: method,
    payment_status: dto.balanceDue <= 0 ? "paid" : "pending",
    // The legacy list only ever holds completed or cancelled sales.
    status: dto.status.toLowerCase() === "cancelled" ? "cancelled" : "completed",
    cancelled_at: dto.cancelledAtUtc,
    cancellation_reason: dto.cancelReason,
    sale_date: dto.saleDateUtc,
    notes: dto.notes,
    created_at: dto.createdAtUtc,
    customers: toCustomerRef(dto.customerId, dto.customerName),
    sale_items: dto.items.map((item) => ({
      id: item.id,
      sale_id: dto.id,
      medicine_id: item.medicineId,
      quantity: item.quantity,
      unit_price: toMoney(item.unitPrice),
      total_price: toMoney(item.lineTotal),
      medicines: item.medicineName
        ? { id: item.medicineId, name: item.medicineName, strength: "", form: "" }
        : null,
    })),
    sale_payments: [{ id: dto.id, payment_method: method, amount: toMoney(dto.paymentAmount) }],
  }
}

export function toReturn(dto: DotnetSaleReturnDto): Return {
  return {
    id: dto.id,
    return_number: displayNumber("RET", dto.id),
    sale_id: dto.saleId,
    customer_id: dto.customerId ?? "",
    return_date: dto.returnDateUtc,
    total_return_amount: toMoney(dto.totalReturnAmount),
    status: lower<Return["status"]>(dto.status),
    reason: dto.returnReason,
    notes: dto.notes,
    created_at: dto.createdAtUtc,
    sales: { id: dto.saleId, sale_number: displayNumber("SALE", dto.saleId), total_amount: "" },
    customers: null,
    return_items: dto.items.map((item) => ({
      id: item.id,
      return_id: dto.id,
      sale_item_id: item.saleItemId,
      quantity_returned: item.quantityReturned,
      reason: item.reason,
      refund_amount: toMoney(item.totalAmount),
      packaging_condition: lower<"sealed" | "opened" | "damaged">(item.packagingCondition),
      restocked: dto.stockRestoredAtUtc !== null,
      // The return item carries no sold quantity, so quantity here is the quantity returned on this line.
      sale_items: {
        id: item.saleItemId,
        quantity: item.quantityReturned,
        unit_price: toMoney(item.unitPrice),
        total_price: toMoney(item.totalAmount),
        medicines: item.medicineName
          ? { id: item.medicineId, name: item.medicineName, strength: "", form: "" }
          : null,
      },
    })),
  }
}

export function toRefund(dto: DotnetSaleRefundDto): Refund {
  return {
    id: dto.id,
    refund_number: dto.refundNumber,
    credit_note_number: dto.creditNoteNumber,
    original_sale_id: dto.originalSaleId,
    sale_id: dto.originalSaleId,
    customer_id: dto.customerId ?? "",
    refund_date: dto.refundDateUtc,
    refund_amount: toMoney(dto.refundAmount),
    net_refund_amount: toMoney(dto.netRefundAmount),
    total_refund_amount: toMoney(dto.netRefundAmount),
    refund_status: lower<Refund["refund_status"]>(dto.status),
    status: lower<Refund["refund_status"]>(dto.status),
    refund_reason: dto.refundReason,
    reason: dto.refundReason,
    notes: dto.notes,
    created_at: dto.createdAtUtc,
    sales: { id: dto.originalSaleId, sale_number: displayNumber("SALE", dto.originalSaleId), total_amount: "", invoice_number: null },
    customers: null,
    refund_items: dto.items.map((item) => ({
      id: item.id,
      refund_id: dto.id,
      sale_item_id: item.saleItemId,
      quantity_refunded: item.quantityRefunded,
      // Refund lines carry no reason of their own; the refund-level reason applies to each line.
      reason: dto.refundReason,
      refund_amount: toMoney(item.totalRefundAmount),
      sale_items: {
        id: item.saleItemId,
        quantity: item.quantityRefunded,
        unit_price: toMoney(item.unitPrice),
        total_price: toMoney(item.totalRefundAmount),
        medicines: item.medicineName
          ? { id: item.medicineId, name: item.medicineName, strength: "", form: "" }
          : null,
      },
    })),
  }
}

function isDefaultSort(sortBy: string | undefined, fallback: string): boolean {
  return !sortBy || sortBy === fallback
}

/** The .NET sales list cannot filter by search text, payment status or method, or amount, nor sort otherwise. */
export function canListSalesOnDotnet(f: SalesFilters): boolean {
  return (
    !f.search &&
    !f.paymentStatus &&
    !f.paymentMethod &&
    !(f.paymentStatuses && f.paymentStatuses.length) &&
    !(f.paymentMethods && f.paymentMethods.length) &&
    f.minAmount == null &&
    f.maxAmount == null &&
    isDefaultSort(f.sortBy, "sale_date") &&
    (f.sortOrder ?? "desc") === "desc"
  )
}

/** The .NET returns list cannot filter by search text, nor sort other than by return date. */
export function canListReturnsOnDotnet(f: ReturnsFilters): boolean {
  return !f.search && isDefaultSort(f.sortBy, "created_at") && (f.sortOrder ?? "desc") === "desc"
}

export function canListRefundsOnDotnet(f: RefundsFilters): boolean {
  return !f.search && isDefaultSort(f.sortBy, "created_at") && (f.sortOrder ?? "desc") === "desc"
}

function pagingParams(sp: URLSearchParams, page: number | undefined, limit: number | undefined): void {
  sp.set("pageNumber", String(page ?? 1))
  sp.set("pageSize", String(limit ?? 50))
}

export function buildSalesListQuery(f: SalesFilters): string {
  const sp = new URLSearchParams()
  if (f.customerId) sp.set("customerId", f.customerId)
  if (f.dateFrom) sp.set("dateFromUtc", toUtcDateTime(f.dateFrom))
  if (f.dateTo) sp.set("dateToUtc", toUtcDateTime(f.dateTo, true))
  pagingParams(sp, f.page, f.limit)
  return sp.toString()
}

export function buildReturnsListQuery(f: ReturnsFilters): string {
  const sp = new URLSearchParams()
  if (f.status) sp.set("status", f.status)
  if (f.customerId) sp.set("customerId", f.customerId)
  if (f.saleId) sp.set("saleId", f.saleId)
  if (f.dateFrom) sp.set("dateFromUtc", toUtcDateTime(f.dateFrom))
  if (f.dateTo) sp.set("dateToUtc", toUtcDateTime(f.dateTo, true))
  if (f.minAmount != null) sp.set("minAmount", String(f.minAmount))
  if (f.maxAmount != null) sp.set("maxAmount", String(f.maxAmount))
  pagingParams(sp, f.page, f.limit)
  return sp.toString()
}

export function buildRefundsListQuery(f: RefundsFilters): string {
  const sp = new URLSearchParams()
  if (f.status) sp.set("status", f.status)
  if (f.customerId) sp.set("customerId", f.customerId)
  if (f.saleId) sp.set("saleId", f.saleId)
  if (f.dateFrom) sp.set("dateFromUtc", toUtcDateTime(f.dateFrom))
  if (f.dateTo) sp.set("dateToUtc", toUtcDateTime(f.dateTo, true))
  if (f.minAmount != null) sp.set("minAmount", String(f.minAmount))
  if (f.maxAmount != null) sp.set("maxAmount", String(f.maxAmount))
  pagingParams(sp, f.page, f.limit)
  return sp.toString()
}

/** Body for POST /api/v1/sales/returns. Mirrors the legacy payload; packaging defaults to "opened" as before. */
export function buildCreateReturnBody(data: CreateReturnData) {
  return {
    saleId: data.sale_id,
    customerId: data.customer_id || null,
    returnDateUtc: toUtcDateTime(data.return_date),
    status: data.status,
    reason: data.reason,
    notes: data.notes,
    returnItems: data.return_items.map((item) => ({
      saleItemId: item.sale_item_id,
      quantityReturned: item.quantity_returned,
      reason: item.reason,
      packagingCondition: item.packaging_condition || "opened",
    })),
  }
}

/** Body for POST /api/v1/sales/refunds. Mirrors the legacy payload, including its reason and status defaults. */
export function buildCreateRefundBody(data: CreateRefundData) {
  return {
    originalSaleId: data.sale_id,
    customerId: data.customer_id || null,
    refundDateUtc: toUtcDateTime(data.refund_date),
    refundReason: data.reason || "general_refund",
    status: data.status || "pending",
    notes: data.notes,
    taxRefundAmount: data.tax_refund_amount,
    processingFee: data.processing_fee,
    refundItems: (data.refund_items || []).map((item) => ({
      saleItemId: item.sale_item_id,
      quantityRefunded: item.quantity_refunded,
    })),
  }
}

/** Body for PUT /api/v1/sales/returns/{id}. Only the keys the caller passed are sent. */
export function buildUpdateReturnBody(updates: UpdateReturnData): Record<string, unknown> {
  const body: Record<string, unknown> = {}
  if (updates.status !== undefined) body.status = updates.status
  if (updates.reason !== undefined) body.reason = updates.reason
  if (updates.notes !== undefined) body.notes = updates.notes
  return body
}

/** Body for PUT /api/v1/sales/refunds/{id}. Accepts both the short and the column-style keys the legacy form uses. */
export function buildUpdateRefundBody(updates: UpdateRefundData): Record<string, unknown> {
  const body: Record<string, unknown> = {}
  const status = updates.status ?? updates.refund_status
  const reason = updates.reason ?? updates.refund_reason
  if (status !== undefined) body.status = status
  if (reason !== undefined) body.refundReason = reason
  if (updates.notes !== undefined) body.notes = updates.notes
  return body
}

// ---------------------------------------------------------------------------
// Checkout (CreateSaleCommand)
// ---------------------------------------------------------------------------

/** CreateSaleCommand body (camelCase). Unit prices are never sent: the server resolves every price. */
export interface DotnetCreateSaleBody {
  customerId: string | null
  items: { medicineId: string; quantity: number; discountAmount: number; discountPercent: number }[]
  payments: { method: string; amount: number; reference: string | null }[]
  notes: string | null
  prescriptionId: string | null
}

function round2(value: number): number {
  return Math.round(value * 100) / 100
}

function numberOrZero(value: string | number | undefined | null): number {
  if (value === undefined || value === null || value === "") return 0
  const n = typeof value === "number" ? value : parseFloat(value)
  return Number.isFinite(n) ? n : 0
}

/**
 * Splits an order-level discount across lines pro rata to each line's net total, so the per-line
 * amounts add up to the order discount exactly (the last line takes the rounding remainder).
 * CreateSaleCommand has no order-level discount, so this is how it reaches the server.
 */
export function allocateOrderDiscount(lineTotals: number[], orderDiscount: number): number[] {
  if (lineTotals.length === 0) return []
  const sum = lineTotals.reduce((acc, n) => acc + n, 0)
  if (orderDiscount <= 0 || sum <= 0) return lineTotals.map(() => 0)
  const shares: number[] = []
  let allocated = 0
  lineTotals.forEach((line, index) => {
    if (index === lineTotals.length - 1) {
      shares.push(round2(orderDiscount - allocated))
      return
    }
    const share = round2((orderDiscount * line) / sum)
    shares.push(share)
    allocated = round2(allocated + share)
  })
  return shares
}

/** Maps the legacy checkout payload onto CreateSaleCommand. Line discounts keep their percent and absolute parts. */
export function toDotnetCreateSaleBody(data: CreateSaleData): DotnetCreateSaleBody {
  const shares = allocateOrderDiscount(
    data.sale_items.map((item) => numberOrZero(item.total_price)),
    numberOrZero(data.discount_amount),
  )
  return {
    customerId: data.customer_id || null,
    items: data.sale_items.map((item, index) => ({
      medicineId: item.medicine_id,
      quantity: item.quantity,
      discountAmount: round2(numberOrZero(item.discount_amount) + shares[index]),
      discountPercent: numberOrZero(item.discount_percent),
    })),
    payments: data.payments.map((leg) => ({ method: leg.method, amount: leg.amount, reference: leg.reference ?? null })),
    notes: data.notes?.trim() || null,
    prescriptionId: data.prescription_id ?? null,
  }
}

/** Two checkouts with the same body share a fingerprint, so a retry of the same cart can reuse its key. */
export function checkoutFingerprint(data: CreateSaleData): string {
  return JSON.stringify(toDotnetCreateSaleBody(data))
}

/**
 * Holds one Idempotency-Key per checkout attempt. The same cart (same fingerprint) reuses its key on
 * retry; a changed cart gets a fresh key. reset() after a successful sale so the next cart starts clean.
 */
export function createCheckoutKeyTracker(newKey: () => string = () => crypto.randomUUID()) {
  let current: { fingerprint: string; key: string } | null = null
  return {
    keyFor(fingerprint: string): string {
      if (!current || current.fingerprint !== fingerprint) current = { fingerprint, key: newKey() }
      return current.key
    },
    reset(): void {
      current = null
    },
  }
}

// ---------------------------------------------------------------------------
// .NET calls
// ---------------------------------------------------------------------------

export async function listSalesOnDotnet(filters: SalesFilters): Promise<{ data: Sale[]; total: number }> {
  const page = await dotnetClient.get<DotnetPagedList<DotnetSaleDto>>(`${SALES_LIST_PATH}?${buildSalesListQuery(filters)}`)
  return { data: page.items.map(toSale), total: page.totalCount }
}

export async function getSaleOnDotnet(id: string): Promise<Sale> {
  return toSale(await dotnetClient.get<DotnetSaleDto>(`${SALES_LIST_PATH}/${id}`))
}

export async function listReturnsOnDotnet(filters: ReturnsFilters): Promise<{ data: Return[]; total: number }> {
  const page = await dotnetClient.get<DotnetPagedList<DotnetSaleReturnDto>>(`${RETURNS_PATH}?${buildReturnsListQuery(filters)}`)
  return { data: page.items.map(toReturn), total: page.totalCount }
}

export async function getReturnOnDotnet(id: string): Promise<Return> {
  return toReturn(await dotnetClient.get<DotnetSaleReturnDto>(`${RETURNS_PATH}/${id}`))
}

/** The create endpoint answers with the new id only, so the row is read back to match the legacy return value. */
export async function createReturnOnDotnet(data: CreateReturnData, idempotencyKey: string): Promise<Return> {
  const id = await dotnetClient.post<string>(RETURNS_PATH, buildCreateReturnBody(data), idempotencyKey)
  return getReturnOnDotnet(id)
}

export async function updateReturnOnDotnet(id: string, updates: UpdateReturnData): Promise<Return> {
  await dotnetClient.put<string>(`${RETURNS_PATH}/${id}`, buildUpdateReturnBody(updates))
  return getReturnOnDotnet(id)
}

export function toReturnsStats(dto: DotnetReturnsStatsDto): ReturnsStats {
  return {
    total: dto.total,
    totalRefundAmount: dto.totalRefundAmount,
    pending: dto.pending,
    approved: dto.approved,
    rejected: dto.rejected,
    completed: dto.completed,
  }
}

export async function getReturnsStatsOnDotnet(): Promise<ReturnsStats> {
  return toReturnsStats(await dotnetClient.get<DotnetReturnsStatsDto>(`${RETURNS_PATH}/stats`))
}

export async function listRefundsOnDotnet(filters: RefundsFilters): Promise<{ data: Refund[]; total: number }> {
  const page = await dotnetClient.get<DotnetPagedList<DotnetSaleRefundDto>>(`${REFUNDS_PATH}?${buildRefundsListQuery(filters)}`)
  return { data: page.items.map(toRefund), total: page.totalCount }
}

export async function getRefundOnDotnet(id: string): Promise<Refund> {
  return toRefund(await dotnetClient.get<DotnetSaleRefundDto>(`${REFUNDS_PATH}/${id}`))
}

export async function createRefundOnDotnet(data: CreateRefundData, idempotencyKey: string): Promise<Refund> {
  const id = await dotnetClient.post<string>(REFUNDS_PATH, buildCreateRefundBody(data), idempotencyKey)
  return getRefundOnDotnet(id)
}

export async function updateRefundOnDotnet(id: string, updates: UpdateRefundData): Promise<Refund> {
  await dotnetClient.put<string>(`${REFUNDS_PATH}/${id}`, buildUpdateRefundBody(updates))
  return getRefundOnDotnet(id)
}

export async function getRefundsStatsOnDotnet(): Promise<ReturnsStats> {
  return toReturnsStats(await dotnetClient.get<DotnetReturnsStatsDto>(`${REFUNDS_PATH}/stats`))
}

/** The create endpoint answers with the new id only, so the sale is read back to return the legacy shape. */
export async function createSaleOnDotnet(data: CreateSaleData, idempotencyKey: string): Promise<Sale> {
  const id = await dotnetClient.post<string>(SALES_LIST_PATH, toDotnetCreateSaleBody(data), idempotencyKey)
  return getSaleOnDotnet(id)
}
