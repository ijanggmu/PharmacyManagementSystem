/**
 * Printable Z-report (end-of-shift drawer report) for an 80 mm receipt printer.
 *
 * `buildZReportHtml` is pure: it returns a complete HTML document in which every interpolated value is
 * HTML-escaped. Print it with `printHtmlDocument` (features/accounting/lib/voucher-print).
 */

import { formatBsLong } from "@/features/accounting/lib/date-presets"
import { escapeHtml } from "@/features/accounting/lib/html-escape"
import { formatPrintAmount, type PrintProfile } from "@/features/accounting/lib/voucher-print"
import type { DotnetCashShiftSummaryDto } from "@/lib/api/cash-shifts-api"

export interface ZReportInput {
  summary: DotnetCashShiftSummaryDto
  profile: PrintProfile
  branchName?: string | null
  openedBy?: string | null
  closedBy?: string | null
  closingNotes?: string | null
  /** Defaults to now. Passed in for deterministic tests. */
  printedAt?: Date
}

const e = escapeHtml

function stamp(iso: string | null | undefined): string {
  if (!iso) return "—"
  const d = new Date(iso)
  if (Number.isNaN(d.getTime())) return "—"
  const bs = formatBsLong(d.toISOString().slice(0, 10))
  const time = d.toLocaleTimeString("en-GB", { hour: "2-digit", minute: "2-digit" })
  return bs ? `${bs}, ${time}` : d.toLocaleString("en-GB")
}

function row(label: string, value: string, strong = false): string {
  const cls = strong ? ' class="strong"' : ""
  return `<tr${cls}><td>${e(label)}</td><td class="num">${e(value)}</td></tr>`
}

/** Signed amount: "-1.80" for a shortage, "+5.00" for an excess, "0.00" when the drawer balanced. */
export function formatVariance(variance: number): string {
  if (Math.abs(variance) < 0.005) return formatPrintAmount(0)
  return `${variance > 0 ? "+" : "-"}${formatPrintAmount(Math.abs(variance))}`
}

export function buildZReportHtml(input: ZReportInput): string {
  const { summary, profile } = input
  const closed = summary.status.toLowerCase() === "closed"
  const refunds = summary.cashRefundsTotal ?? 0
  const receipts = summary.cashReceiptsTotal ?? 0
  const variance = summary.variance
  const varianceLabel =
    variance == null ? "—" : `${formatVariance(variance)}${variance < -0.005 ? " (short)" : variance > 0.005 ? " (over)" : ""}`

  const cashRows = [
    row("Opening float", formatPrintAmount(summary.openingFloat)),
    row("+ Cash sales", formatPrintAmount(summary.cashSalesTotal)),
    row("+ Cash received on account", formatPrintAmount(receipts)),
    row("- Cash refunds", formatPrintAmount(refunds)),
    row("Expected in drawer", formatPrintAmount(summary.expectedCash), true),
    row("Counted", summary.actualCashCounted == null ? "—" : formatPrintAmount(summary.actualCashCounted), true),
    row("Variance", varianceLabel, true),
  ].join("")

  const salesRows = [
    row("Sales", String(summary.salesCount)),
    row("Cash sales", formatPrintAmount(summary.cashSalesTotal)),
    row("Card / wallet / bank", formatPrintAmount(summary.nonCashSalesTotal)),
    row("Total sales", formatPrintAmount(summary.cashSalesTotal + summary.nonCashSalesTotal), true),
  ].join("")

  const printedAt = input.printedAt ?? new Date()
  const header = [
    `<div class="title">${e(profile.name)}</div>`,
    input.branchName ? `<div>${e(input.branchName)}</div>` : "",
    profile.panVat ? `<div>PAN/VAT: ${e(profile.panVat)}</div>` : "",
    `<div class="doc">${closed ? "Z-REPORT" : "X-REPORT (shift still open)"}</div>`,
  ].join("")

  return `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<title>${e(closed ? "Z-report" : "X-report")}</title>
<style>
  @page { size: 80mm auto; margin: 4mm; }
  * { box-sizing: border-box; }
  body { font-family: "Courier New", monospace; font-size: 12px; color: #000; margin: 0; width: 72mm; }
  .center { text-align: center; }
  .title { font-size: 15px; font-weight: bold; }
  .doc { margin-top: 4px; font-weight: bold; border: 1px solid #000; display: inline-block; padding: 1px 6px; }
  hr { border: 0; border-top: 1px dashed #000; margin: 6px 0; }
  table { width: 100%; border-collapse: collapse; }
  td { padding: 1px 0; vertical-align: top; }
  td.num { text-align: right; white-space: nowrap; }
  tr.strong td { font-weight: bold; }
  .section { font-weight: bold; margin-top: 2px; }
  .sign { margin-top: 28px; display: flex; justify-content: space-between; }
  .sign span { border-top: 1px solid #000; padding-top: 2px; width: 30mm; text-align: center; }
  .small { font-size: 10px; }
</style>
</head>
<body>
<div class="center">${header}</div>
<hr>
<table>
${row("Opened", stamp(summary.openedAtUtc))}
${input.openedBy ? row("Opened by", input.openedBy) : ""}
${row("Closed", closed ? stamp(summary.closedAtUtc) : "—")}
${input.closedBy ? row("Closed by", input.closedBy) : ""}
</table>
<hr>
<div class="section">Sales</div>
<table>${salesRows}</table>
<hr>
<div class="section">Cash drawer</div>
<table>${cashRows}</table>
${input.closingNotes ? `<hr><div class="small">Notes: ${e(input.closingNotes)}</div>` : ""}
<div class="sign"><span>Cashier</span><span>Manager</span></div>
<hr>
<div class="center small">Printed ${e(stamp(printedAt.toISOString()))}</div>
</body>
</html>`
}
