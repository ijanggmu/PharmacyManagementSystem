/**
 * Pack-unit selling at the POS (pure, unit-tested).
 *
 * Stock, lots, prices and every quantity sent to the server are in BASE units (e.g. tablets). A medicine with a
 * pack size (`units_per_pack`) can also be sold in packs: the cart keeps the base quantity and only displays /
 * steps it in packs; checkout sends the base quantity plus `sale_unit: "pack"` and the pack count, which the
 * server checks against the medicine's pack size and records on the sale line for the invoice.
 *
 * `unit_label` names either the pack ("Strip") or the base unit ("Tablet") — legacy data has both. A pack word
 * becomes the pack label (the base unit then comes from the dosage form); anything else is the base unit of a
 * generic "pack". Mirrors SaleItemPackUnit.ForMedicine on the server.
 */

export type SaleUnit = "base" | "pack"

export interface SaleUnits {
  /** Base units in one pack (≥ 2 — a pack of one is just the base unit). */
  unitsPerPack: number
  /** Singular, lower-case, e.g. "strip". */
  packLabel: string
  /** Singular, lower-case, e.g. "tablet". */
  baseLabel: string
}

export interface PackSizedMedicine {
  units_per_pack?: number | null
  unit_label?: string | null
  form?: string | null
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

/** The medicine's pack, or null when it can only be sold in base units (no pack size, or a pack of one). */
export function resolveSaleUnits(medicine: PackSizedMedicine): SaleUnits | null {
  const perPack = Number(medicine.units_per_pack ?? 0)
  if (!Number.isInteger(perPack) || perPack < 2) return null
  const label = medicine.unit_label?.trim().toLowerCase() || null
  if (label && PACK_WORDS.has(label)) {
    return { unitsPerPack: perPack, packLabel: singular(label), baseLabel: baseLabelFromForm(medicine.form) }
  }
  return { unitsPerPack: perPack, packLabel: "pack", baseLabel: label ?? baseLabelFromForm(medicine.form) }
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

/** Base units for a number of whole packs. */
export function packsToBase(packs: number, unitsPerPack: number): number {
  return Math.max(0, Math.floor(packs)) * unitsPerPack
}

/** Whole packs in a base quantity (any loose units left over are dropped). */
export function wholePacks(baseQuantity: number, unitsPerPack: number): number {
  return unitsPerPack > 0 ? Math.floor(baseQuantity / unitsPerPack) : 0
}

/** True when a base quantity is a whole, positive number of packs. */
export function isWholePacks(baseQuantity: number, unitsPerPack: number): boolean {
  return unitsPerPack > 0 && baseQuantity > 0 && baseQuantity % unitsPerPack === 0
}

/**
 * Base quantity after switching a cart line to packs: the nearest whole number of packs (at least one), capped
 * at the packs the stock can fill. 0 when not even one full pack is in stock.
 */
export function snapToPacks(baseQuantity: number, unitsPerPack: number, availableBase: number): number {
  const maxPacks = wholePacks(availableBase, unitsPerPack)
  if (maxPacks < 1) return 0
  const packs = Math.min(maxPacks, Math.max(1, Math.round(baseQuantity / unitsPerPack)))
  return packs * unitsPerPack
}

/**
 * A cart line after adding `count` of `unit` to it (`existing` = the line already in the cart, if any). A line in
 * pack mode stays in packs — every add to it is whole packs — and a pack add switches a base line to packs,
 * rounding its loose units up to whole packs. Returns the new BASE quantity and the line's unit.
 */
export function addToCartLine(
  existing: { quantity: number; saleUnit?: SaleUnit } | null,
  count: number,
  unit: SaleUnit,
  units: SaleUnits | null,
): { quantity: number; saleUnit: SaleUnit } {
  const lineUnit: SaleUnit = units && (unit === "pack" || existing?.saleUnit === "pack") ? "pack" : "base"
  const before = existing?.quantity ?? 0
  if (lineUnit === "base" || !units) return { quantity: before + count, saleUnit: "base" }
  const packsBefore = Math.ceil(before / units.unitsPerPack)
  return { quantity: (packsBefore + count) * units.unitsPerPack, saleUnit: "pack" }
}

/** The cart line's quantity in the unit it is sold in (packs for a pack line, base units otherwise). */
export function displayQuantity(item: { quantity: number; saleUnit?: SaleUnit; packUnits?: SaleUnits | null }): number {
  return item.saleUnit === "pack" && item.packUnits ? wholePacks(item.quantity, item.packUnits.unitsPerPack) : item.quantity
}

/** Base quantity for a quantity typed in the line's unit. */
export function baseFromDisplay(
  item: { saleUnit?: SaleUnit; packUnits?: SaleUnits | null },
  displayed: number,
): number {
  return item.saleUnit === "pack" && item.packUnits ? packsToBase(displayed, item.packUnits.unitsPerPack) : displayed
}

/** Checkout fields for a cart line: base quantity always; the unit and pack count only for a whole-pack line. */
export function saleLineUnitFields(item: {
  quantity: number
  saleUnit?: SaleUnit
  packUnits?: SaleUnits | null
}): { sale_unit?: "pack"; pack_count?: number } {
  if (item.saleUnit !== "pack" || !item.packUnits || !isWholePacks(item.quantity, item.packUnits.unitsPerPack)) return {}
  return { sale_unit: "pack", pack_count: item.quantity / item.packUnits.unitsPerPack }
}

/**
 * Stock in both units for the medicine picker: "35 tablets = 3 strips + 5". Falls back to the base count alone
 * when there is no pack or less than one full pack.
 */
export function formatStockInUnits(baseQuantity: number, units: SaleUnits | null): string {
  const base = units?.baseLabel ?? "unit"
  const total = formatUnitCount(baseQuantity, base)
  if (!units) return total
  const packs = wholePacks(baseQuantity, units.unitsPerPack)
  if (packs < 1) return total
  const loose = baseQuantity - packs * units.unitsPerPack
  return `${total} = ${formatUnitCount(packs, units.packLabel)}${loose > 0 ? ` + ${loose.toLocaleString("en-US", { maximumFractionDigits: 3 })}` : ""}`
}

/**
 * How a quantity sold in packs reads on the invoice: "2 strips (20 tablets)". A pack sale drawn from two lots is
 * two sale lines whose share need not be whole packs: "1 strip + 5 tablets (15 tablets)".
 */
export function formatPackQuantity(baseQuantity: number, units: SaleUnits): string {
  const packs = wholePacks(baseQuantity, units.unitsPerPack)
  const loose = Math.round((baseQuantity - packs * units.unitsPerPack) * 1000) / 1000
  const base = formatUnitCount(baseQuantity, units.baseLabel)
  if (packs < 1) return base
  const packPart = formatUnitCount(packs, units.packLabel)
  return loose > 0 ? `${packPart} + ${formatUnitCount(loose, units.baseLabel)} (${base})` : `${packPart} (${base})`
}

/** Sale line fields recorded by the server when the line was sold in packs. */
export interface SoldUnitFields {
  sold_units_per_pack?: number | null
  sold_pack_label?: string | null
  base_unit_label?: string | null
}

/** The pack a recorded sale line was sold in, or null for a base-unit line. */
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
  return item.saleUnit === "pack" && item.packUnits ? formatPackQuantity(item.quantity, item.packUnits) : null
}
