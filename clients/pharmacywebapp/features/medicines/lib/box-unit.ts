import { formatUnitCount, hasBox, resolveSaleUnits } from "@/features/sales/lib/sale-units"

type NumberField = number | string | null | undefined

function toCount(value: NumberField): number | null {
  if (value === null || value === undefined || value === "") return null
  const n = typeof value === "number" ? value : Number(value)
  return Number.isInteger(n) ? n : null
}

/**
 * How a medicine's box › pack › base units read, for the medicine forms and detail view: "1 box = 10 strips =
 * 100 tablets". Null when the medicine has no box (or no pack to put in it). Labels resolve exactly as at the POS.
 */
export function boxSummary(
  unitsPerPack: NumberField,
  packsPerBox: NumberField,
  boxLabel: string | null | undefined,
  unitLabel: string | null | undefined,
  form: string | null | undefined,
): string | null {
  const units = resolveSaleUnits({
    units_per_pack: toCount(unitsPerPack),
    packs_per_box: toCount(packsPerBox),
    box_label: boxLabel ?? null,
    unit_label: unitLabel ?? null,
    form: form ?? null,
  })
  if (!hasBox(units)) return null
  return `1 ${units.boxLabel} = ${formatUnitCount(units.packsPerBox ?? 0, units.packLabel)} = ${formatUnitCount(units.unitsPerBox, units.baseLabel)}`
}
