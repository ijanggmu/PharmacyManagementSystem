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
 * price. Blank when neither is known (the field stays required).
 */
export function initialReceiptSellingPrice(
  orderLinePrice: number | null | undefined,
  catalogPrice: string | number | null | undefined,
): string {
  if (orderLinePrice != null && orderLinePrice > 0) return String(orderLinePrice)
  const catalog = Number(catalogPrice)
  return Number.isFinite(catalog) && catalog > 0 ? catalog.toFixed(2) : ""
}
