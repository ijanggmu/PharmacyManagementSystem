import { fefoGross, fefoUnitPrice } from "@/lib/inventory/fefo"
import type { CartItem, Medicine } from "@/features/sales/types"

/**
 * The price the next unit of `medicine` sells at: its first sellable lot's price. The batch price is the
 * only selling price; the medicine's own price only stands in for a medicine with no lot on file.
 */
export function medicineSellingPrice(medicine: Pick<Medicine, "fefo_picks" | "unit_price">): number {
  return fefoUnitPrice(medicine.fefo_picks ?? [], Number.parseFloat(medicine.unit_price) || 0)
}

/**
 * Prices a cart line the way the sale will: each unit at the price of the lot FEFO takes it from, then
 * the line's percent discount. `unitPrice` is the average over those units, so `quantity * unitPrice`
 * is the line's gross even when the units come from lots with different prices.
 */
export function priceCartLine(
  item: Pick<CartItem, "fefoPicks" | "basePrice">,
  quantity: number,
  discountPercent: number,
): Pick<CartItem, "unitPrice" | "totalPrice"> {
  const gross = fefoGross(item.fefoPicks, quantity, item.basePrice)
  return {
    unitPrice: quantity > 0 ? gross / quantity : item.basePrice,
    totalPrice: gross * (1 - discountPercent / 100),
  }
}
