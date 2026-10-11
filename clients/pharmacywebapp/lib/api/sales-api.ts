/**
 * Sales, returns and refunds calls for the .NET Sales module.
 *
 * Every list filter, search and sort runs server-side (GET /sales, /sales/returns, /sales/refunds).
 * Medicine labels (name/strength/form) and customer names are resolved by the server.
 *
 * Gaps versus the UI shape (Sale / Return / Refund carry less):
 * - no return number: a display label is derived from the id (sales use the IRD invoice number once
 *   issued; refund numbers come from .NET)
 * - payment status is derived from balanceDue; no customer email on sales; no sale total on returns
 */

import type { CreateSaleData, Sale, SalesFilters, UpdateSaleData } from "@/features/sales/api-client"
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
  discountPercent?: number
  isTaxable?: boolean
  medicineGenericName?: string | null
  medicineStrength?: string | null
  medicineForm?: string | null
}

export interface DotnetSalePaymentDto {
  id: string
  method: string
  amount: number
  reference: string | null
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
  payments?: DotnetSalePaymentDto[]
  cashierUserId?: string | null
  branchId?: string | null
  invoiceNumber?: string | null
  fiscalYear?: string | null
  vatRatePercent?: number | null
  taxableAmount?: number | null
  vatAmount?: number | null
  exemptAmount?: number | null
  printCount?: number
  customerPhone?: string | null
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
  medicineStrength?: string | null
  medicineForm?: string | null
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
  customerName?: string | null
  /** Invoice number of the returned sale, when issued. */
  saleInvoiceNumber?: string | null
  branchId?: string | null
}

export interface DotnetSaleRefundItemDto {
  id: string
  saleItemId: string
  medicineId: string
  medicineName: string | null
  quantityRefunded: number
  unitPrice: number
  totalRefundAmount: number
  isTaxable?: boolean
  medicineStrength?: string | null
  medicineForm?: string | null
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
  branchId?: string | null
  /** Invoice number of the sale this credit note reverses. */
  originalInvoiceNumber?: string | null
  fiscalYear?: string | null
  vatRatePercent?: number | null
  taxableAmount?: number | null
  vatAmount?: number | null
  exemptAmount?: number | null
  printCount?: number
  customerName?: string | null
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

/** The legacy sale carries a customer object; .NET gives an id and, when resolved, a single name. */
export function toCustomerRef(
  customerId: string | null,
  customerName: string | null,
  phone: string | null = null
): Sale["customers"] {
  if (!customerId) return null
  const name = splitName(customerName)
  return { id: customerId, first_name: name.first, last_name: name.last, phone, email: null }
}

/** Medicine label resolved by the server; null when the medicine is unknown (e.g. purged). */
export function toMedicineRef(
  medicineId: string,
  name: string | null | undefined,
  strength: string | null | undefined,
  form: string | null | undefined
): { id: string; name: string; strength: string; form: string } | null {
  if (!name) return null
  return { id: medicineId, name, strength: strength ?? "", form: form ?? "" }
}

function withGenericName<T extends object>(ref: T | null, genericName: string | null | undefined): (T & { generic_name: string | null }) | null {
  return ref ? { ...ref, generic_name: genericName?.trim() || null } : null
}

export function toSale(dto: DotnetSaleDto): Sale {
  const discount = dto.items.reduce((sum, item) => sum + item.discountAmount, 0)
  const method = lower<Sale["payment_method"]>(dto.paymentMethod)
  const payments = dto.payments ?? []
  return {
    id: dto.id,
    // The sequential IRD invoice number is the sale's real document number once issued.
    sale_number: dto.invoiceNumber ?? displayNumber("SALE", dto.id),
    invoice_number: dto.invoiceNumber ?? null,
    fiscal_year: dto.fiscalYear ?? null,
    branch_id: dto.branchId ?? null,
    customer_id: dto.customerId ?? "",
    total_amount: toMoney(dto.totalAmount),
    discount_amount: toMoney(discount),
    // VAT is stored on sales made since the breakdown was added; older sales show 0.
    tax_amount: toMoney(dto.vatAmount ?? 0),
    vat_rate_percent: dto.vatRatePercent ?? null,
    taxable_amount: dto.taxableAmount ?? null,
    exempt_amount: dto.exemptAmount ?? null,
    print_count: dto.printCount ?? 0,
    payment_method: method,
    payment_status: dto.balanceDue <= 0 ? "paid" : "pending",
    // The legacy list only ever holds completed or cancelled sales.
    status: dto.status.toLowerCase() === "cancelled" ? "cancelled" : "completed",
    cancelled_at: dto.cancelledAtUtc,
    cancellation_reason: dto.cancelReason,
    sale_date: dto.saleDateUtc,
    notes: dto.notes,
    created_at: dto.createdAtUtc,
    paid_amount: toMoney(dto.paymentAmount),
    balance_due: toMoney(dto.balanceDue),
    cashier_user_id: dto.cashierUserId ?? null,
    prescription_id: dto.prescriptionId ?? null,
    customers: toCustomerRef(dto.customerId, dto.customerName, dto.customerPhone ?? null),
    sale_items: dto.items.map((item) => ({
      id: item.id,
      sale_id: dto.id,
      medicine_id: item.medicineId,
      quantity: item.quantity,
      unit_price: toMoney(item.unitPrice),
      total_price: toMoney(item.lineTotal),
      discount_amount: toMoney(item.discountAmount),
      discount_percent: item.discountPercent ?? 0,
      is_taxable: item.isTaxable ?? true,
      unit_cost_price: toMoney(item.unitCostPrice ?? 0),
      medicines: withGenericName(
        toMedicineRef(item.medicineId, item.medicineName, item.medicineStrength, item.medicineForm),
        item.medicineGenericName
      ),
    })),
    // Split-tender legs as recorded; older payloads without legs fall back to the header method.
    sale_payments:
      payments.length > 0
        ? payments.map((leg) => ({
            id: leg.id,
            payment_method: leg.method.toLowerCase(),
            amount: toMoney(leg.amount),
            reference: leg.reference,
          }))
        : [{ id: dto.id, payment_method: method, amount: toMoney(dto.paymentAmount), reference: null }],
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
    sales: {
      id: dto.saleId,
      sale_number: dto.saleInvoiceNumber ?? displayNumber("SALE", dto.saleId),
      total_amount: "",
    },
    customers: returnCustomer(dto.customerId, dto.customerName ?? null),
    branch_id: dto.branchId ?? null,
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
        medicines: toMedicineRef(item.medicineId, item.medicineName, item.medicineStrength, item.medicineForm),
      },
    })),
  }
}

/** Returns and refunds carry a customer id and, when resolved, a name (no phone). */
function returnCustomer(customerId: string | null, customerName: string | null): Return["customers"] {
  if (!customerId || !customerName) return null
  const name = splitName(customerName)
  return { id: customerId, first_name: name.first, last_name: name.last, phone: null }
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
    refund_method: dto.refundMethod,
    reason: dto.refundReason,
    notes: dto.notes,
    created_at: dto.createdAtUtc,
    sales: {
      id: dto.originalSaleId,
      sale_number: dto.originalInvoiceNumber ?? displayNumber("SALE", dto.originalSaleId),
      total_amount: "",
      invoice_number: dto.originalInvoiceNumber ?? null,
    },
    branch_id: dto.branchId ?? null,
    fiscal_year: dto.fiscalYear ?? null,
    vat_rate_percent: dto.vatRatePercent ?? null,
    taxable_amount: dto.taxableAmount ?? null,
    vat_amount: dto.vatAmount ?? null,
    exempt_amount: dto.exemptAmount ?? null,
    print_count: dto.printCount ?? 0,
    customers: returnCustomer(dto.customerId, dto.customerName ?? null),
    refund_items: dto.items.map((item) => ({
      id: item.id,
      refund_id: dto.id,
      sale_item_id: item.saleItemId,
      quantity_refunded: item.quantityRefunded,
      // Refund lines carry no reason of their own; the refund-level reason applies to each line.
      reason: dto.refundReason,
      refund_amount: toMoney(item.totalRefundAmount),
      medicine_id: item.medicineId,
      is_taxable: item.isTaxable ?? true,
      sale_items: {
        id: item.saleItemId,
        quantity: item.quantityRefunded,
        unit_price: toMoney(item.unitPrice),
        total_price: toMoney(item.totalRefundAmount),
        medicines: toMedicineRef(item.medicineId, item.medicineName, item.medicineStrength, item.medicineForm),
      },
    })),
  }
}

function pagingParams(sp: URLSearchParams, page: number | undefined, limit: number | undefined): void {
  sp.set("pageNumber", String(page ?? 1))
  sp.set("pageSize", String(limit ?? 50))
}

const DATE_ONLY = /^\d{4}-\d{2}-\d{2}$/

/**
 * Date filters: a calendar day ("YYYY-MM-DD") is sent as fromDate/toDate, which the server reads as a
 * whole Nepal-time day (both ends inclusive). A value with a time is an exact instant and is sent as
 * dateFromUtc/dateToUtc.
 */
function dateRangeParams(sp: URLSearchParams, from: string | undefined, to: string | undefined): void {
  if (from) {
    if (DATE_ONLY.test(from)) sp.set("fromDate", from)
    else sp.set("dateFromUtc", toUtcDateTime(from))
  }
  if (to) {
    if (DATE_ONLY.test(to)) sp.set("toDate", to)
    else sp.set("dateToUtc", toUtcDateTime(to, true))
  }
}

function amountParams(sp: URLSearchParams, min: number | undefined, max: number | undefined): void {
  if (min != null && Number.isFinite(min)) sp.set("minAmount", String(min))
  if (max != null && Number.isFinite(max)) sp.set("maxAmount", String(max))
}

/** Sends only sort fields the server accepts (aliases map onto them); anything else keeps the default order. */
function sortParams(
  sp: URLSearchParams,
  sortBy: string | undefined,
  sortOrder: "asc" | "desc" | undefined,
  fields: Record<string, string>
): void {
  const field = sortBy ? fields[sortBy] : undefined
  if (field) sp.set("sortBy", field)
  if (field || sortOrder) sp.set("sortOrder", sortOrder ?? "desc")
}

/** UI sort keys → SearchSalesQuery.SortBy. */
export const SALES_SORT_FIELDS: Record<string, string> = {
  sale_date: "sale_date",
  created_at: "created_at",
  total_amount: "total_amount",
  invoice_number: "invoice_number",
  sale_number: "invoice_number",
  balance_due: "balance_due",
}

/** UI sort keys → SearchReturnsQuery.SortBy. */
export const RETURNS_SORT_FIELDS: Record<string, string> = {
  return_date: "return_date",
  created_at: "created_at",
  total_return_amount: "total_return_amount",
  status: "status",
}

/** UI sort keys → SearchRefundsQuery.SortBy. */
export const REFUNDS_SORT_FIELDS: Record<string, string> = {
  refund_date: "refund_date",
  created_at: "created_at",
  net_refund_amount: "net_refund_amount",
  total_refund_amount: "net_refund_amount",
  refund_amount: "net_refund_amount",
  refund_number: "refund_number",
  status: "status",
}

/** Single and multi-select values merged, de-duplicated, comma-joined (the server splits on commas). */
function joinValues(single: string | undefined, many: readonly string[] | undefined): string | null {
  const values = new Set<string>()
  if (single) values.add(single)
  for (const value of many ?? []) if (value) values.add(value)
  return values.size > 0 ? [...values].join(",") : null
}

export function buildSalesListQuery(f: SalesFilters): string {
  const sp = new URLSearchParams()
  if (f.customerId) sp.set("customerId", f.customerId)
  if (f.medicineId) sp.set("medicineId", f.medicineId)
  if (f.branchId) sp.set("branchId", f.branchId)
  if (f.cashierUserId) sp.set("cashierUserId", f.cashierUserId)
  if (f.onlyWithBalanceDue) sp.set("onlyWithBalanceDue", "true")
  const search = f.search?.trim()
  if (search) sp.set("search", search)
  const statuses = joinValues(f.paymentStatus, f.paymentStatuses)
  if (statuses) sp.set("paymentStatuses", statuses)
  const methods = joinValues(f.paymentMethod, f.paymentMethods)
  if (methods) sp.set("paymentMethods", methods)
  amountParams(sp, f.minAmount, f.maxAmount)
  dateRangeParams(sp, f.dateFrom, f.dateTo)
  sortParams(sp, f.sortBy, f.sortOrder, SALES_SORT_FIELDS)
  pagingParams(sp, f.page, f.limit)
  return sp.toString()
}

export function buildReturnsListQuery(f: ReturnsFilters): string {
  const sp = new URLSearchParams()
  if (f.status) sp.set("status", f.status)
  if (f.customerId) sp.set("customerId", f.customerId)
  if (f.saleId) sp.set("saleId", f.saleId)
  const search = f.search?.trim()
  if (search) sp.set("search", search)
  dateRangeParams(sp, f.dateFrom, f.dateTo)
  amountParams(sp, f.minAmount, f.maxAmount)
  if (f.branchId) sp.set("branchId", f.branchId)
  sortParams(sp, f.sortBy, f.sortOrder, RETURNS_SORT_FIELDS)
  pagingParams(sp, f.page, f.limit)
  return sp.toString()
}

export function buildRefundsListQuery(f: RefundsFilters): string {
  const sp = new URLSearchParams()
  if (f.status) sp.set("status", f.status)
  if (f.customerId) sp.set("customerId", f.customerId)
  if (f.saleId) sp.set("saleId", f.saleId)
  const search = f.search?.trim()
  if (search) sp.set("search", search)
  dateRangeParams(sp, f.dateFrom, f.dateTo)
  amountParams(sp, f.minAmount, f.maxAmount)
  if (f.branchId) sp.set("branchId", f.branchId)
  sortParams(sp, f.sortBy, f.sortOrder, REFUNDS_SORT_FIELDS)
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
  overrideCreditLimit?: boolean
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
    // Only sent when approved, so ordinary checkouts keep the same body (and idempotency fingerprint).
    ...(data.override_credit_limit ? { overrideCreditLimit: true } : {}),
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

export type InvoicePaperFormat = "thermal-58" | "thermal-80" | "a5"

export interface SalePrintResult {
  saleId: string
  /** Invoice number printed — issued by this print when the sale predates sequential numbering. */
  invoiceNumber?: string | null
  /** 1 = original; 2+ = "COPY OF ORIGINAL". */
  printNumber: number
  isCopy: boolean
  printedAtUtc: string
}

export interface RefundPrintResult {
  refundId: string
  /** 1 = original; 2+ = "COPY OF ORIGINAL". */
  printNumber: number
  isCopy: boolean
  printedAtUtc: string
}

/** Records a credit-note print (POST /sales/refunds/{id}/prints) and returns its print number. */
export async function recordRefundPrintOnDotnet(id: string, format: InvoicePaperFormat): Promise<RefundPrintResult> {
  return dotnetClient.post<RefundPrintResult>(`${SALES_LIST_PATH}/refunds/${id}/prints`, { refundId: id, format })
}

/** Records an invoice print (POST /sales/{id}/prints) and returns its print number for the copy marking. */
export async function recordSalePrintOnDotnet(id: string, format: InvoicePaperFormat): Promise<SalePrintResult> {
  return dotnetClient.post<SalePrintResult>(`${SALES_LIST_PATH}/${id}/prints`, { saleId: id, format })
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

export async function getReturnsStatsOnDotnet(branchId?: string): Promise<ReturnsStats> {
  const query = branchId ? `?branchId=${encodeURIComponent(branchId)}` : ""
  return toReturnsStats(await dotnetClient.get<DotnetReturnsStatsDto>(`${RETURNS_PATH}/stats${query}`))
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

export async function getRefundsStatsOnDotnet(branchId?: string): Promise<ReturnsStats> {
  const query = branchId ? `?branchId=${encodeURIComponent(branchId)}` : ""
  return toReturnsStats(await dotnetClient.get<DotnetReturnsStatsDto>(`${REFUNDS_PATH}/stats${query}`))
}

/** The create endpoint answers with the new id only, so the sale is read back to return the legacy shape. */
export async function createSaleOnDotnet(data: CreateSaleData, idempotencyKey: string): Promise<Sale> {
  const id = await dotnetClient.post<string>(SALES_LIST_PATH, toDotnetCreateSaleBody(data), idempotencyKey)
  return getSaleOnDotnet(id)
}

// ---------------------------------------------------------------------------
// Sale edit, cancel, delete; refund and return delete; sales summary
// ---------------------------------------------------------------------------

/** GET /api/v1/sales/summary (SalesSummaryDto, camelCase). Field names match the legacy stats aggregate. */
export interface SalesSummary {
  total: number
  totalRevenue: number
  todaySales: number
  todayRevenue: number
  pendingPayments: number
  completedPayments: number
  /** Cancelled sales, excluded from every total above. */
  cancelledCount: number
}

/** Local midnight expressed in UTC, so "today" follows the operator's timezone as the legacy server-local day did. */
export function startOfLocalDayUtc(now: Date = new Date()): string {
  const start = new Date(now)
  start.setHours(0, 0, 0, 0)
  return start.toISOString()
}

/**
 * Body for PUT /api/v1/sales/{id}. Only notes is editable on .NET. A payment status is refused here,
 * because the .NET sale derives its payment state from the balance due and has nothing to store.
 */
export function buildUpdateSaleBody(updates: UpdateSaleData): Record<string, unknown> {
  if (updates.payment_status !== undefined) {
    throw new Error("Payment status cannot be changed on the .NET API: a sale's payment state follows its balance due.")
  }
  const body: Record<string, unknown> = {}
  if (updates.notes !== undefined) body.notes = updates.notes
  return body
}

/** The update endpoint answers with the id only, so the sale is read back to return the legacy shape. */
export async function updateSaleOnDotnet(id: string, updates: UpdateSaleData): Promise<Sale> {
  await dotnetClient.put<string>(`${SALES_LIST_PATH}/${id}`, buildUpdateSaleBody(updates))
  return getSaleOnDotnet(id)
}

/** Cancels a completed sale (restores stock, voids the voucher). The server answers with the sale id. */
export async function cancelSaleOnDotnet(id: string, reason: string): Promise<string> {
  return dotnetClient.post<string>(`${SALES_LIST_PATH}/${id}/cancel`, { reason })
}

/** Sales are never deleted on .NET; the server answers 409 with the reason, which surfaces to the caller. */
export async function deleteSaleOnDotnet(id: string): Promise<void> {
  await dotnetClient.delete<string>(`${SALES_LIST_PATH}/${id}`)
}

// ---------------------------------------------------------------------------
// Customer open invoices (receivables tab): unpaid/partially-paid sales for one customer.
// ---------------------------------------------------------------------------

/** One unpaid/partially-paid sale for a customer ("open invoice"), oldest-first. */
export interface CustomerOpenInvoiceRow {
  sale_id: string
  sale_date: string
  /** The .NET side stores no invoice/sale number, so a stable display label is derived from the id. */
  invoice_number: string
  total_amount: number
  open_amount: number
}

export interface CustomerOpenInvoicesPage {
  items: CustomerOpenInvoiceRow[]
  pageNumber: number
  pageSize: number
  totalCount: number
  totalPages: number
}

export function customerOpenInvoicesQuery(customerId: string, page: number, pageSize: number, branchId?: string | null): string {
  const sp = new URLSearchParams()
  sp.set("customerId", customerId)
  sp.set("onlyWithBalanceDue", "true")
  if (branchId) sp.set("branchId", branchId)
  pagingParams(sp, page, pageSize)
  return `${SALES_LIST_PATH}?${sp.toString()}`
}

export function toCustomerOpenInvoiceRow(dto: DotnetSaleDto): CustomerOpenInvoiceRow {
  return {
    sale_id: dto.id,
    sale_date: dto.saleDateUtc,
    invoice_number: displayNumber("SALE", dto.id),
    total_amount: dto.totalAmount,
    open_amount: dto.balanceDue,
  }
}

/** GET /api/v1/sales?customerId=...&onlyWithBalanceDue=true (paged, oldest-first). */
export async function getCustomerOpenInvoicesOnDotnet(
  customerId: string,
  page = 1,
  pageSize = 20,
  branchId?: string | null
): Promise<CustomerOpenInvoicesPage> {
  const result = await dotnetClient.get<DotnetPagedList<DotnetSaleDto>>(
    customerOpenInvoicesQuery(customerId, page, pageSize, branchId)
  )
  return {
    items: result.items.map(toCustomerOpenInvoiceRow),
    pageNumber: result.pageNumber,
    pageSize: result.pageSize,
    totalCount: result.totalCount,
    totalPages: result.totalPages,
  }
}

export async function getSalesSummaryOnDotnet(now: Date = new Date()): Promise<SalesSummary> {
  const query = new URLSearchParams({ todayStartUtc: startOfLocalDayUtc(now) })
  return dotnetClient.get<SalesSummary>(`${SALES_BASE}/summary?${query.toString()}`)
}

/** Soft-deletes an unposted refund. The server answers 409 once the refund is posted to accounting. */
export async function deleteRefundOnDotnet(id: string): Promise<string> {
  return dotnetClient.delete<string>(`${REFUNDS_PATH}/${id}`)
}

/** Soft-deletes a return that has not restored stock. The server answers 409 once stock is restored. */
export async function deleteReturnOnDotnet(id: string): Promise<string> {
  return dotnetClient.delete<string>(`${RETURNS_PATH}/${id}`)
}
