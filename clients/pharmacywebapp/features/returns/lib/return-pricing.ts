/**
 * Customer return / refund amounts, mirroring the .NET server:
 *
 * - A returned or refunded line is priced at the sale line's EFFECTIVE price — its line total (already
 *   net of every line discount, including the order discount and loyalty redemption spread onto lines)
 *   pro rata to the quantity: round2(lineTotal × qty / soldQty). Never qty × list unit price.
 * - Prices are VAT-inclusive, so VAT is never added on top. The VAT included in the refund is
 *   informational: taxable lines' amount × rate / (100 + rate), rounded half away from zero.
 */

import { roundMoneyAwayFromZero } from "@/features/sales/lib/vat"

export interface SoldLine {
  /** Quantity sold on the sale line. */
  quantity: number
  /** The sale line's total after discounts (SaleItem.LineTotal / legacy total_price). */
  lineTotal: number | string
}

function toNumber(value: number | string | null | undefined): number {
  const n = typeof value === "number" ? value : Number.parseFloat(value ?? "")
  return Number.isFinite(n) ? n : 0
}

/** What one unit actually sold for (display only). */
export function effectiveUnitPrice(line: SoldLine): number {
  if (!line.quantity) return 0
  return roundMoneyAwayFromZero(toNumber(line.lineTotal) / line.quantity)
}

/** What earlier (non-rejected) returns and refunds already took from a sale line. */
export interface AlreadyReversed {
  quantity: number
  /** Money already given back for those units; estimated pro rata when unknown. */
  amount?: number
}

/**
 * Amount for returning/refunding `qty` more units of the line, after what earlier returns/refunds took
 * (`already`). Mirrors SaleItem.ReversalAmount: each portion is the line total pro rata, rounded to the
 * paisa, and the portion that brings the line to zero takes exactly what is left, so the pieces add up to
 * the line total.
 */
export function returnLineAmount(line: SoldLine, qty: number, already?: AlreadyReversed): number {
  if (!line.quantity || qty <= 0) return 0
  const total = roundMoneyAwayFromZero(toNumber(line.lineTotal))
  const alreadyQty = Math.max(0, already?.quantity ?? 0)
  if (alreadyQty + qty >= line.quantity) {
    const alreadyAmount = already?.amount ?? (alreadyQty > 0 ? roundMoneyAwayFromZero((total * alreadyQty) / line.quantity) : 0)
    return Math.max(0, roundMoneyAwayFromZero(total - alreadyAmount))
  }
  return roundMoneyAwayFromZero((total * qty) / line.quantity)
}

/** Units of a sale line that can still be returned or refunded (sold − already returned − already refunded). */
export function remainingReversibleQuantity(line: {
  quantity: number
  returned_quantity?: number
  refunded_quantity?: number
}): number {
  return Math.max(0, line.quantity - (line.returned_quantity ?? 0) - (line.refunded_quantity ?? 0))
}

/** Units of the line already returned or refunded. */
export function alreadyReversedQuantity(line: { returned_quantity?: number; refunded_quantity?: number }): number {
  return Math.max(0, (line.returned_quantity ?? 0) + (line.refunded_quantity ?? 0))
}

/** VAT included in the refunded lines; null when the sale has no stored VAT rate. */
export function includedVat(
  lines: { amount: number; isTaxable?: boolean }[],
  vatRatePercent: number | null | undefined,
): number | null {
  if (vatRatePercent === null || vatRatePercent === undefined || !Number.isFinite(vatRatePercent)) return null
  if (vatRatePercent <= 0) return 0
  const taxable = lines.reduce((sum, line) => (line.isTaxable === false ? sum : sum + line.amount), 0)
  if (taxable <= 0) return 0
  return roundMoneyAwayFromZero((taxable * vatRatePercent) / (100 + vatRatePercent))
}

/** Net refund paid out: the items' amount less the processing fee, never below zero. */
export function netRefundAmount(itemsTotal: number, processingFee: number): number {
  return Math.max(0, roundMoneyAwayFromZero(itemsTotal - Math.max(0, processingFee || 0)))
}
