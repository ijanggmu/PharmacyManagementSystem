/**
 * VAT shown at checkout. It mirrors the .NET server (SaleItem.Create + Sale.ApplyVat) so the cart's
 * estimate matches the VAT printed on the invoice:
 *
 * - Prices are VAT-inclusive: VAT is carved out of the total, never added on top.
 * - A line's total is gross (qty × unit price) minus its discount: the percent part rounded to 2 dp,
 *   plus its share of the order discount (split the same way the checkout payload splits it).
 * - Only taxable lines carry VAT: VAT = taxable lines' total × rate / (100 + rate), rounded half
 *   away from zero to 2 dp. Exempt lines (medicine is_taxable === false) carry none.
 */

import { allocateOrderDiscount } from "@/lib/api/sales-api"

export interface VatCartLine {
  quantity: number
  unitPrice: number
  /** Line total after `discountPercent`, as the cart holds it (used to split the order discount). */
  totalPrice: number
  /** Per-line discount, 0-100. */
  discountPercent?: number
  /** From the medicine's is_taxable flag. Only `false` makes a line exempt. */
  isTaxable?: boolean
}

/** Rounds to 2 dp, half away from zero, like .NET Math.Round(x, 2, MidpointRounding.AwayFromZero). */
export function roundMoneyAwayFromZero(value: number): number {
  if (!Number.isFinite(value)) return 0
  // toPrecision(15) drops binary noise first (1.005 * 100 is 100.49999999999999 in floating point).
  const scaled = Number((Math.abs(value) * 100).toPrecision(15))
  const rounded = Math.round(scaled) / 100
  return value < 0 ? -rounded : rounded
}

/** Integer paisa (cents) for a money amount, so sums don't pick up floating point error. */
function toPaisa(value: number): number {
  return Math.round(roundMoneyAwayFromZero(value) * 100)
}

/** Each line's total in paisa after its percent discount and its share of the order discount. */
function lineTotalsInPaisa(lines: VatCartLine[], orderDiscount: number): number[] {
  const shares = allocateOrderDiscount(
    lines.map((line) => Number(line.totalPrice.toFixed(2))),
    orderDiscount,
  )
  return lines.map((line, index) => {
    const gross = toPaisa(line.quantity * line.unitPrice)
    const percentDiscount = toPaisa(((gross / 100) * (line.discountPercent ?? 0)) / 100)
    return gross - percentDiscount - toPaisa(shares[index] ?? 0)
  })
}

/**
 * VAT included in the order, given the tenant's VAT rate as a percent (e.g. 13) and the order-level
 * discount in money. Returns 0 for a zero or invalid rate.
 */
export function computeInclusiveVat(lines: VatCartLine[], vatRatePercent: number, orderDiscount = 0): number {
  if (!Number.isFinite(vatRatePercent) || vatRatePercent <= 0 || lines.length === 0) return 0
  const totals = lineTotalsInPaisa(lines, Math.max(0, orderDiscount))
  const taxablePaisa = lines.reduce((sum, line, index) => (line.isTaxable === false ? sum : sum + totals[index]), 0)
  if (taxablePaisa <= 0) return 0
  return roundMoneyAwayFromZero((taxablePaisa / 100) * vatRatePercent / (100 + vatRatePercent))
}

/** "13%" or "13.5%" — the rate as an admin typed it, without trailing zeros. */
export function formatVatRate(vatRatePercent: number): string {
  return `${Number(vatRatePercent.toFixed(2))}%`
}
