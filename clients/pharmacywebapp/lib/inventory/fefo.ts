/** One sellable lot, in the same order deduct_fefo_batches walks stock:
 *  soonest expiry first, undated batches last, older receipt first on a tie. */
export interface FefoPick {
  batch_number: string
  expiry_date: string | null
  rack_location: string | null
  quantity_remaining: number
  /** What a sale charges per unit taken from this lot — the batch price is the only selling price. */
  selling_price: number
}

export interface FefoAllocation extends FefoPick {
  take: number
}

export function compareFefo(
  a: { expiry_date: string | null; received_at: string },
  b: { expiry_date: string | null; received_at: string }
): number {
  const aExp = a.expiry_date?.slice(0, 10) ?? null
  const bExp = b.expiry_date?.slice(0, 10) ?? null
  if (aExp === null && bExp !== null) return 1
  if (aExp !== null && bExp === null) return -1
  if (aExp !== null && bExp !== null && aExp !== bExp) return aExp < bExp ? -1 : 1
  if (a.received_at === b.received_at) return 0
  return a.received_at < b.received_at ? -1 : 1
}

/** True when this lot is still eligible for sale on `today` (YYYY-MM-DD).
 *  A null expiry is sellable and is ordered last by compareFefo. */
export function isSellableOn(expiryDate: string | null, today: string): boolean {
  if (!expiryDate) return true
  return expiryDate.slice(0, 10) >= today
}

/** Split a requested quantity across FEFO-ordered lots. Lots are not re-sorted. */
export function allocateFefo(picks: FefoPick[], quantity: number): FefoAllocation[] {
  let left = quantity
  const lines: FefoAllocation[] = []
  for (const pick of picks) {
    if (left <= 0) break
    const take = Math.min(pick.quantity_remaining, left)
    if (take <= 0) continue
    lines.push({ ...pick, take })
    left -= take
  }
  return lines
}

/** Price of the next unit to be sold: the first lot's price, else `fallback` (e.g. no batch on file). */
export function fefoUnitPrice(picks: FefoPick[], fallback: number): number {
  const first = picks[0]
  return first && first.selling_price > 0 ? first.selling_price : fallback
}

/**
 * Gross price of `quantity` units the way the sale will charge it: each unit at the price of the lot
 * FEFO takes it from. Units no lot covers (or lots without a price) are priced at `fallback`; the server
 * refuses a lot without a price, so that fallback only ever shows a pre-batch-tracking medicine.
 */
export function fefoGross(picks: FefoPick[], quantity: number, fallback: number): number {
  let covered = 0
  let gross = 0
  for (const line of allocateFefo(picks, quantity)) {
    gross += line.take * (line.selling_price > 0 ? line.selling_price : fallback)
    covered += line.take
  }
  return gross + Math.max(0, quantity - covered) * fallback
}

/** True when `quantity` units would come from lots with different prices. */
export function fefoHasMixedPrices(picks: FefoPick[], quantity: number): boolean {
  return new Set(allocateFefo(picks, quantity).map((line) => line.selling_price)).size > 1
}

export function formatBatchExpiry(iso: string | null): string | null {
  if (!iso) return null
  const [year, month, day] = iso.slice(0, 10).split("-")
  const months = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"]
  const monthIndex = Number(month) - 1
  if (!year || !day || monthIndex < 0 || monthIndex > 11) return iso.slice(0, 10)
  return `${day} ${months[monthIndex]} ${year}`
}
