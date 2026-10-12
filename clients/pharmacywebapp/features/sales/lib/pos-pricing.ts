/**
 * POS line pricing that mirrors the .NET server exactly, so the cart total the cashier collects is the
 * total the server computes (the server requires the payment legs to match it to the paisa).
 *
 * - Unit price (CreateSaleCommandHandler): the batch is the only selling price. The units are taken from
 *   the FEFO-eligible lots at the current branch in order, and each lot's units sell at that lot's price
 *   (the server records one sale line per lot). A lot with no price (0) blocks the sale.
 * - Line total (SaleItem.Create), per lot: gross = qty × lot price; discount = round2(gross × pct / 100)
 *   (half away from zero); lot total = gross − discount. The cart line's total is the sum over its lots.
 */

import type { FefoPick } from "@/lib/inventory/fefo"
import { roundMoneyAwayFromZero } from "@/features/sales/lib/vat"

export interface PricedMedicine {
  unit_price: string | number
  fefo_picks?: Pick<FefoPick, "selling_price">[]
}

/** The price the next unit of this medicine sells at: its first sellable lot's price (the catalog price
 *  only stands in for a medicine with no lot on file, for display). */
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

export interface LotPricedLine {
  /** Average price over the units (gross / quantity), so quantity × unitPrice is the line's gross. */
  unitPrice: number
  /** Line total after its percent discount, summed lot by lot as the server does. */
  totalPrice: number
  /** True when the units come from lots with different prices. */
  mixedPrices: boolean
  /** Batch number of a lot the units come from that has no selling price (the server refuses the sale). */
  unpricedBatch: string | null
}

/**
 * Prices `quantity` units of a cart line across its FEFO lots, in order, each at its own price. Units beyond
 * the lots on file (or a medicine without lots) are priced at `catalogPrice`; the server will refuse a sale
 * it can't draw from stock anyway.
 */
export function posPriceLine(
  picks: Pick<FefoPick, "batch_number" | "quantity_remaining" | "selling_price">[],
  catalogPrice: number,
  quantity: number,
  discountPercent = 0,
): LotPricedLine {
  let remaining = Math.max(0, quantity)
  let grossTotal = 0
  let paisa = 0
  const prices = new Set<number>()
  let unpricedBatch: string | null = null

  const take = (units: number, price: number) => {
    grossTotal += units * price
    paisa += Math.round(posLineTotal(units, price, discountPercent) * 100)
    prices.add(price)
  }

  for (const pick of picks) {
    if (remaining <= 0) break
    const units = Math.min(remaining, Math.max(0, pick.quantity_remaining))
    if (units <= 0) continue
    const price = Number(pick.selling_price ?? 0)
    if (!(Number.isFinite(price) && price > 0)) {
      unpricedBatch ??= pick.batch_number
      remaining -= units
      continue
    }
    take(units, price)
    remaining -= units
  }
  if (remaining > 0) take(remaining, catalogPrice)

  return {
    unitPrice: quantity > 0 ? grossTotal / quantity : catalogPrice,
    totalPrice: paisa / 100,
    mixedPrices: prices.size > 1,
    unpricedBatch,
  }
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
