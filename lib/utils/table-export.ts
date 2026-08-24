/**
 * Generic export for any DataTable — CSV, Excel (.xlsx), and PDF — driven purely
 * by column headers + a plain-value getter per row, so it works for any table in
 * the app without a bespoke exporter per page (see components/ui/data-table.tsx).
 */
import * as XLSX from "xlsx"
import { saveAs } from "file-saver"
import jsPDF from "jspdf"
import autoTable from "jspdf-autotable"

export interface ExportColumn<T> {
  header: string
  value: (row: T) => string | number
}

function toRows<T>(data: T[], columns: ExportColumn<T>[]): string[][] {
  return data.map((row) => columns.map((c) => String(c.value(row) ?? "")))
}

function timestampedFilename(base: string, ext: string): string {
  const stamp = new Date().toISOString().slice(0, 10)
  return `${base}-${stamp}.${ext}`
}

/** Quotes/escapes a CSV field per RFC 4180 — wraps in quotes and doubles any
 *  embedded quotes whenever the value contains a comma, quote, or newline. */
function csvField(value: string): string {
  if (/[",\n]/.test(value)) {
    return `"${value.replace(/"/g, '""')}"`
  }
  return value
}

export function exportTableToCsv<T>(data: T[], columns: ExportColumn<T>[], filename: string): void {
  const headerRow = columns.map((c) => csvField(c.header)).join(",")
  const rows = toRows(data, columns).map((row) => row.map(csvField).join(","))
  const csv = [headerRow, ...rows].join("\r\n")
  // BOM so Excel opens UTF-8 (e.g. रू, non-Latin names) correctly instead of mojibake.
  const blob = new Blob(["﻿" + csv], { type: "text/csv;charset=utf-8;" })
  saveAs(blob, timestampedFilename(filename, "csv"))
}

export function exportTableToExcel<T>(data: T[], columns: ExportColumn<T>[], filename: string, sheetName = "Export"): void {
  const rows = data.map((row) => {
    const obj: Record<string, string | number> = {}
    for (const col of columns) obj[col.header] = col.value(row)
    return obj
  })
  const worksheet = XLSX.utils.json_to_sheet(rows)
  const workbook = XLSX.utils.book_new()
  XLSX.utils.book_append_sheet(workbook, worksheet, sheetName)
  const buffer = XLSX.write(workbook, { bookType: "xlsx", type: "array" })
  const blob = new Blob([buffer], { type: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet" })
  saveAs(blob, timestampedFilename(filename, "xlsx"))
}

export function exportTableToPdf<T>(
  data: T[],
  columns: ExportColumn<T>[],
  filename: string,
  title?: string
): void {
  const doc = new jsPDF({ orientation: columns.length > 6 ? "landscape" : "portrait" })
  if (title) {
    doc.setFontSize(14)
    doc.text(title, 14, 15)
  }
  autoTable(doc, {
    startY: title ? 20 : 10,
    head: [columns.map((c) => c.header)],
    body: toRows(data, columns),
    styles: { fontSize: 8, cellPadding: 2 },
    headStyles: { fillColor: [30, 41, 59] },
    margin: { left: 10, right: 10 },
  })
  doc.save(timestampedFilename(filename, "pdf"))
}
