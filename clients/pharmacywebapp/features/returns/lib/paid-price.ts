/**
 * What the customer actually paid per unit on a sale line: the line total after its discount, spread
 * over the quantity. Returns and refunds pay back at this price (the server prices them the same way),
 * never at the pre-discount unit price.
 */
export function paidUnitPrice(item: { quantity: number; unit_price: string; total_price: string }): number {
  const total = Number.parseFloat(item.total_price)
  if (item.quantity > 0 && Number.isFinite(total)) {
    return Math.round((total / item.quantity) * 10000) / 10000
  }
  return Number.parseFloat(item.unit_price) || 0
}
