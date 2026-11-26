/**
 * Generic export for any DataTable — CSV, Excel (.xlsx), and PDF — driven purely
 * by column headers + a plain-value getter per row, so it works for any table in
 * the app without a bespoke exporter per page (see components/ui/data-table.tsx).
 */
import * as XLSX from "xlsx"
import { saveAs } from "file-saver"
import { anyDevanagari, loadDevanagariFont, registerDevanagariFont } from "@/features/accounting/lib/pdf-fonts"
import { pdfText } from "@/features/accounting/lib/report-export"

export interface ExportColumn<T> {
  header: string
  value: (row: T) => string | number
}

/** A money value (the legacy UI types often carry decimals as strings) as a number for `exportValue`, so
 *  Excel stores a numeric cell instead of text. Missing or unparsable values become 0. */
export function exportAmount(value: string | number | null | undefined): number {
  const n = typeof value === "number" ? value : Number.parseFloat(value ?? "")
  return Number.isFinite(n) ? n : 0
}

function toRows<T>(data: T[], columns: ExportColumn<T>[]): string[][] {
  return data.map((row) => columns.map((c) => String(c.value(row) ?? "")))
}

function timestampedFilename(base: string, ext: string): string {
  const stamp = new Date().toISOString().slice(0, 10)
  return `${base}-${stamp}.${ext}`
}

/** A text cell starting with one of these is read as a formula by Excel/Sheets (CSV injection). */
const FORMULA_START = /^[=+\-@\t\r]/
/** A plain signed number written as text (e.g. "-50.00", "-1,234.5") is not a formula: left as-is so it stays numeric. */
const NUMERIC_TEXT = /^[+-]?\d[\d,]*(\.\d+)?$/

/** Quotes/escapes a CSV field per RFC 4180 — wraps in quotes and doubles any
 *  embedded quotes whenever the value contains a comma, quote, CR or LF. Text that
 *  would start a formula gets a leading `'`; numbers are left alone so negatives stay numeric. */
export function csvField(value: string | number | null | undefined): string {
  let text = value == null ? "" : String(value)
  if (typeof value === "string" && FORMULA_START.test(text) && !NUMERIC_TEXT.test(text)) text = `'${text}`
  if (/[",\r\n]/.test(text)) {
    return `"${text.replace(/"/g, '""')}"`
  }
  return text
}

/** The CSV body (no BOM): header row, then one CRLF-separated line per row. */
export function buildTableCsv<T>(data: T[], columns: ExportColumn<T>[]): string {
  const headerRow = columns.map((c) => csvField(c.header)).join(",")
  const rows = data.map((row) => columns.map((c) => csvField(c.value(row))).join(","))
  return [headerRow, ...rows].join("\r\n")
}

/** `timestamp: false` keeps `filename` as given (for names that already carry their own period dates). */
export function exportTableToCsv<T>(
  data: T[],
  columns: ExportColumn<T>[],
  filename: string,
  options: { timestamp?: boolean } = {}
): void {
  const csv = buildTableCsv(data, columns)
  // BOM so Excel opens UTF-8 (e.g. रू, non-Latin names) correctly instead of mojibake.
  const blob = new Blob(["﻿" + csv], { type: "text/csv;charset=utf-8;" })
  saveAs(blob, options.timestamp === false ? `${filename}.csv` : timestampedFilename(filename, "csv"))
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

export async function exportTableToPdf<T>(
  data: T[],
  columns: ExportColumn<T>[],
  filename: string,
  title?: string
): Promise<void> {
  const [{ default: JsPdf }, { default: autoTable }] = await Promise.all([import("jspdf"), import("jspdf-autotable")])
  const doc = new JsPdf({ orientation: columns.length > 6 ? "landscape" : "portrait" })
  const head = columns.map((c) => c.header)
  const body = toRows(data, columns)
  // Helvetica only covers WinAnsi: fetch the Devanagari font only when something printed needs it
  // (falls back to "?" for those characters if the font can't be loaded).
  const devanagariFont = anyDevanagari([title, ...head, ...body.flat()]) ? await loadDevanagariFont() : null
  const font = devanagariFont ? registerDevanagariFont(doc, devanagariFont) : "helvetica"
  const text = (value: string) => pdfText(value, devanagariFont !== null)
  doc.setFont(font, "normal")
  if (title) {
    doc.setFontSize(14)
    doc.text(text(title), 14, 15)
  }
  autoTable(doc, {
    startY: title ? 20 : 10,
    head: [head.map(text)],
    body: body.map((row) => row.map(text)),
    styles: { font, fontSize: 8, cellPadding: 2 },
    headStyles: { fillColor: [30, 41, 59] },
    margin: { left: 10, right: 10 },
  })
  doc.save(timestampedFilename(filename, "pdf"))
}
