/**
 * Goods-receipt helpers (pure). Purchase lines are stored in base units (tablets), but a delivery is checked against
 * boxes and strips, so quantities read "300 tablets (3 boxes)"; and a batch's shelf price starts from the medicine's
 * current selling price when the order didn't set one.
 */

import { formatStockInUnits, formatUnitCount, resolveSaleUnits, type PackSizedMedicine } from "@/features/sales/lib/sale-units"

/** "300 tablets (3 boxes)", "35 tablets (3 strips + 5)", or just "12 tablets" / "12" when there is nothing to break down. */
export function formatReceiptQuantity(baseQuantity: number, medicine: PackSizedMedicine | null | undefined): string {
  if (!medicine) return baseQuantity.toLocaleString("en-US", { maximumFractionDigits: 3 })
  const units = resolveSaleUnits(medicine)
  if (!units) {
    const label = medicine.unit_label?.trim()
    return label ? formatUnitCount(baseQuantity, label.toLowerCase()) : baseQuantity.toLocaleString("en-US", { maximumFractionDigits: 3 })
  }
  const [total, breakdown] = formatStockInUnits(baseQuantity, units).split(" = ")
  return breakdown ? `${total} (${breakdown})` : total
}

/**
 * The selling price a receipt line starts with: the price already on the order line, else the medicine's catalog
 * price, else the latest lot's selling price. Blank when none is known (the field stays required).
 */
export function initialReceiptSellingPrice(
  orderLinePrice: number | null | undefined,
  catalogPrice: string | number | null | undefined,
  latestLotPrice?: number | null,
): string {
  if (orderLinePrice != null && orderLinePrice > 0) return String(orderLinePrice)
  const catalog = Number(catalogPrice)
  if (Number.isFinite(catalog) && catalog > 0) return catalog.toFixed(2)
  return latestLotPrice != null && latestLotPrice > 0 ? latestLotPrice.toFixed(2) : ""
}

/** The rate an order line was ordered at, as the receipt shows it: per pack for a pack line, else per unit. */
export function orderedRateText(item: { unit_cost: string; pack_unit_cost: number | null }): string {
  return String(item.pack_unit_cost ?? Number(item.unit_cost))
}

/**
 * The rate to send for a receipt line: null while it still reads as ordered (the server keeps the order's rate,
 * discount and VAT exactly), else the typed rate. Blank also keeps the ordered rate.
 */
export function receiptRateToSend(typed: string | undefined, ordered: string): number | null {
  const text = (typed ?? "").trim()
  if (text === "" || text === ordered) return null
  const rate = Number(text)
  if (!Number.isFinite(rate) || rate < 0) throw new Error("Enter a rate of zero or more.")
  return Number(ordered) === rate ? null : rate
}

/** Free goods that come with a short delivery unless typed otherwise: in proportion, rounded down (as the server does). */
export function proportionalFreeQuantity(orderedQuantity: number, orderedFree: number, receivedQuantity: number): number {
  if (orderedFree <= 0 || orderedQuantity <= 0 || receivedQuantity <= 0) return 0
  if (receivedQuantity >= orderedQuantity) return orderedFree
  return Math.floor((orderedFree * receivedQuantity) / orderedQuantity)
}

/** Quantity × rate for a receipt line before discounts (packs × pack rate for a pack line), rounded to paisa. */
export function receiptLineGross(quantity: number, rate: number, packSize: number | null): number {
  const packs = packSize && packSize > 0 ? quantity / packSize : quantity
  return Math.round(packs * rate * 100) / 100
}
