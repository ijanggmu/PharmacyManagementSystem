/**
 * POS line pricing that mirrors the .NET server exactly, so the cart total the cashier collects is the
 * total the server computes (the server requires the payment legs to match it to the paisa).
 *
 * - Unit price (CreateSaleCommandHandler): the first FEFO-eligible lot at the current branch with a
 *   selling price above zero, else the medicine's catalog unit price.
 * - Line total (SaleItem.Create): gross = qty × unit price; discount = round2(gross × pct / 100)
 *   (half away from zero); line total = gross − discount.
 */

import type { FefoPick } from "@/lib/inventory/fefo"
import { roundMoneyAwayFromZero } from "@/features/sales/lib/vat"

export interface PricedMedicine {
  unit_price: string | number
  fefo_picks?: Pick<FefoPick, "selling_price">[]
}

/** The unit price the server will charge for this medicine. */
export function posUnitPrice(medicine: PricedMedicine): number {
  const lotPrice = Number(medicine.fefo_picks?.[0]?.selling_price ?? 0)
  if (Number.isFinite(lotPrice) && lotPrice > 0) return lotPrice
  const catalog = typeof medicine.unit_price === "number" ? medicine.unit_price : Number.parseFloat(medicine.unit_price)
  return Number.isFinite(catalog) ? catalog : 0
}

/** Line total after its percent discount, rounded like the server (2 dp). */
export function posLineTotal(quantity: number, unitPrice: number, discountPercent = 0): number {
  const gross = roundMoneyAwayFromZero(quantity * unitPrice)
  const pct = Math.max(0, Math.min(100, discountPercent || 0))
  const discount = roundMoneyAwayFromZero((gross * pct) / 100)
  return roundMoneyAwayFromZero(gross - discount)
}

/** Sum of line totals in paisa (no floating drift), back in rupees. */
export function posSubtotal(lines: { totalPrice: number }[]): number {
  const paisa = lines.reduce((sum, line) => sum + Math.round(roundMoneyAwayFromZero(line.totalPrice) * 100), 0)
  return paisa / 100
}

/** Bill total after the order-level discount (itself rounded to paisa), as the server computes it. */
export function posTotal(subtotal: number, orderDiscount: number): number {
  return roundMoneyAwayFromZero(subtotal - roundMoneyAwayFromZero(Math.max(0, orderDiscount)))
}
