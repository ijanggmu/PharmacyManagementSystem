/** CSV export shared by the accounting reports. */

export type CsvValue = string | number | null | undefined

export function csvCell(value: CsvValue): string {
  const text = value == null ? "" : String(value)
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
  URL.revokeObjectURL(url)
}
