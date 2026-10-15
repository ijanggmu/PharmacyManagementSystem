/**
 * Purchase-order rate prefill from the supplier's price list (pure). A line takes the price-list rate when it
 * has a medicine with a price, and the user hasn't typed a rate on it. The price list holds the cost of one
 * unit; the rate is for the unit the line is entered in: per unit, per pack (× units per pack) or per box
 * (× units per pack × packs per box). Switching a line's unit re-prices it, since the rate follows the unit.
 */

import { priceListRate } from "@/lib/api/suppliers-api"

export interface PrefillLine {
  id: string
  medicine_id: string
  unit_cost: string
  in_packs: boolean
  in_boxes?: boolean
}

export interface PrefillPrice {
  unit_cost: number
}

/** How a medicine is packed: units per pack and packs per box (either may be absent). */
export interface PrefillPacking {
  unitsPerPack?: number | null
  packsPerBox?: number | null
}

/** Units per pack alone (the original form) or the full pack/box sizes. */
export type PackingInput = number | PrefillPacking | null | undefined

function toPacking(packing: PackingInput): PrefillPacking {
  return typeof packing === "number" || packing == null ? { unitsPerPack: packing ?? null } : packing
}

/** Base units in one of the line's units: a box, a pack, or 1. */
export function lineUnitFactor(line: Pick<PrefillLine, "in_packs" | "in_boxes">, packing: PackingInput): number {
  const { unitsPerPack, packsPerBox } = toPacking(packing)
  const perPack = unitsPerPack ?? 0
  if (line.in_boxes && perPack > 0 && (packsPerBox ?? 0) > 1) return perPack * packsPerBox!
  if (line.in_packs && perPack > 1) return perPack
  return 1
}

/** The rate the price list gives this line, or null when it gives none (no medicine, no price, or typed rate). */
export function priceListRateFor(
  line: PrefillLine,
  prices: ReadonlyMap<string, PrefillPrice> | undefined,
  packing: PackingInput,
  typedLineIds: ReadonlySet<string>,
): string | null {
  if (!line.medicine_id || typedLineIds.has(line.id)) return null
  const price = prices?.get(line.medicine_id)
  if (!price) return null
  return priceListRate(price.unit_cost * lineUnitFactor(line, packing), false, null)
}

/** Lines with their price-list rate applied; the same array when nothing changes (safe in an effect). */
export function applyPriceListRates<T extends PrefillLine>(
  lines: readonly T[],
  prices: ReadonlyMap<string, PrefillPrice> | undefined,
  packingOf: (medicineId: string) => PackingInput,
  typedLineIds: ReadonlySet<string>,
): readonly T[] {
  let changed = false
  const next = lines.map((line) => {
    const rate = priceListRateFor(line, prices, packingOf(line.medicine_id), typedLineIds)
    if (rate === null || rate === line.unit_cost) return line
    changed = true
    return { ...line, unit_cost: rate }
  })
  return changed ? next : lines
}
