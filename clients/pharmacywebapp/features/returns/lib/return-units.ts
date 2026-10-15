/**
 * The units a sold line can be returned in (pure). A line sold in packs or boxes records only the unit it was sold in
 * (a box of 100), so a box line also offers the strip when the medicine's strip size divides the box evenly: a customer
 * often brings back part of a box. Every quantity handed back stays in base units, as the server counts them.
 */

import { pluralizeUnit, resolveSaleUnits, type PackSizedMedicine, type SaleUnit, type SaleUnits } from "@/features/sales/lib/sale-units"

export interface ReturnUnitOption {
  value: SaleUnit
  /** "tablets", "strips of 10", "boxes of 100". */
  label: string
  /** Base units in one of this unit. */
  factor: number
  /** Singular name, for notes and labels ("strip"). */
  unitName: string
}

/** The pack inside a recorded box, from the medicine's current packing: null when there is none to offer. */
export function innerPackOf(
  sold: SaleUnits | null,
  medicine: PackSizedMedicine | null | undefined,
): { unitsPerPack: number; packLabel: string } | null {
  if (!sold || !medicine) return null
  const units = resolveSaleUnits(medicine)
  if (!units) return null
  const inner = units.unitsPerPack
  if (inner < 2 || inner >= sold.unitsPerPack || sold.unitsPerPack % inner !== 0) return null
  return { unitsPerPack: inner, packLabel: units.packLabel }
}

/** Base, then the inner pack (when a box line has one), then the unit the line was sold in. Empty for a base-unit line. */
export function returnUnitOptions(
  sold: SaleUnits | null,
  innerPack: { unitsPerPack: number; packLabel: string } | null,
): ReturnUnitOption[] {
  if (!sold) return []
  const options: ReturnUnitOption[] = [
    { value: "base", label: pluralizeUnit(sold.baseLabel, 2), factor: 1, unitName: sold.baseLabel },
  ]
  if (innerPack) {
    options.push({
      value: "pack",
      label: `${pluralizeUnit(innerPack.packLabel, 2)} of ${innerPack.unitsPerPack}`,
      factor: innerPack.unitsPerPack,
      unitName: innerPack.packLabel,
    })
    options.push({
      value: "box",
      label: `${pluralizeUnit(sold.packLabel, 2)} of ${sold.unitsPerPack}`,
      factor: sold.unitsPerPack,
      unitName: sold.packLabel,
    })
  } else {
    options.push({
      value: "pack",
      label: `${pluralizeUnit(sold.packLabel, 2)} of ${sold.unitsPerPack}`,
      factor: sold.unitsPerPack,
      unitName: sold.packLabel,
    })
  }
  return options
}
