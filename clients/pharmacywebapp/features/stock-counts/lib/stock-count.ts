/**
 * Physical stock count helpers: DTO shapes from the .NET Inventory module, line filtering for the counting
 * screen, the variance summary, CSV rows and the printable count sheet. Pure — no fetching.
 *
 * The server owns the variance math (expected = snapshot rolled forward by the lot's sales/receipts up to
 * when it was counted, so selling during the count isn't a loss); this file only presents it.
 */

import { escapeHtml } from "@/features/accounting/lib/html-escape"
import type { CsvValue } from "@/features/accounting/lib/csv"
import type { PrintProfile } from "@/features/accounting/lib/voucher-print"

export type StockCountStatus = "Draft" | "Counting" | "Review" | "Posted" | "Cancelled"

export interface StockCountSession {
  id: string
  sessionNumber: string
  title: string
  branchId: string
  status: StockCountStatus
  categoryId: string | null
  rackLocation: string | null
  supplierId: string | null
  notes: string | null
  createdAtUtc: string
  snapshotAtUtc: string | null
  submittedAtUtc: string | null
  postedAtUtc: string | null
  cancelledAtUtc: string | null
  lineCount: number
  countedLineCount: number
  postedGainValue: number
  postedLossValue: number
}

export interface StockCountLine {
  id: string
  medicineId: string
  medicineName: string
  batchId: string | null
  batchNo: string
  expiryDate: string | null
  rackLocation: string | null
  unitCost: number
  snapshotQuantity: number
  snapshotAtUtc: string
  isFoundLot: boolean
  countedQuantity: number | null
  countedAtUtc: string | null
  note: string | null
  movementsSinceSnapshot: number
  expectedQuantity: number | null
  varianceQuantity: number | null
  varianceValue: number | null
  currentSystemQuantity: number | null
  postedDelta: number | null
}

export interface StockCountDetail {
  session: StockCountSession
  lines: StockCountLine[]
  gainValue: number
  lossValue: number
  netValue: number
}

export const STOCK_COUNT_STATUSES: StockCountStatus[] = ["Draft", "Counting", "Review", "Posted", "Cancelled"]

export function stockCountStatusLabel(status: StockCountStatus): string {
  switch (status) {
    case "Draft":
      return "Draft"
    case "Counting":
      return "Counting"
    case "Review":
      return "In review"
    case "Posted":
      return "Posted"
    case "Cancelled":
      return "Cancelled"
  }
}

export function stockCountStatusVariant(status: StockCountStatus): "default" | "secondary" | "success" | "warning" | "muted" {
  switch (status) {
    case "Draft":
      return "secondary"
    case "Counting":
      return "warning"
    case "Review":
      return "default"
    case "Posted":
      return "success"
    case "Cancelled":
      return "muted"
  }
}

/** A session can still be cancelled until it is posted. */
export function canCancel(status: StockCountStatus): boolean {
  return status === "Draft" || status === "Counting" || status === "Review"
}

/**
 * Parses what the counter typed. Blank clears the count (null); otherwise a non-negative number.
 * Returns undefined for anything unusable, so the caller can flag the field.
 */
export function parseCountInput(raw: string): number | null | undefined {
  const text = raw.trim().replace(/,/g, "")
  if (text === "") return null
  if (!/^\d+(\.\d{1,3})?$/.test(text)) return undefined
  const value = Number(text)
  return Number.isFinite(value) && value >= 0 ? value : undefined
}

/** Lines whose medicine, batch number or rack contains the term (case-insensitive). */
export function filterLines(lines: StockCountLine[], term: string): StockCountLine[] {
  const t = term.trim().toLowerCase()
  if (!t) return lines
  return lines.filter(
    (l) =>
      l.medicineName.toLowerCase().includes(t) ||
      l.batchNo.toLowerCase().includes(t) ||
      (l.rackLocation ?? "").toLowerCase().includes(t),
  )
}

export const NO_RACK = "No rack"

/** Lines grouped by rack for the count sheet: racks in natural order, lots without a rack last. */
export function groupByRack(lines: StockCountLine[]): { rack: string; lines: StockCountLine[] }[] {
  const groups = new Map<string, StockCountLine[]>()
  for (const line of lines) {
    const rack = line.rackLocation?.trim() || NO_RACK
    const list = groups.get(rack) ?? []
    list.push(line)
    groups.set(rack, list)
  }
  return [...groups.entries()]
    .sort(([a], [b]) => {
      if (a === NO_RACK) return 1
      if (b === NO_RACK) return -1
      return a.localeCompare(b, undefined, { numeric: true, sensitivity: "base" })
    })
    .map(([rack, list]) => ({
      rack,
      lines: [...list].sort(
        (x, y) => x.medicineName.localeCompare(y.medicineName) || (x.expiryDate ?? "").localeCompare(y.expiryDate ?? ""),
      ),
    }))
}

export interface VarianceSummary {
  total: number
  counted: number
  uncounted: number
  withVariance: number
  gainValue: number
  lossValue: number
  netValue: number
}

/** Totals over the counted lines (an uncounted line is left untouched when posting). */
export function varianceSummary(lines: StockCountLine[]): VarianceSummary {
  let counted = 0
  let withVariance = 0
  let gain = 0
  let loss = 0
  for (const line of lines) {
    if (line.countedQuantity === null) continue
    counted++
    const value = line.varianceValue ?? 0
    if ((line.varianceQuantity ?? 0) !== 0) withVariance++
    if (value > 0) gain += value
    else loss -= value
  }
  const round = (n: number) => Math.round(n * 100) / 100
  return {
    total: lines.length,
    counted,
    uncounted: lines.length - counted,
    withVariance,
    gainValue: round(gain),
    lossValue: round(loss),
    netValue: round(gain - loss),
  }
}

export const VARIANCE_CSV_HEADERS = [
  "Rack",
  "Medicine",
  "Batch",
  "Expiry",
  "Snapshot qty",
  "Movements since snapshot",
  "Expected qty",
  "Counted qty",
  "Variance qty",
  "Unit cost",
  "Variance value",
  "Found lot",
  "Note",
]

/** One CSV row per line, in count-sheet order. Uncounted lines keep blank counted/variance cells. */
export function varianceCsvRows(lines: StockCountLine[]): CsvValue[][] {
  return groupByRack(lines).flatMap((group) =>
    group.lines.map((l) => [
      group.rack === NO_RACK ? "" : group.rack,
      l.medicineName,
      l.batchNo,
      l.expiryDate ?? "",
      l.snapshotQuantity,
      l.movementsSinceSnapshot,
      l.expectedQuantity,
      l.countedQuantity,
      l.varianceQuantity,
      l.unitCost.toFixed(2),
      l.varianceValue === null ? null : l.varianceValue.toFixed(2),
      l.isFoundLot ? "Yes" : "",
      l.note ?? "",
    ]),
  )
}

export interface CountSheetInput {
  session: StockCountSession
  lines: StockCountLine[]
  profile: PrintProfile
  branchName?: string | null
  /** Hide system quantities so counters count what they see, not what the system says. */
  blind: boolean
  printedAt?: Date
}

const e = escapeHtml

function fmtQty(n: number | null): string {
  if (n === null) return ""
  return Number.isInteger(n) ? String(n) : n.toFixed(3).replace(/0+$/, "").replace(/\.$/, "")
}

/** Printable A4 count sheet, one table per rack, with blank boxes to write the counted quantity in. */
export function buildCountSheetHtml(input: CountSheetInput): string {
  const { session, profile, blind } = input
  const printedAt = (input.printedAt ?? new Date()).toLocaleString("en-GB", {
    day: "2-digit",
    month: "short",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  })
  const scope = [
    session.rackLocation ? `Rack ${e(session.rackLocation)}` : "",
    session.categoryId ? "One category" : "",
    session.supplierId ? "One supplier" : "",
  ]
    .filter(Boolean)
    .join(" · ") || "All lots"

  const sections = groupByRack(input.lines)
    .map(
      (group) => `
      <h2>${e(group.rack)} <span class="count">${group.lines.length} lot${group.lines.length === 1 ? "" : "s"}</span></h2>
      <table>
        <thead><tr>
          <th class="n">#</th><th>Medicine</th><th>Batch</th><th>Expiry</th>
          ${blind ? "" : '<th class="r">System</th>'}
          <th class="r box-h">Counted</th><th>Remarks</th>
        </tr></thead>
        <tbody>
          ${group.lines
            .map(
              (l, i) => `<tr>
              <td class="n">${i + 1}</td>
              <td>${e(l.medicineName)}${l.isFoundLot ? ' <span class="tag">found</span>' : ""}</td>
              <td class="mono">${e(l.batchNo)}</td>
              <td>${e(l.expiryDate ?? "—")}</td>
              ${blind ? "" : `<td class="r">${e(fmtQty(l.snapshotQuantity))}</td>`}
              <td class="r box">${l.countedQuantity === null ? "" : e(fmtQty(l.countedQuantity))}</td>
              <td class="remarks"></td>
            </tr>`,
            )
            .join("")}
        </tbody>
      </table>`,
    )
    .join("")

  return `<!doctype html>
<html><head><meta charset="utf-8"><title>${e(session.sessionNumber)} count sheet</title>
<style>
  @page { size: A4; margin: 12mm; }
  body { font-family: system-ui, -apple-system, "Segoe UI", sans-serif; font-size: 11px; color: #111; }
  header { display: flex; justify-content: space-between; border-bottom: 2px solid #111; padding-bottom: 6px; margin-bottom: 8px; }
  h1 { font-size: 16px; margin: 0; }
  h2 { font-size: 13px; margin: 14px 0 4px; break-after: avoid; }
  .count { font-weight: normal; color: #555; font-size: 11px; }
  .meta { color: #444; line-height: 1.5; }
  table { width: 100%; border-collapse: collapse; break-inside: auto; }
  tr { break-inside: avoid; }
  th, td { border: 1px solid #999; padding: 4px 5px; text-align: left; vertical-align: top; }
  th { background: #f1f1f1; font-weight: 600; }
  .r { text-align: right; }
  .n { width: 22px; text-align: right; color: #555; }
  .mono { font-family: ui-monospace, Menlo, Consolas, monospace; }
  .box { width: 70px; height: 20px; }
  .box-h { width: 70px; }
  .remarks { width: 25%; }
  .tag { font-size: 9px; border: 1px solid #777; border-radius: 3px; padding: 0 3px; }
  .sign { margin-top: 24px; display: flex; gap: 40px; }
  .sign div { flex: 1; border-top: 1px solid #111; padding-top: 4px; }
</style></head>
<body>
  <header>
    <div>
      <h1>Stock count sheet — ${e(session.sessionNumber)}</h1>
      <div class="meta">${e(session.title)}<br>${scope}${blind ? " · Blind count" : ""}</div>
    </div>
    <div class="meta" style="text-align:right">
      ${e(profile.name)}${input.branchName ? `<br>${e(input.branchName)}` : ""}<br>Printed ${e(printedAt)}
    </div>
  </header>
  ${sections || "<p>No lots on this count.</p>"}
  <div class="sign"><div>Counted by</div><div>Checked by</div><div>Date</div></div>
</body></html>`
}
