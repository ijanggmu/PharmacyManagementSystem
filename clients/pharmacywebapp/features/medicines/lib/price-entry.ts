/**
 * Price entry for the medicine forms (pure). Prices are stored per base unit (one tablet, one bottle) in the
 * pharmacy's currency (NPR), because stock, sales, VAT and costing all count base units. Bills, though, quote a
 * price per strip or per box, and Indian stock is often billed in INR, so the forms let the user type the price
 * the way the bill shows it and convert it here before saving.
 */

import { resolveSaleUnits, unitFactor, unitLabel, type PackSizedMedicine, type SaleUnit, type SaleUnits } from "@/features/sales/lib/sale-units"

export type PriceCurrency = "NPR" | "INR"

/** Nepal Rastra Bank's fixed peg: 1 Indian rupee = 1.60 Nepali rupees. */
export const INR_TO_NPR = 1.6

/** The unit the typed price is for: one base unit, one pack (strip) or one box. */
export type PriceBasis = SaleUnit

export interface PriceEntry {
  basis: PriceBasis
  currency: PriceCurrency
}

export const DEFAULT_PRICE_ENTRY: PriceEntry = { basis: "base", currency: "NPR" }

/** Pack sizes as typed in the form ("10", "") read into the shape `resolveSaleUnits` takes. */
export function formUnits(medicine: {
  units_per_pack?: string | number | null
  packs_per_box?: string | number | null
  unit_label?: string | null
  box_label?: string | null
  form?: string | null
}): SaleUnits | null {
  const count = (v: string | number | null | undefined) => {
    const n = typeof v === "number" ? v : Number.parseInt(v ?? "", 10)
    return Number.isInteger(n) && n > 0 ? n : null
  }
  const sized: PackSizedMedicine = {
    units_per_pack: count(medicine.units_per_pack),
    packs_per_box: count(medicine.packs_per_box),
    unit_label: medicine.unit_label || null,
    box_label: medicine.box_label || null,
    form: medicine.form || null,
  }
  return resolveSaleUnits(sized)
}

/** The bases a price can be typed in for these pack sizes: always per unit, then per pack and per box when set. */
export function availablePriceBases(units: SaleUnits | null): PriceBasis[] {
  if (!units) return ["base"]
  return units.unitsPerBox ? ["base", "pack", "box"] : ["base", "pack"]
}

/** A basis the pack sizes no longer support (the box was cleared) falls back to per unit. */
export function supportedBasis(basis: PriceBasis, units: SaleUnits | null): PriceBasis {
  return availablePriceBases(units).includes(basis) ? basis : "base"
}

/** "tablet", "strip", "box" for the basis, as the POS names it. */
export function priceBasisLabel(basis: PriceBasis, units: SaleUnits | null): string {
  return unitLabel(supportedBasis(basis, units), units)
}

const round = (value: number, decimals: number) => {
  const f = 10 ** decimals
  return Math.round(value * f) / f
}

/**
 * The typed price as the stored per-base-unit NPR price, or null when it isn't a number.
 * Selling price rounds to paisa (the medicine's price has 2 decimals); cost keeps 4 so a strip's cost
 * spread over its tablets doesn't lose value.
 */
export function toBaseUnitPrice(
  entered: string | number,
  entry: PriceEntry,
  units: SaleUnits | null,
  kind: "selling" | "cost",
): number | null {
  const amount = typeof entered === "number" ? entered : Number.parseFloat(entered)
  if (!Number.isFinite(amount)) return null
  const rate = entry.currency === "INR" ? INR_TO_NPR : 1
  const perUnit = (amount * rate) / unitFactor(supportedBasis(entry.basis, units), units)
  return round(perUnit, kind === "selling" ? 2 : 4)
}

/** True when what's typed is saved as something else (another currency or unit), so the form shows the result. */
export function priceIsConverted(entry: PriceEntry, units: SaleUnits | null): boolean {
  return entry.currency !== "NPR" || supportedBasis(entry.basis, units) !== "base"
}

/** A CSV `price_currency` cell: INR / ₹ / IRS read as INR, anything else (blank included) is NPR. */
export function parsePriceCurrency(cell: string | undefined): PriceCurrency {
  const text = (cell ?? "").trim().toLowerCase()
  return ["inr", "₹", "irs", "ic", "indian"].includes(text) ? "INR" : "NPR"
}

/** A CSV `price_per` cell: strip/pack and box/carton; anything else (blank included) is per unit. */
export function parsePriceBasis(cell: string | undefined): PriceBasis {
  const text = (cell ?? "").trim().toLowerCase()
  if (["strip", "strips", "pack", "packs", "pack_size"].includes(text)) return "pack"
  if (["box", "boxes", "carton", "cartons"].includes(text)) return "box"
  return "base"
}
