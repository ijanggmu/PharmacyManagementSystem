/**
 * Purchase-order rate prefill from the supplier's price list (pure). A line takes the price-list rate when it
 * has a medicine with a price, and the user hasn't typed a rate on it. The rate is per pack (unit cost × units
 * per pack) when the line is entered in packs of a medicine packed in more than one unit, else per unit.
 */

import { priceListRate } from "@/lib/api/suppliers-api"

export interface PrefillLine {
  id: string
  medicine_id: string
  unit_cost: string
  in_packs: boolean
}

export interface PrefillPrice {
  unit_cost: number
}

/** The rate the price list gives this line, or null when it gives none (no medicine, no price, or typed rate). */
export function priceListRateFor(
  line: PrefillLine,
  prices: ReadonlyMap<string, PrefillPrice> | undefined,
  unitsPerPack: number | null | undefined,
  typedLineIds: ReadonlySet<string>,
): string | null {
  if (!line.medicine_id || typedLineIds.has(line.id)) return null
  const price = prices?.get(line.medicine_id)
  if (!price) return null
  return priceListRate(price.unit_cost, line.in_packs && (unitsPerPack ?? 0) > 1, unitsPerPack)
}

/** Lines with their price-list rate applied; the same array when nothing changes (safe in an effect). */
export function applyPriceListRates<T extends PrefillLine>(
  lines: readonly T[],
  prices: ReadonlyMap<string, PrefillPrice> | undefined,
  unitsPerPackOf: (medicineId: string) => number | null | undefined,
  typedLineIds: ReadonlySet<string>,
): readonly T[] {
  let changed = false
  const next = lines.map((line) => {
    const rate = priceListRateFor(line, prices, unitsPerPackOf(line.medicine_id), typedLineIds)
    if (rate === null || rate === line.unit_cost) return line
    changed = true
    return { ...line, unit_cost: rate }
  })
  return changed ? next : lines
}
