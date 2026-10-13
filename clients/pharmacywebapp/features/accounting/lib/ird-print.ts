/**
 * Plain A4 print document for tax reports (VAT summary, IRD registers): a title block, context lines
 * and one table with an optional totals row. Every value is escaped. Print with printHtmlDocument.
 */

import { escapeHtml as e } from "./html-escape"

export interface TaxReportPrintInput {
  title: string
  /** Business name for the letterhead line, when known. */
  organisation?: string | null
  /** Context lines under the title, e.g. period and branch. */
  subtitle?: string[]
  headers: string[]
  /** Right-aligned columns (money). Same length as headers. */
  numeric: boolean[]
  rows: (string | number | null)[][]
  totals?: (string | number | null)[] | null
  footnote?: string | null
  /** Indexes of rows to emphasise as section headings / subtotals. */
  sectionRowIndexes?: number[]
  printedAt?: Date
}

function cell(value: string | number | null): string {
  return value == null ? "" : e(value)
}

export function buildTaxReportPrintHtml(input: TaxReportPrintInput): string {
  const align = (i: number) => (input.numeric[i] ? ' class="r"' : "")
  const head = input.headers.map((h, i) => `<th${align(i)}>${e(h)}</th>`).join("")
  const sections = new Set(input.sectionRowIndexes ?? [])
  const body = input.rows
    .map((row, r) => `<tr${sections.has(r) ? ' class="sec"' : ""}>${row.map((v, i) => `<td${align(i)}>${cell(v)}</td>`).join("")}</tr>`)
    .join("")
  const totals = input.totals
    ? `<tfoot><tr>${input.totals.map((v, i) => `<td${align(i)}>${cell(v)}</td>`).join("")}</tr></tfoot>`
    : ""
  const printedAt = (input.printedAt ?? new Date()).toLocaleString("en-GB")
  const subtitle = (input.subtitle ?? []).map((s) => `<p class="sub">${e(s)}</p>`).join("")

  return `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8" />
<title>${e(input.title)}</title>
<style>
  @page { size: A4; margin: 14mm 12mm; }
  * { box-sizing: border-box; }
  body { font-family: system-ui, -apple-system, "Segoe UI", sans-serif; color: #111; font-size: 11px; margin: 0; }
  .org { font-size: 12px; font-weight: 600; color: #444; margin: 0 0 2px; }
  h1 { font-size: 17px; margin: 0 0 4px; }
  .sub { margin: 0; color: #555; }
  table { width: 100%; border-collapse: collapse; margin-top: 12px; font-variant-numeric: tabular-nums; }
  th, td { padding: 5px 6px; border-bottom: 1px solid #ddd; text-align: left; vertical-align: top; }
  th { font-size: 10px; text-transform: uppercase; letter-spacing: .04em; color: #555; border-bottom: 1.5px solid #999; }
  .r { text-align: right; white-space: nowrap; }
  tr.sec td { font-weight: 700; background: #f4f4f4; }
  tfoot td { font-weight: 700; border-top: 1.5px solid #333; border-bottom: none; }
  thead { display: table-header-group; }
  tr { page-break-inside: avoid; }
  .foot { margin-top: 14px; color: #666; font-size: 10px; }
</style>
</head>
<body>
${input.organisation ? `<p class="org">${e(input.organisation)}</p>` : ""}
<h1>${e(input.title)}</h1>
${subtitle}
<table><thead><tr>${head}</tr></thead><tbody>${body}</tbody>${totals}</table>
<p class="foot">${input.footnote ? `${e(input.footnote)} &middot; ` : ""}Printed ${e(printedAt)}</p>
</body>
</html>`
}
