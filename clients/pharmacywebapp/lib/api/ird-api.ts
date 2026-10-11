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
}

/** Row shape the IRD reports page renders/exports for purchase-register and annex-14. */
export interface IrdPurchaseRegisterRow {
  id: string
  order_number: string
  purchase_number: string
  order_date: string
  status: string
  /** Gross bill amount (taxable + VAT). */
  total_amount: number
  /** Net value before VAT. */
  taxable_amount: number
  /** Input VAT on the bill. */
  tax_amount: number
  supplier_name: string
  supplier_tax_invoice_numbers: string
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
  const exempt = Math.max(0, Math.round((dto.totalAmount - taxable - dto.taxAmount) * 100) / 100)
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
  /** Net value before VAT; absent from older API builds. */
  taxableAmount?: number
  vatAmount?: number
  /** "PurchaseOrder" or "DirectGoodsReceipt" (a purchase without a PO; orderId is then the receipt id). */
  source?: "PurchaseOrder" | "DirectGoodsReceipt"
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
  return {
    id: dto.saleId,
    sale_number: null,
    invoice_number: dto.invoiceNumber ?? "",
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
 * Shared mapping for both purchase-register and annex-14. <c>order_number</c>/<c>purchase_number</c>
 * surface the order's id — the ported PurchaseOrder entity has no separate internal PO number (see the
 * backend DTO's faithfulness-gap note) — rather than inventing one.
 * <c>supplier_tax_invoice_numbers</c> is the order's single captured supplier invoice number (the legacy
 * route aggregated one per goods receipt; this schema has one per order).
 */
export function toIrdPurchaseRegisterRow(dto: DotnetIrdPurchaseRegisterRowDto): IrdPurchaseRegisterRow {
  return {
    id: dto.orderId,
    order_number: dto.orderId,
    purchase_number: dto.orderId,
    order_date: dto.orderDateUtc,
    status: dto.status,
    total_amount: dto.totalAmount,
    taxable_amount: dto.taxableAmount ?? dto.totalAmount - (dto.vatAmount ?? 0),
    tax_amount: dto.vatAmount ?? 0,
    supplier_name: dto.supplierName,
    supplier_tax_invoice_numbers: dto.supplierInvoiceNumber ?? "",
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
