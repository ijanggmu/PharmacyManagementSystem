/**
 * Pack- and box-unit selling at the POS (pure, unit-tested).
 *
 * Stock, lots, prices and every quantity sent to the server are in BASE units (e.g. tablets). A medicine with a
 * pack size (`units_per_pack`) can also be sold in packs, and one that also has a box size (`packs_per_box`) in
 * boxes (box › pack › base, e.g. 1 box = 10 strips = 100 tablets): the cart keeps the base quantity and only
 * displays / steps it in packs or boxes; checkout sends the base quantity plus `sale_unit: "pack" | "box"` and the
 * count, which the server checks against the medicine's sizes and records on the sale line for the invoice.
 *
 * `unit_label` names either the pack ("Strip") or the base unit ("Tablet") — legacy data has both. A pack word
 * becomes the pack label (the base unit then comes from the dosage form); anything else is the base unit of a
 * generic "pack". Mirrors SaleItemPackUnit.ForMedicine / ForMedicineBox on the server.
 */

export type SaleUnit = "base" | "pack" | "box"

export interface SaleUnits {
  /** Base units in one pack (≥ 2 — a pack of one is just the base unit). */
  unitsPerPack: number
  /** Singular, lower-case, e.g. "strip". */
  packLabel: string
  /** Singular, lower-case, e.g. "tablet". */
  baseLabel: string
  /** Packs in one box (≥ 2); absent when the medicine has no box. */
  packsPerBox?: number
  /** Singular, lower-case, e.g. "box"; set with `packsPerBox`. */
  boxLabel?: string
  /** Base units in one box (unitsPerPack × packsPerBox); set with `packsPerBox`. */
  unitsPerBox?: number
}

export interface PackSizedMedicine {
  units_per_pack?: number | null
  unit_label?: string | null
  form?: string | null
  packs_per_box?: number | null
  box_label?: string | null
}

const PACK_WORDS = new Set([
  "strip", "strips", "blister", "blisters", "box", "boxes", "pack", "packs", "packet", "packets",
  "carton", "cartons", "bottle", "bottles", "jar", "jars", "tube", "tubes", "card", "cards",
])

const FORM_BASE_LABELS: [keyword: string, label: string][] = [
  ["tablet", "tablet"], ["capsule", "capsule"], ["sachet", "sachet"], ["vial", "vial"],
  ["ampoule", "ampoule"], ["ampule", "ampoule"], ["suppositor", "suppository"], ["lozenge", "lozenge"],
]

function baseLabelFromForm(form: string | null | undefined): string {
  const f = form?.trim().toLowerCase() ?? ""
  if (!f) return "unit"
  return FORM_BASE_LABELS.find(([keyword]) => f.includes(keyword))?.[1] ?? "unit"
}

function singular(label: string): string {
  if (label === "boxes") return "box"
  return label.endsWith("s") ? label.slice(0, -1) : label
}

function withBox(units: SaleUnits, medicine: PackSizedMedicine): SaleUnits {
  const perBox = Number(medicine.packs_per_box ?? 0)
  if (!Number.isInteger(perBox) || perBox < 2) return units
  const label = medicine.box_label?.trim().toLowerCase()
  return {
    ...units,
    packsPerBox: perBox,
    boxLabel: label ? singular(label) : "box",
    unitsPerBox: units.unitsPerPack * perBox,
  }
}

/** The medicine's pack (and box), or null when it can only be sold in base units (no pack size, or a pack of one). */
export function resolveSaleUnits(medicine: PackSizedMedicine): SaleUnits | null {
  const perPack = Number(medicine.units_per_pack ?? 0)
  if (!Number.isInteger(perPack) || perPack < 2) return null
  const label = medicine.unit_label?.trim().toLowerCase() || null
  if (label && PACK_WORDS.has(label)) {
    return withBox({ unitsPerPack: perPack, packLabel: singular(label), baseLabel: baseLabelFromForm(medicine.form) }, medicine)
  }
  return withBox({ unitsPerPack: perPack, packLabel: "pack", baseLabel: label ?? baseLabelFromForm(medicine.form) }, medicine)
}

/** True when the medicine's units include a box. */
export function hasBox(units: SaleUnits | null | undefined): units is SaleUnits & { unitsPerBox: number; boxLabel: string } {
  return !!units && (units.unitsPerBox ?? 0) > 0 && !!units.boxLabel
}

/** The unit a line can really be in: a box line without a box falls back to packs, a counted line without a pack to base. */
export function effectiveUnit(unit: SaleUnit | undefined, units: SaleUnits | null | undefined): SaleUnit {
  if (!units || !unit || unit === "base") return "base"
  if (unit === "box") return hasBox(units) ? "box" : "pack"
  return "pack"
}

/** Base units in one of `unit` (1 for base units, or when the medicine doesn't have that unit). */
export function unitFactor(unit: SaleUnit | undefined, units: SaleUnits | null | undefined): number {
  const u = effectiveUnit(unit, units)
  if (u === "box") return units!.unitsPerBox!
  if (u === "pack") return units!.unitsPerPack
  return 1
}

/** Singular label of `unit` for the medicine ("box", "strip", "tablet"). */
export function unitLabel(unit: SaleUnit | undefined, units: SaleUnits | null | undefined): string {
  const u = effectiveUnit(unit, units)
  if (u === "box") return units!.boxLabel!
  if (u === "pack") return units!.packLabel
  return units?.baseLabel ?? "unit"
}

/** The units a counted line (pack or box) reads as a single "pack" — how the invoice and the server's snapshot see it. */
export function countedUnits(unit: SaleUnit | undefined, units: SaleUnits | null | undefined): SaleUnits | null {
  const u = effectiveUnit(unit, units)
  if (u === "base" || !units) return null
  if (u === "pack") return { unitsPerPack: units.unitsPerPack, packLabel: units.packLabel, baseLabel: units.baseLabel }
  return { unitsPerPack: units.unitsPerBox!, packLabel: units.boxLabel!, baseLabel: units.baseLabel }
}

/** "tablet" → "tablets", "box" → "boxes"; unchanged for a count of exactly 1. */
export function pluralizeUnit(label: string, count: number): string {
  if (count === 1) return label
  if (/(s|x|z|ch|sh)$/.test(label)) return `${label}es`
  return `${label}s`
}

/** "20 tablets", "1 strip". */
export function formatUnitCount(count: number, label: string): string {
  return `${count.toLocaleString("en-US", { maximumFractionDigits: 3 })} ${pluralizeUnit(label, count)}`
}

/** Base units for a number of whole packs (or boxes, given units per box). */
export function packsToBase(packs: number, unitsPerPack: number): number {
  return Math.max(0, Math.floor(packs)) * unitsPerPack
}

/** Whole packs (or boxes) in a base quantity (any loose units left over are dropped). */
export function wholePacks(baseQuantity: number, unitsPerPack: number): number {
  return unitsPerPack > 0 ? Math.floor(baseQuantity / unitsPerPack) : 0
}

/** True when a base quantity is a whole, positive number of packs (or boxes). */
export function isWholePacks(baseQuantity: number, unitsPerPack: number): boolean {
  return unitsPerPack > 0 && baseQuantity > 0 && baseQuantity % unitsPerPack === 0
}

/**
 * Base quantity after switching a cart line to packs (or boxes): the nearest whole number of them (at least one),
 * capped at what the stock can fill. 0 when not even one full pack (box) is in stock.
 */
export function snapToPacks(baseQuantity: number, unitsPerPack: number, availableBase: number): number {
  const maxPacks = wholePacks(availableBase, unitsPerPack)
  if (maxPacks < 1) return 0
  const packs = Math.min(maxPacks, Math.max(1, Math.round(baseQuantity / unitsPerPack)))
  return packs * unitsPerPack
}

/**
 * A cart line after adding `count` of `unit` to it (`existing` = the line already in the cart, if any). A counted
 * line (packs or boxes) stays counted — a base add to it is one more of its unit — and a pack/box add switches a
 * base line to that unit, rounding its loose units up. Packs and boxes mix as packs (a box is whole packs): a box
 * added to a pack line adds its packs, a pack added to a box line turns it into a pack line. Returns the new BASE
 * quantity and the line's unit.
 */
export function addToCartLine(
  existing: { quantity: number; saleUnit?: SaleUnit } | null,
  count: number,
  unit: SaleUnit,
  units: SaleUnits | null,
): { quantity: number; saleUnit: SaleUnit } {
  const before = existing?.quantity ?? 0
  const lineBefore = effectiveUnit(existing?.saleUnit, units)
  const added = effectiveUnit(unit, units)
  if (!units || (lineBefore === "base" && added === "base")) return { quantity: before + count, saleUnit: "base" }

  let lineUnit: SaleUnit
  if (lineBefore === "base") lineUnit = added
  else if (added === "base" || added === lineBefore) lineUnit = lineBefore
  else lineUnit = "pack" // one pack line, one box add (or the other way round)

  const lineFactor = unitFactor(lineUnit, units)
  const addedPerCount = added === "base" ? lineFactor : unitFactor(added, units)
  const countBefore = Math.ceil(before / lineFactor)
  return { quantity: countBefore * lineFactor + count * addedPerCount, saleUnit: lineUnit }
}

/** The cart line's quantity in the unit it is sold in (packs / boxes for a counted line, base units otherwise). */
export function displayQuantity(item: { quantity: number; saleUnit?: SaleUnit; packUnits?: SaleUnits | null }): number {
  const factor = unitFactor(item.saleUnit, item.packUnits)
  return factor > 1 ? wholePacks(item.quantity, factor) : item.quantity
}

/** Base quantity for a quantity typed in the line's unit. */
export function baseFromDisplay(
  item: { saleUnit?: SaleUnit; packUnits?: SaleUnits | null },
  displayed: number,
): number {
  const factor = unitFactor(item.saleUnit, item.packUnits)
  return factor > 1 ? packsToBase(displayed, factor) : displayed
}

/** Checkout fields for a cart line: base quantity always; the unit and its count only for a whole-pack/box line. */
export function saleLineUnitFields(item: {
  quantity: number
  saleUnit?: SaleUnit
  packUnits?: SaleUnits | null
}): { sale_unit?: "pack" | "box"; pack_count?: number } {
  const unit = effectiveUnit(item.saleUnit, item.packUnits)
  if (unit === "base") return {}
  const factor = unitFactor(unit, item.packUnits)
  if (!isWholePacks(item.quantity, factor)) return {}
  return { sale_unit: unit, pack_count: item.quantity / factor }
}

/**
 * Stock in all units for the medicine picker: "35 tablets = 3 strips + 5", "235 tablets = 2 boxes 3 strips + 5".
 * Falls back to the base count alone when there is no pack or less than one full pack.
 */
export function formatStockInUnits(baseQuantity: number, units: SaleUnits | null): string {
  const base = units?.baseLabel ?? "unit"
  const total = formatUnitCount(baseQuantity, base)
  if (!units) return total
  let rest = baseQuantity
  const parts: string[] = []
  if (hasBox(units)) {
    const boxes = wholePacks(rest, units.unitsPerBox)
    if (boxes >= 1) {
      parts.push(formatUnitCount(boxes, units.boxLabel))
      rest -= boxes * units.unitsPerBox
    }
  }
  const packs = wholePacks(rest, units.unitsPerPack)
  if (packs >= 1) {
    parts.push(formatUnitCount(packs, units.packLabel))
    rest -= packs * units.unitsPerPack
  }
  if (parts.length === 0) return total
  const loose = Math.round(rest * 1000) / 1000
  return `${total} = ${parts.join(" ")}${loose > 0 ? ` + ${loose.toLocaleString("en-US", { maximumFractionDigits: 3 })}` : ""}`
}

/**
 * How a quantity sold in packs reads on the invoice: "2 strips (20 tablets)". A pack sale drawn from two lots is
 * two sale lines whose share need not be whole packs: "1 strip + 5 tablets (15 tablets)". A box line is passed
 * the box as its pack (see `countedUnits` / the server's snapshot): "2 boxes (200 tablets)".
 */
export function formatPackQuantity(baseQuantity: number, units: SaleUnits): string {
  const packs = wholePacks(baseQuantity, units.unitsPerPack)
  const loose = Math.round((baseQuantity - packs * units.unitsPerPack) * 1000) / 1000
  const base = formatUnitCount(baseQuantity, units.baseLabel)
  if (packs < 1) return base
  const packPart = formatUnitCount(packs, units.packLabel)
  return loose > 0 ? `${packPart} + ${formatUnitCount(loose, units.baseLabel)} (${base})` : `${packPart} (${base})`
}

/** Sale line fields recorded by the server when the line was sold in packs or boxes. */
export interface SoldUnitFields {
  sold_units_per_pack?: number | null
  sold_pack_label?: string | null
  base_unit_label?: string | null
}

/** The pack (or box) a recorded sale line was sold in, or null for a base-unit line. */
export function soldUnitsOf(item: SoldUnitFields): SaleUnits | null {
  const perPack = Number(item.sold_units_per_pack ?? 0)
  if (!(perPack > 0)) return null
  return {
    unitsPerPack: perPack,
    packLabel: item.sold_pack_label?.trim() || "pack",
    baseLabel: item.base_unit_label?.trim() || "unit",
  }
}

/** Invoice / detail note for a recorded sale line ("2 strips (20 tablets)"), or null when sold in base units. */
export function soldQuantityNote(item: SoldUnitFields & { quantity: number }): string | null {
  const units = soldUnitsOf(item)
  return units ? formatPackQuantity(item.quantity, units) : null
}

/** Invoice note for a cart line still on screen, or null when it is sold in base units. */
export function cartQuantityNote(item: { quantity: number; saleUnit?: SaleUnit; packUnits?: SaleUnits | null }): string | null {
  const units = countedUnits(item.saleUnit, item.packUnits)
  return units ? formatPackQuantity(item.quantity, units) : null
}
