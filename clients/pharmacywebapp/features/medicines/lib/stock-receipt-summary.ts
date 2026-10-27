/**
 * The "what was just received" summary shown after Add medicine or Bulk import saves stock (pure). Those flows post
 * the stock and the supplier bill without a Purchasing receipt record, so the summary is built from the lines the
 * server accepted: the same quantity × cost + VAT the bill payable was posted with (see `billTotal`).
 */

import { PARTY_PAYMENT_METHODS } from "@/features/accounting/lib/payment-methods"
import { STOCK_FUNDING_OPTIONS } from "@/features/medicines/lib/stock-funding"

export interface ReceivedStockLine {
  medicineName: string
  batchNumber: string | null
  expiryDate: string | null
  /** Base units (tablets) put into stock. */
  quantity: number
  /** Cost per base unit, before VAT. */
  unitCost: number
  sellingPrice: number
  vat: number
  /** True when the row topped up a medicine that already existed instead of creating one. */
  addedToExisting?: boolean
}

export interface ReceivedStockBill {
  /** Null for opening stock that came without a supplier bill. */
  supplierName: string | null
  invoiceNumber: string | null
  /** yyyy-MM-dd. */
  receiptDate: string
  /** "credit", "paid", or for supplier-less stock how it was funded ("opening stock", "cash", "bank"). */
  paymentNote: string | null
  lines: ReceivedStockLine[]
}

export interface ReceivedStockTotals {
  lineCount: number
  quantity: number
  /** Σ quantity × unit cost. */
  goods: number
  vat: number
  total: number
}

const money = (n: number) => Math.round(n * 100) / 100

export function lineValue(line: Pick<ReceivedStockLine, "quantity" | "unitCost">): number {
  return money((Number(line.quantity) || 0) * (Number(line.unitCost) || 0))
}

export function receivedStockTotals(lines: readonly ReceivedStockLine[]): ReceivedStockTotals {
  const goods = money(lines.reduce((sum, l) => sum + lineValue(l), 0))
  const vat = money(lines.reduce((sum, l) => sum + (Number(l.vat) || 0), 0))
  return {
    lineCount: lines.length,
    quantity: lines.reduce((sum, l) => sum + (Number(l.quantity) || 0), 0),
    goods,
    vat,
    total: money(goods + vat),
  }
}

/** Only lines that actually received stock; a row that just created the medicine card has nothing to show. */
export function receivedBills(bills: readonly ReceivedStockBill[]): ReceivedStockBill[] {
  return bills
    .map((bill) => ({ ...bill, lines: bill.lines.filter((l) => l.quantity > 0) }))
    .filter((bill) => bill.lines.length > 0)
}

/** "On credit" / "Paid · Bank transfer" for a supplier bill's paid-now choice. */
export function supplierPaymentNote(payment: { paid: boolean; method: string }): string {
  if (!payment.paid) return "On credit"
  const method = PARTY_PAYMENT_METHODS.find((m) => m.value === payment.method)?.label ?? payment.method
  return `Paid · ${method}`
}

/** "Opening stock" / "Cash" / "Bank" for stock entered without a supplier; null when not chosen. */
export function stockFundingNote(funding: string): string | null {
  return STOCK_FUNDING_OPTIONS.find((o) => o.value === funding)?.label ?? null
}
