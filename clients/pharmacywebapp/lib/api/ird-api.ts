/**
 * IRD calls on the .NET Sales module: sending a completed sale's invoice to the IRD queue, and the
 * queue health panel (/api/v1/sales/{id}/ird/send and /api/v1/sales/reports/ird-health).
 *
 * No real CBMS credentials are involved here. Dispatch happens in the backend worker via tenant config.
 */

import { dotnetClient } from "@/lib/api/dotnet-client"
import { nepalBoundUtc } from "@/lib/utils/nepal-time"

/** The legacy queue-health shape (SystemHealth.ird in system-diagnostics-service). */
export interface IrdFailedItem {
  id: string
  last_error: string | null
  created_at: string
}

export interface IrdQueueHealth {
  pendingCount: number
  failedCount: number
  salesFailedCount: number
  recentFailed: IrdFailedItem[]
}

export interface IrdSendResult {
  saleId: string
  invoiceNumber: string
}

/** IrdQueueHealthDto (Sales module, camelCase JSON). */
export interface DotnetIrdFailedItemDto {
  id: string
  lastError: string | null
  createdAtUtc: string
}

export interface DotnetIrdQueueHealthDto {
  pendingCount: number
  failedCount: number
  salesFailedCount: number
  recentFailed: DotnetIrdFailedItemDto[]
}

/** SendIrdInvoiceResponseDto. */
export interface DotnetSendIrdResponseDto {
  saleId: string
  queueItemId: string
  invoiceNumber: string
}

export function toIrdQueueHealth(dto: DotnetIrdQueueHealthDto): IrdQueueHealth {
  return {
    pendingCount: dto.pendingCount,
    failedCount: dto.failedCount,
    salesFailedCount: dto.salesFailedCount,
    recentFailed: dto.recentFailed.map((item) => ({
      id: item.id,
      last_error: item.lastError,
      created_at: item.createdAtUtc,
    })),
  }
}

export function toIrdSendResult(dto: DotnetSendIrdResponseDto): IrdSendResult {
  return { saleId: dto.saleId, invoiceNumber: dto.invoiceNumber }
}

/** Body for POST /api/v1/sales/{id}/ird/send. The endpoint takes the sale id from the route only. */
export function buildSendIrdBody(): Record<string, never> {
  return {}
}

export async function getIrdQueueHealth(): Promise<IrdQueueHealth> {
  return toIrdQueueHealth(await dotnetClient.get<DotnetIrdQueueHealthDto>("/api/v1/sales/reports/ird-health"))
}

export async function sendIrdInvoice(saleId: string): Promise<IrdSendResult> {
  const dto = await dotnetClient.post<DotnetSendIrdResponseDto>(
    `/api/v1/sales/${saleId}/ird/send`,
    buildSendIrdBody(),
    crypto.randomUUID(),
  )
  return toIrdSendResult(dto)
}

// ---------------------------------------------------------------------------
// IRD compliance registers (the legacy app/api/reports/ird?type=... route, now served by two .NET
// endpoints instead of one: sales-register/annex-13 from Sales, purchase-register/annex-14 from
// Purchasing). See GetIrdSalesRegisterQueryHandler / GetIrdPurchaseRegisterQueryHandler (backend) for the
// exact faithfulness gaps referenced below.
// ---------------------------------------------------------------------------

export type IrdReportType = "sales-register" | "purchase-register" | "annex-13" | "annex-14"

/** Row shape the IRD reports page renders/exports for sales-register and annex-13. */
export interface IrdSalesRegisterRow {
  id: string
  sale_number: string | null
  invoice_number: string
  sale_date: string
  total_amount: number
  tax_amount: number | null
  discount_amount: number
  /** VAT-exclusive value of the taxable lines (never includes exempt sales); null when VAT is unknown. */
  taxable_amount: number | null
  /** Value of VAT-exempt lines; null when VAT is unknown. taxable + VAT + exempt = total. */
  exempt_amount: number | null
  payment_method: string
  ird_status: string
  customer_id: string | null
  customer_name: string
  customer_phone: string
  customer_email: string
  /**
   * "sale" for the invoice itself (kept in its own period even if later cancelled); "cancellation",
   * "return" and "refund" are negative rows dated when the sale was cancelled / goods returned / money
   * refunded, so the register reconciles with the VAT return. Absent = "sale".
   */
  row_type?: IrdSalesRegisterRowType
  /** Credit-note number of a return/refund row; the cancelled invoice's number on a cancellation row. */
  document_number?: string | null
  /** Invoice a reversal row reverses. */
  original_invoice_number?: string | null
}

export type IrdSalesRegisterRowType = "sale" | "cancellation" | "return" | "refund"

/** Row shape the IRD reports page renders/exports for purchase-register and annex-14. */
export interface IrdPurchaseRegisterRow {
  id: string
  order_number: string
  purchase_number: string
  order_date: string
  status: string
  /** Gross bill amount (taxable + VAT). */
  total_amount: number
  /** VAT-bearing net value (lines that carried input VAT). */
  taxable_amount: number
  /** Net value of VAT-exempt lines (no input VAT). */
  exempt_amount: number
  /** Input VAT on the bill. */
  tax_amount: number
  supplier_name: string
  supplier_tax_invoice_numbers: string
  /** Which document the row comes from (see {@link IrdPurchaseRegisterSource}); absent from older API builds. */
  source?: IrdPurchaseRegisterSource
}

/** IrdSalesRegisterRowDto (Sales module, camelCase JSON). */
export interface DotnetIrdSalesRegisterRowDto {
  saleId: string
  invoiceNumber: string | null
  saleDateUtc: string
  totalAmount: number
  taxAmount: number | null
  discountAmount: number
  paymentMethod: string
  irdStatus: string
  customerId: string | null
  customerName: string
  customerPhone: string | null
  customerEmail: string | null
  /** VAT-exclusive taxable value; absent from older API builds. */
  taxableAmount?: number | null
  /** VAT-exempt value; absent from older API builds. */
  exemptAmount?: number | null
  /** Absent from older API builds = "sale". Reversal rows carry negative amounts. */
  rowType?: string | null
  documentNumber?: string | null
  originalInvoiceNumber?: string | null
}

/** Nepal's standard VAT rate — only used to back out a taxable value when an older API build sends none. */
const STANDARD_VAT_RATE = 0.13

/**
 * Taxable and exempt values of a sale row. Prefers the API's figures; for an older API build derives
 * taxable = VAT ÷ 13% and exempt = the remainder. Never total − VAT: that also counts exempt sales as taxable.
 */
export function salesVatBreakdown(
  dto: Pick<DotnetIrdSalesRegisterRowDto, "totalAmount" | "taxAmount" | "taxableAmount" | "exemptAmount">,
): { taxable: number | null; exempt: number | null } {
  if (dto.taxableAmount != null && dto.exemptAmount != null) return { taxable: dto.taxableAmount, exempt: dto.exemptAmount }
  if (dto.taxAmount == null) return { taxable: null, exempt: null }
  const taxable = dto.taxAmount === 0 ? 0 : Math.round((dto.taxAmount / STANDARD_VAT_RATE) * 100) / 100
  const remainder = Math.round((dto.totalAmount - taxable - dto.taxAmount) * 100) / 100
  // Reversal rows are negative: clamp towards zero on their side.
  const exempt = dto.totalAmount < 0 ? Math.min(0, remainder) : Math.max(0, remainder)
  return { taxable, exempt }
}

/** IrdPurchaseRegisterRowDto (Purchasing module, camelCase JSON). */
export interface DotnetIrdPurchaseRegisterRowDto {
  orderId: string
  orderDateUtc: string
  supplierId: string
  supplierName: string
  supplierInvoiceNumber: string | null
  /** Gross (net + VAT). */
  totalAmount: number
  status: string
  /** VAT-bearing net value; absent from older API builds (which sent the whole net here). */
  taxableAmount?: number
  vatAmount?: number
  /** Net value of VAT-exempt lines; absent from older API builds. */
  exemptAmount?: number
  /** Which document the row comes from; orderId is that document's id. */
  source?: IrdPurchaseRegisterSource
  /** The document's own number (PO, GRN or debit note); absent from older API builds and unnumbered documents. */
  documentNumber?: string | null
}

/**
 * - PurchaseOrder / DirectGoodsReceipt — a purchase (a direct receipt is a purchase without a PO). A voided
 *   direct receipt keeps this row in the period it was received in.
 * - DirectGoodsReceiptVoid — the reversal of a voided direct receipt, dated at the void (negative amounts).
 * - DebitNote — goods returned to the supplier (negative amounts).
 */
export type IrdPurchaseRegisterSource = "PurchaseOrder" | "DirectGoodsReceipt" | "DirectGoodsReceiptVoid" | "DebitNote"

function roundPaisa(n: number): number {
  return Math.round(n * 100) / 100
}

/**
 * Taxable and exempt net values of a purchase row. Prefers the API's split; for an older API build (which sent
 * the whole net as "taxable") derives taxable = VAT ÷ 13% and exempt = the remainder, so exempt purchases are
 * not counted as taxable. With no VAT figure at all, the net is all the register can show.
 */
export function purchaseVatBreakdown(
  dto: Pick<DotnetIrdPurchaseRegisterRowDto, "totalAmount" | "vatAmount" | "taxableAmount" | "exemptAmount">,
): { taxable: number; exempt: number } {
  if (dto.exemptAmount != null && dto.taxableAmount != null) return { taxable: dto.taxableAmount, exempt: dto.exemptAmount }
  const vat = dto.vatAmount ?? 0
  const net = dto.taxableAmount ?? roundPaisa(dto.totalAmount - vat)
  if (dto.vatAmount == null) return { taxable: net, exempt: 0 }
  if (vat === 0) return { taxable: 0, exempt: net }
  const taxable = roundPaisa(vat / STANDARD_VAT_RATE)
  // Rounding can push the derived taxable a paisa past the net; never report an opposite-sign exempt.
  const exempt = roundPaisa(net - taxable)
  return exempt === 0 || Math.sign(exempt) === Math.sign(net) ? { taxable, exempt } : { taxable: net, exempt: 0 }
}

function toRowType(value: string | null | undefined): IrdSalesRegisterRowType {
  const v = (value ?? "").toLowerCase()
  return v === "cancellation" || v === "return" || v === "refund" ? v : "sale"
}

/**
 * Shared mapping for both sales-register and annex-13 (same backend rows, the page just prefers a
 * different column order per type). <c>sale_number</c> is always "" — the ported Sale entity has no
 * internal receipt number, only the IRD invoice number (see the backend DTO's faithfulness-gap note).
 * <c>taxable_amount</c>/<c>exempt_amount</c> come from {@link salesVatBreakdown} and are null whenever
 * tax_amount is null, rather than inventing a taxable base from an unknown tax figure.
 */
export function toIrdSalesRegisterRow(dto: DotnetIrdSalesRegisterRowDto): IrdSalesRegisterRow {
  const { taxable, exempt } = salesVatBreakdown(dto)
  const rowType = toRowType(dto.rowType)
  return {
    // A sale can have several rows (the sale, then its returns/refunds/cancellation): keep ids unique.
    id: rowType === "sale" ? dto.saleId : `${dto.saleId}:${rowType}:${dto.documentNumber ?? dto.saleDateUtc}`,
    sale_number: null,
    invoice_number: dto.invoiceNumber ?? "",
    row_type: rowType,
    document_number: dto.documentNumber ?? null,
    original_invoice_number: dto.originalInvoiceNumber ?? (rowType === "sale" ? null : dto.invoiceNumber ?? null),
    sale_date: dto.saleDateUtc,
    total_amount: dto.totalAmount,
    tax_amount: dto.taxAmount,
    discount_amount: dto.discountAmount,
    taxable_amount: taxable,
    exempt_amount: exempt,
    payment_method: dto.paymentMethod,
    ird_status: dto.irdStatus,
    customer_id: dto.customerId,
    customer_name: dto.customerName,
    customer_phone: dto.customerPhone ?? "",
    customer_email: dto.customerEmail ?? "",
  }
}

/**
 * Shared mapping for both purchase-register and annex-14. <c>order_number</c>/<c>purchase_number</c> are the
 * document's own number (PO, GRN or debit note); the id only for documents raised before numbering.
 * <c>supplier_tax_invoice_numbers</c> is the order's single captured supplier invoice number (the legacy
 * route aggregated one per goods receipt; this schema has one per order).
 */
export function toIrdPurchaseRegisterRow(dto: DotnetIrdPurchaseRegisterRowDto): IrdPurchaseRegisterRow {
  const { taxable, exempt } = purchaseVatBreakdown(dto)
  return {
    id: dto.orderId,
    order_number: dto.documentNumber || dto.orderId,
    purchase_number: dto.documentNumber || dto.orderId,
    order_date: dto.orderDateUtc,
    status: dto.status,
    total_amount: dto.totalAmount,
    taxable_amount: taxable,
    exempt_amount: exempt,
    tax_amount: dto.vatAmount ?? 0,
    supplier_name: dto.supplierName,
    supplier_tax_invoice_numbers: dto.supplierInvoiceNumber ?? "",
    ...(dto.source ? { source: dto.source } : {}),
  }
}

/** GET /api/v1/sales/reports/ird-sales-register — serves sales-register and annex-13. */
export async function getIrdSalesRegister(periodStart: string, periodEnd: string, branchId?: string): Promise<IrdSalesRegisterRow[]> {
  const params = new URLSearchParams({
    periodStartUtc: nepalBoundUtc(periodStart),
    periodEndUtc: nepalBoundUtc(periodEnd, true),
  })
  if (branchId) params.set("branchId", branchId)
  const rows = await dotnetClient.get<DotnetIrdSalesRegisterRowDto[]>(
    `/api/v1/sales/reports/ird-sales-register?${params.toString()}`,
  )
  return rows.map(toIrdSalesRegisterRow)
}

/** GET /api/v1/purchasing/reports/ird-purchase-register — serves purchase-register and annex-14. */
export async function getIrdPurchaseRegister(periodStart: string, periodEnd: string, branchId?: string): Promise<IrdPurchaseRegisterRow[]> {
  const params = new URLSearchParams({
    periodStartUtc: nepalBoundUtc(periodStart),
    periodEndUtc: nepalBoundUtc(periodEnd, true),
  })
  if (branchId) params.set("branchId", branchId)
  const rows = await dotnetClient.get<DotnetIrdPurchaseRegisterRowDto[]>(
    `/api/v1/purchasing/reports/ird-purchase-register?${params.toString()}`,
  )
  return rows.map(toIrdPurchaseRegisterRow)
}

/** Dispatches to the right .NET endpoint for the given IRD report type. */
export async function getIrdReportRows(
  type: IrdReportType,
  periodStart: string,
  periodEnd: string,
  branchId?: string,
): Promise<IrdSalesRegisterRow[] | IrdPurchaseRegisterRow[]> {
  if (type === "sales-register" || type === "annex-13") {
    return getIrdSalesRegister(periodStart, periodEnd, branchId)
  }
  return getIrdPurchaseRegister(periodStart, periodEnd, branchId)
}

// ---------------------------------------------------------------------------
// IRD CBMS e-billing: tenant settings, resend, bill register (IRD materialized view), abbreviated invoices.
// Bills and credit notes are queued for CBMS automatically by the backend when a sale completes or is
// returned/refunded/cancelled — the UI never has to call sendIrdInvoice for new sales.
// ---------------------------------------------------------------------------

/** IrdSettingsDto. The CBMS password is write-only (hasPassword). */
export interface IrdSettings {
  enabled: boolean
  baseUrl: string | null
  effectiveBaseUrl: string
  isTestEndpoint: boolean
  username: string | null
  hasPassword: boolean
  sellerPan: string | null
  abbreviatedInvoiceThreshold: number
  realtimeWindowSeconds: number
}

/** UpdateIrdSettingsCommand. An empty password keeps the stored one. */
export interface IrdSettingsInput {
  enabled: boolean
  baseUrl: string | null
  username: string | null
  password: string | null
  sellerPan: string | null
  abbreviatedInvoiceThreshold: number
}

/** IRD's default limit for an Abbreviated Tax Invoice without a buyer PAN (NPR). */
export const DEFAULT_ABBREVIATED_INVOICE_THRESHOLD = 10_000

export async function getIrdSettings(): Promise<IrdSettings> {
  return dotnetClient.get<IrdSettings>("/api/v1/sales/ird/settings")
}

export async function updateIrdSettings(input: IrdSettingsInput): Promise<IrdSettings> {
  return dotnetClient.put<IrdSettings>("/api/v1/sales/ird/settings", input)
}

/** IrdResendResultDto. */
export interface IrdResendResult {
  queueItemId: string
  saleId: string
  documentType: string
  status: string
}

/** POST /api/v1/sales/ird/queue/{id}/resend — only a Failed row can be resent. */
export async function resendIrdQueueItem(queueItemId: string): Promise<IrdResendResult> {
  return dotnetClient.post<IrdResendResult>(
    `/api/v1/sales/ird/queue/${encodeURIComponent(queueItemId)}/resend`,
    {},
    crypto.randomUUID(),
  )
}

export type IrdInvoiceType = "tax_invoice" | "abbreviated_tax_invoice"

/** IrdBillRegisterRowDto — one bill in IRD's materialized view. */
export interface IrdBillRegisterRow {
  saleId: string
  fiscalYear: string
  billNo: string
  customerName: string
  customerPan: string | null
  /** BS yyyy.mm.dd */
  billDate: string
  billDateUtc: string
  amount: number
  discount: number
  taxableAmount: number
  taxAmount: number
  exemptAmount: number
  totalAmount: number
  syncWithIrd: boolean
  isBillPrinted: boolean
  isBillActive: boolean
  printedTimeUtc: string | null
  enteredBy: string | null
  printedBy: string | null
  isRealtime: boolean | null
  paymentMethod: string
  vatRefundAmount: number
  transactionId: string | null
  printCount: number
  irdStatus: string
  invoiceType: string
}

export interface IrdBillRegisterFilter {
  /** BS start year, e.g. 2083 for FY 2083/84. */
  fiscalYear?: number
  /** Nepal calendar dates (yyyy-mm-dd), inclusive. */
  from?: string
  to?: string
  branchId?: string
}

export function buildIrdBillRegisterQuery(filter: IrdBillRegisterFilter): string {
  const params = new URLSearchParams()
  if (filter.fiscalYear) params.set("fiscalYear", String(filter.fiscalYear))
  if (filter.from) params.set("fromUtc", nepalBoundUtc(filter.from))
  if (filter.to) params.set("toUtc", nepalBoundUtc(filter.to, true))
  if (filter.branchId) params.set("branchId", filter.branchId)
  return params.toString()
}

/** GET /api/v1/sales/reports/ird-bill-register */
export async function getIrdBillRegister(filter: IrdBillRegisterFilter): Promise<IrdBillRegisterRow[]> {
  return dotnetClient.get<IrdBillRegisterRow[]>(`/api/v1/sales/reports/ird-bill-register?${buildIrdBillRegisterQuery(filter)}`)
}

/**
 * IRD rule: without a buyer PAN a sale up to (and including) the threshold may be issued as an Abbreviated Tax
 * Invoice; with a PAN, or above the threshold, it is a full Tax Invoice. Mirrors IrdInvoiceTypes.For (backend).
 */
export function irdInvoiceType(total: number, buyerPan: string | null | undefined, threshold: number): IrdInvoiceType {
  return !buyerPan?.trim() && total <= threshold ? "abbreviated_tax_invoice" : "tax_invoice"
}

/** Nepal PAN / VAT numbers are 9 digits. */
export function isValidPan(pan: string | null | undefined): boolean {
  return /^\d{9}$/.test((pan ?? "").trim())
}

/**
 * What the POS should tell the cashier about the buyer's details for a bill of `total`:
 * - an invalid PAN is an error (the server rejects it);
 * - above the threshold IRD expects the buyer's name (and PAN when registered) on a full Tax Invoice — a warning,
 *   not a block (the backend accepts the sale; see CreateSaleCommand).
 */
export function buyerDetailsIssue(
  total: number,
  buyerName: string | null | undefined,
  buyerPan: string | null | undefined,
  threshold: number,
): { level: "error" | "warning"; message: string } | null {
  if (buyerPan?.trim() && !isValidPan(buyerPan)) return { level: "error", message: "Buyer PAN must be 9 digits." }
  if (total > threshold && !buyerName?.trim()) {
    return {
      level: "warning",
      message: `Bills above NPR ${threshold.toLocaleString("en-IN")} need the buyer's name (and PAN if VAT-registered) on a full Tax Invoice.`,
    }
  }
  return null
}

type CsvValue = string | number | boolean | null

const BILL_REGISTER_COLUMNS: [header: string, value: (row: IrdBillRegisterRow) => CsvValue][] = [
  ["Fiscal_Year", (r) => r.fiscalYear],
  ["Bill_No", (r) => r.billNo],
  ["Customer_Name", (r) => r.customerName],
  ["Customer_PAN", (r) => r.customerPan],
  ["Bill_Date", (r) => r.billDate],
  ["Amount", (r) => r.amount.toFixed(2)],
  ["Discount", (r) => r.discount.toFixed(2)],
  ["Taxable_Amount", (r) => r.taxableAmount.toFixed(2)],
  ["Tax_Amount", (r) => r.taxAmount.toFixed(2)],
  ["Total_Amount", (r) => r.totalAmount.toFixed(2)],
  ["Sync_with_IRD", (r) => r.syncWithIrd],
  ["Is_Bill_Printed", (r) => r.isBillPrinted],
  ["Is_Bill_Active", (r) => r.isBillActive],
  ["Printed_Time", (r) => r.printedTimeUtc],
  ["Entered_By", (r) => r.enteredBy],
  ["Printed_By", (r) => r.printedBy],
  ["Is_Realtime", (r) => r.isRealtime],
  ["Payment_Method", (r) => r.paymentMethod],
  ["VAT_Refund_Amount", (r) => r.vatRefundAmount.toFixed(2)],
  ["Transaction_Id", (r) => r.transactionId],
]

export const IRD_BILL_REGISTER_HEADERS = BILL_REGISTER_COLUMNS.map(([header]) => header)

function exportCell(value: CsvValue): string {
  if (value === null) return ""
  const text = typeof value === "boolean" ? (value ? "Yes" : "No") : String(value)
  // Neutralise spreadsheet formula injection in free-text cells (numbers like -5.00 stay as they are).
  return /^[=+\-@]/.test(text) && Number.isNaN(Number(text)) ? `'${text}` : text
}

/** The IRD materialized view's CSV cells, in IRD's column order (headers: IRD_BILL_REGISTER_HEADERS). */
export function irdBillRegisterCsvRows(rows: IrdBillRegisterRow[]): string[][] {
  return rows.map((row) => BILL_REGISTER_COLUMNS.map(([, value]) => exportCell(value(row))))
}
