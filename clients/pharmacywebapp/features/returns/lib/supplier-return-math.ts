import type { Medicine, MedicineBatch } from "@/features/medicines/api-client"

/** Select value meaning "let the server take the oldest-expiring stock first". */
export const ANY_BATCH = "__any__"

export interface ReturnLine {
  key: string
  medicine: Medicine | null
  /** A batch id, or ANY_BATCH. */
  batchId: string
  /** Units left in the chosen batch; undefined when no batch is pinned. */
  batchCap?: number
  quantity: number
  unitCost: number
  reason: string
  notes: string
}

export function money(n: number): number {
  return Math.round((Number.isFinite(n) ? n : 0) * 100) / 100
}

/** This branch's stock when the API reports it, else the tenant-wide figure. */
export function medicineStock(m: Pick<Medicine, "branch_stock_quantity" | "stock_quantity">): number {
  return m.branch_stock_quantity ?? m.stock_quantity ?? 0
}

/** VAT the server will reverse for this line (taxable medicines only, when the goods came on a VAT bill). */
export function lineVat(line: Pick<ReturnLine, "medicine" | "quantity" | "unitCost">, vatBill: boolean, ratePercent: number): number {
  if (!vatBill || !line.medicine || line.medicine.is_taxable === false || ratePercent <= 0) return 0
  return money(money(line.quantity * line.unitCost) * (ratePercent / 100))
}

/** Lots that can go back from this branch: stock left, not written off, not recalled… soonest expiry first. */
export function returnableBatches(batches: readonly MedicineBatch[], branchId: string | undefined): MedicineBatch[] {
  return batches
    .filter((b) => b.quantity_remaining > 0 && !b.is_disposed && (!branchId || !b.branches || b.branches.id === branchId))
    .sort((a, b) => (a.expiry_date ?? "9999").localeCompare(b.expiry_date ?? "9999"))
}

/**
 * Cost a return line is previewed at. The server values the debit note at the cost of the lots that
 * actually leave stock, so this is only an estimate: the named batch's cost, else the medicine's purchase
 * cost. Never the selling price (that would overstate the debit and the inventory credit).
 */
export function estimatedUnitCost(
  medicine: Pick<Medicine, "cost_price"> | null,
  batch?: Pick<MedicineBatch, "cost_price"> | null,
): number {
  if (batch?.cost_price != null && batch.cost_price > 0) return batch.cost_price
  const cost = medicine ? Number.parseFloat(medicine.cost_price) : Number.NaN
  return Number.isFinite(cost) && cost > 0 ? cost : 0
}
