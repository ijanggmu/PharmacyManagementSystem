import type { Medicine } from "@/features/medicines/api-client"

/**
 * Medicine details the books and the stock ledger were recorded against. Once the medicine has stock on
 * record the server refuses to change them (409), so the edit form shows them read-only and leaves them
 * out of the update:
 * - strength / form — they say which product the recorded stock is; invoices show the current values, so
 *   changing them would rewrite past bills. The name stays editable for spelling fixes.
 * - units_per_pack / unit_label — every lot, sale line and ledger row is counted in that unit.
 * - supplier_invoice_number / vat_amount — the opening receipt's bill, already posted.
 * The VAT flag stays editable: sale lines and stock lots keep the flag they were recorded under, so a
 * correction only applies to sales and purchases from then on. Stock and lot costs never change through the
 * form at all (Add stock / Adjust / a purchase do that).
 */
export const STOCK_LOCKED_FIELDS = [
  "strength",
  "form",
  "units_per_pack",
  "unit_label",
  "supplier_invoice_number",
  "vat_amount",
] as const satisfies readonly (keyof Medicine)[]

export type StockLockedField = (typeof STOCK_LOCKED_FIELDS)[number]

/**
 * Whether the stock-defining details are locked. The detail read reports has_stock_history; a list row
 * does not, so any lot or on-hand stock is taken as history until the detail read answers.
 */
export function hasStockHistory(
  medicine: Pick<Medicine, "has_stock_history" | "batch_count" | "stock_quantity">,
): boolean {
  if (typeof medicine.has_stock_history === "boolean") return medicine.has_stock_history
  return (medicine.batch_count ?? 0) > 0 || (medicine.stock_quantity ?? 0) > 0
}

/**
 * Box details (packs per box, box label) lock the same way once stock exists — but only when the medicine
 * already has a box: adding a box to a medicine with stock is allowed (it only adds an entry unit; every
 * recorded quantity stays in base units).
 */
export const BOX_LOCKED_FIELDS = ["packs_per_box", "box_label"] as const satisfies readonly (keyof Medicine)[]

/** Whether the medicine's box is locked: stock on record and a box already set. */
export function hasLockedBox(medicine: Pick<Medicine, "packs_per_box">, stockLocked: boolean): boolean {
  return stockLocked && medicine.packs_per_box != null
}

/** The update payload without the locked details (absent keeps the stored value on the server). */
export function withoutLockedFields<T extends object>(payload: T, locked: boolean, boxLocked = false): T {
  if (!locked && !boxLocked) return payload
  const copy = { ...payload } as Record<string, unknown>
  if (locked) for (const field of STOCK_LOCKED_FIELDS) delete copy[field]
  if (boxLocked) for (const field of BOX_LOCKED_FIELDS) delete copy[field]
  return copy as T
}
