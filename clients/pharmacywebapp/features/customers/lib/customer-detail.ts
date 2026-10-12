/** Pure helpers for the customer detail sheet (no I/O). */

/** How many recent rows the detail sheet lists per tab. */
export const DETAIL_LIST_LIMIT = 100

/** Sales that count as purchases: cancelled sales are voided and never part of the customer's history totals. */
export function completedSales<T extends { status?: string | null }>(sales: readonly T[]): T[] {
  return sales.filter((s) => String(s.status ?? "").toLowerCase() !== "cancelled")
}

/**
 * The count shown on a tab or stat. A server total wins; without one (the summary failed to load) the
 * count of the rows fetched is shown, as "100+" when the list hit its cap and there are more.
 */
export function countLabel(serverTotal: number | null | undefined, shown: number, listTotal?: number | null): string {
  if (typeof serverTotal === "number" && Number.isFinite(serverTotal)) return String(serverTotal)
  const more = (typeof listTotal === "number" && listTotal > shown) || shown >= DETAIL_LIST_LIMIT
  return more ? `${shown}+` : String(shown)
}
