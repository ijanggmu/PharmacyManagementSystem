/**
 * Low-stock purchase order suggestions — pure helpers (no I/O) plus one loader.
 *
 * Which medicines: at or below their reorder level, including out of stock — the same set the
 * Inventory "low" + "out" stock filters return (on-hand <= reorder level, or nothing on hand).
 *
 * Suggested quantity (whole units, at least 1):
 *   - maximum stock set (> 0):  maximumStock − onHand          (refill to the maximum)
 *   - otherwise:                max(reorderLevel × 2 − onHand,  (refill to twice the reorder level;
 *                                   reorderLevel − onHand)       never less than the shortfall)
 *   then rounded up, and never below 1. Negative on-hand counts as 0.
 *   (reorderLevel × 2 − onHand is always ≥ reorderLevel − onHand for a non-negative reorder level; the
 *   second term only guards odd data such as a negative reorder level.)
 *
 * Unit cost: the medicine's current cost price, which the receipt flows keep at the last purchase cost.
 * The user can edit or remove every suggested line before the order is saved.
 */

import { medicinesApi, type Medicine } from "@/features/medicines/api-client"

export interface ReorderInput {
  onHand: number
  reorderLevel: number
  /** Null/undefined or 0 means "no maximum set". */
  maximumStock?: number | null
}

export function suggestReorderQuantity({ onHand, reorderLevel, maximumStock }: ReorderInput): number {
  const stock = Math.max(Number.isFinite(onHand) ? onHand : 0, 0)
  const reorder = Number.isFinite(reorderLevel) ? reorderLevel : 0
  const raw =
    maximumStock != null && Number.isFinite(maximumStock) && maximumStock > 0
      ? maximumStock - stock
      : Math.max(reorder * 2 - stock, reorder - stock)
  return Math.max(Math.ceil(raw), 1)
}

/** At or below the reorder level, or out of stock. */
export function isLowStock(onHand: number, reorderLevel: number): boolean {
  return onHand <= 0 || onHand <= reorderLevel
}

/** The medicine fields the suggestion needs (a subset of the list row). */
export type LowStockMedicine = Pick<
  Medicine,
  "id" | "name" | "supplier_id" | "stock_quantity" | "minimum_stock" | "maximum_stock" | "cost_price"
> &
  Partial<Pick<Medicine, "latest_cost_price">>

/** What a reorder line costs: the latest purchase cost, else the medicine's own cost price (often 0, since it
 *  is set at creation and never follows purchases). */
export function reorderUnitCost(m: Pick<LowStockMedicine, "cost_price" | "latest_cost_price">): number | string {
  return m.latest_cost_price != null && m.latest_cost_price > 0 ? m.latest_cost_price : m.cost_price
}

export interface LowStockLine {
  medicine_id: string
  name: string
  supplier_id: string | null
  quantity_ordered: number
  /** Two-decimal string, as the order form keeps money. */
  unit_cost: string
  on_hand: number
  reorder_level: number
}

export interface BuildLowStockLinesOptions {
  /** Keep only this supplier's medicines (medicine.supplier_id). */
  supplierId?: string | null
  /** Medicines already on the order are skipped. */
  excludeMedicineIds?: Iterable<string>
}

function toMoney(value: string | number): string {
  const n = typeof value === "number" ? value : Number.parseFloat(value)
  return (Number.isFinite(n) && n >= 0 ? n : 0).toFixed(2)
}

/** Out of stock first, then the lowest stock relative to its reorder level, then by name. */
function urgency(a: LowStockLine, b: LowStockLine): number {
  const outA = a.on_hand <= 0 ? 0 : 1
  const outB = b.on_hand <= 0 ? 0 : 1
  if (outA !== outB) return outA - outB
  const ratioA = a.reorder_level > 0 ? a.on_hand / a.reorder_level : a.on_hand
  const ratioB = b.reorder_level > 0 ? b.on_hand / b.reorder_level : b.on_hand
  if (ratioA !== ratioB) return ratioA - ratioB
  return a.name.localeCompare(b.name)
}

export function buildLowStockLines(
  medicines: readonly LowStockMedicine[],
  options: BuildLowStockLinesOptions = {},
): LowStockLine[] {
  const exclude = new Set(options.excludeMedicineIds ?? [])
  const lines: LowStockLine[] = []
  for (const m of medicines) {
    if (exclude.has(m.id)) continue
    if (options.supplierId && m.supplier_id !== options.supplierId) continue
    const onHand = Number(m.stock_quantity) || 0
    const reorderLevel = Number(m.minimum_stock) || 0
    if (!isLowStock(onHand, reorderLevel)) continue
    exclude.add(m.id)
    lines.push({
      medicine_id: m.id,
      name: m.name,
      supplier_id: m.supplier_id,
      quantity_ordered: suggestReorderQuantity({ onHand, reorderLevel, maximumStock: m.maximum_stock }),
      unit_cost: toMoney(reorderUnitCost(m)),
      on_hand: onHand,
      reorder_level: reorderLevel,
    })
  }
  return lines.sort(urgency)
}

/**
 * The supplier to preselect for a low-stock order: the one most suggested lines come from (ties go to
 * the first line's supplier, i.e. the most urgent). Null when no line has a supplier.
 */
export function dominantSupplierId(lines: readonly Pick<LowStockLine, "supplier_id">[]): string | null {
  const counts = new Map<string, number>()
  for (const line of lines) {
    if (line.supplier_id) counts.set(line.supplier_id, (counts.get(line.supplier_id) ?? 0) + 1)
  }
  let best: string | null = null
  let bestCount = 0
  for (const [id, count] of counts) {
    if (count > bestCount) {
      best = id
      bestCount = count
    }
  }
  return best
}

/** Medicines at or below their reorder level (all pages of the Inventory low + out filters). */
export async function loadLowStockMedicines(): Promise<{ data: Medicine[]; error: string | null }> {
  const res = await medicinesApi.getMedicines({
    stockStatuses: ["low", "out"],
    limit: 5000,
    sortBy: "name",
    sortOrder: "asc",
  })
  return { data: res.data, error: res.error }
}
