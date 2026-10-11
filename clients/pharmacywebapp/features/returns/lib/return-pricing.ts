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

/** Amount for returning/refunding `qty` units of the line. The whole line returns its exact total. */
export function returnLineAmount(line: SoldLine, qty: number): number {
  if (!line.quantity || qty <= 0) return 0
  const total = toNumber(line.lineTotal)
  if (qty >= line.quantity) return roundMoneyAwayFromZero(total)
  return roundMoneyAwayFromZero((total * qty) / line.quantity)
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
