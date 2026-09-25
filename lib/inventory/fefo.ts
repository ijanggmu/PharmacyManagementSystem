/** One sellable lot, in the same order deduct_fefo_batches walks stock:
 *  soonest expiry first, undated batches last, older receipt first on a tie. */
export interface FefoPick {
  batch_number: string
  expiry_date: string | null
  rack_location: string | null
  quantity_remaining: number
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

export function formatBatchExpiry(iso: string | null): string | null {
  if (!iso) return null
  const [year, month, day] = iso.slice(0, 10).split("-")
  const months = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"]
  const monthIndex = Number(month) - 1
  if (!year || !day || monthIndex < 0 || monthIndex > 11) return iso.slice(0, 10)
  return `${day} ${months[monthIndex]} ${year}`
}
