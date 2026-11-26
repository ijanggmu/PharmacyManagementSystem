/** CSV export shared by the accounting reports. */

export type CsvValue = string | number | null | undefined

/** A text cell starting with one of these is read as a formula by Excel/Sheets (CSV injection). */
const FORMULA_START = /^[=+\-@\t\r]/
/** A plain signed number written as text (e.g. "-50.00", "-1,234.5") is not a formula: left as-is so it stays numeric. */
const NUMERIC_TEXT = /^[+-]?\d[\d,]*(\.\d+)?$/

/** Always quotes the cell (so commas, quotes, CR and LF are safe) and doubles embedded quotes. Text that
 *  would start a formula gets a leading `'`; numbers are left alone so negative amounts stay numeric. */
export function csvCell(value: CsvValue): string {
  let text = value == null ? "" : String(value)
  if (typeof value === "string" && FORMULA_START.test(text) && !NUMERIC_TEXT.test(text)) text = `'${text}`
  return `"${text.replace(/"/g, '""')}"`
}

export function buildCsv(headers: string[], rows: CsvValue[][]): string {
  return [headers.map(csvCell).join(","), ...rows.map((r) => r.map(csvCell).join(","))].join("\n")
}

/** Triggers a browser download of a CSV file (UTF-8 with BOM so Excel reads Devanagari correctly). */
export function downloadCsv(filename: string, headers: string[], rows: CsvValue[][]): void {
  const blob = new Blob(["﻿", buildCsv(headers, rows)], { type: "text/csv;charset=utf-8;" })
  const url = URL.createObjectURL(blob)
  const a = document.createElement("a")
  a.href = url
  a.download = filename
  document.body.appendChild(a)
  a.click()
  a.remove()
  // Revoke after the click's download has been handed off, or some browsers cancel it.
  setTimeout(() => URL.revokeObjectURL(url), 0)
}
