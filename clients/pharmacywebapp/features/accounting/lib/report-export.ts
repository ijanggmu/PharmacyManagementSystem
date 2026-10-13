/**
 * PDF and Excel export for the accounting reports (trial balance, P&L, balance sheet, cash flow, general ledger,
 * aging). One document model drives both formats: a pharmacy letterhead (name, PAN/VAT, address), the report
 * title, the period in BS and AD, and a table whose amount columns are right-aligned with Nepali digit grouping.
 * PDF pages carry "Page x of y"; Excel cells keep real numbers with a number format, so totals still add up.
 *
 * Reuses the libraries the DataTable export already ships (jspdf + jspdf-autotable, xlsx, file-saver). The pure
 * builders (header lines, number formatting, sheet layout) are exported for unit tests.
 */

import { formatBsLong } from "./date-presets"
import { formatPrintAmount, type PrintProfile } from "./voucher-print"

export type ReportColumnKind = "text" | "amount" | "percent"

export interface ReportColumn {
  header: string
  kind?: ReportColumnKind
  /** Relative width hint for the spreadsheet (characters). */
  width?: number
}

/** `section` heads a block, `subtotal` / `total` are ruled and bold, `muted` is a note line. */
export type ReportRowStyle = "normal" | "section" | "subtotal" | "total" | "muted"

export type ReportCell = string | number | null | undefined

export interface ReportRow {
  cells: ReportCell[]
  style?: ReportRowStyle
}

export type ReportPeriod = { kind: "range"; from: string; to: string } | { kind: "asOf"; date: string }

export interface ReportDocument {
  title: string
  /** Second title line, e.g. the account of a general ledger. */
  subtitle?: string | null
  profile: PrintProfile
  period: ReportPeriod
  /** Branch the figures were filtered to; omitted or null = all branches. */
  branchName?: string | null
  columns: ReportColumn[]
  rows: ReportRow[]
  /** Lines printed under the table (check lines, basis notes). */
  notes?: string[]
  /** Defaults to now; passed in for deterministic tests. */
  generatedAt?: Date
}

/** Accounting format: Nepali digit grouping, two decimals, negatives in brackets — 1,23,456.70 / (1,250.00). */
export function formatReportAmount(value: number | null | undefined): string {
  if (value == null || !Number.isFinite(value)) return ""
  const rounded = Number(value.toFixed(2))
  if (rounded === 0) return "-"
  const text = formatPrintAmount(Math.abs(rounded))
  return rounded < 0 ? `(${text})` : text
}

/** "12.5%" with one decimal; empty for null (no comparison base). */
export function formatReportPercent(value: number | null | undefined): string {
  if (value == null || !Number.isFinite(value)) return ""
  return `${value.toFixed(1)}%`
}

function formatAdLong(ymd: string): string {
  const [y, m, d] = ymd.slice(0, 10).split("-").map(Number)
  if (!y || !m || !d) return ymd
  return new Date(y, m - 1, d).toLocaleDateString("en-GB", { day: "numeric", month: "short", year: "numeric" })
}

/** The period in BS (first) and AD, e.g. "For the period 1 Shrawan 2083 – 31 Ashwin 2083 (BS) · 17 Jul 2026 – 17 Oct 2026 (AD)". */
export function reportPeriodLine(period: ReportPeriod): string {
  if (period.kind === "asOf") {
    return `As at ${formatBsLong(period.date)} (BS) · ${formatAdLong(period.date)} (AD)`
  }
  return `For the period ${formatBsLong(period.from)} – ${formatBsLong(period.to)} (BS) · ${formatAdLong(period.from)} – ${formatAdLong(period.to)} (AD)`
}

/** Letterhead and title lines, top to bottom. */
export function reportHeaderLines(doc: Pick<ReportDocument, "profile" | "title" | "subtitle" | "period" | "branchName">): string[] {
  const { profile } = doc
  const lines: string[] = [profile.name]
  if (profile.legalName && profile.legalName !== profile.name) lines.push(profile.legalName)
  if (profile.address) lines.push(profile.address)
  const contact = [profile.panVat ? `PAN/VAT: ${profile.panVat}` : null, profile.phone ? `Phone: ${profile.phone}` : null]
    .filter(Boolean)
    .join("   ")
  if (contact) lines.push(contact)
  lines.push(doc.title)
  if (doc.subtitle) lines.push(doc.subtitle)
  lines.push(reportPeriodLine(doc.period))
  lines.push(doc.branchName ? `Branch: ${doc.branchName}` : "All branches")
  return lines
}

/** Text for one cell in the PDF. */
export function formatReportCell(value: ReportCell, kind: ReportColumnKind = "text"): string {
  if (value == null) return ""
  if (typeof value === "number") return kind === "percent" ? formatReportPercent(value) : formatReportAmount(value)
  return value
}

/** Spreadsheet number formats: brackets for negatives, a dash for zero (as in the PDF). */
export const XLSX_AMOUNT_FORMAT = "#,##0.00;(#,##0.00);\"-\""
export const XLSX_PERCENT_FORMAT = "0.0%"

export interface SheetLayout {
  /** Array of rows for XLSX.utils.aoa_to_sheet. Percent cells are fractions (12.5% → 0.125). */
  aoa: (string | number)[][]
  /** Row index of the table header. */
  headerRow: number
  /** Number format per numeric cell, as [row, col, format]. */
  formats: Array<[number, number, string]>
  /** Header lines merged across the table width. */
  merges: Array<{ s: { r: number; c: number }; e: { r: number; c: number } }>
  colWidths: number[]
}

/** Lays out a report for a worksheet: letterhead lines, a blank row, the table, then notes and the timestamp. */
export function buildSheetLayout(doc: ReportDocument): SheetLayout {
  const width = Math.max(doc.columns.length, 1)
  const aoa: (string | number)[][] = []
  const merges: SheetLayout["merges"] = []
  for (const line of reportHeaderLines(doc)) {
    merges.push({ s: { r: aoa.length, c: 0 }, e: { r: aoa.length, c: width - 1 } })
    aoa.push([line])
  }
  aoa.push([])
  const headerRow = aoa.length
  aoa.push(doc.columns.map((c) => c.header))
  const formats: SheetLayout["formats"] = []
  for (const row of doc.rows) {
    const r = aoa.length
    aoa.push(
      doc.columns.map((col, c) => {
        const value = row.cells[c]
        if (value == null) return ""
        if (typeof value === "number") {
          const kind = col.kind ?? "amount"
          formats.push([r, c, kind === "percent" ? XLSX_PERCENT_FORMAT : XLSX_AMOUNT_FORMAT])
          return kind === "percent" ? Number((value / 100).toFixed(6)) : Number(value.toFixed(2))
        }
        return value
      }),
    )
  }
  if (doc.notes?.length) {
    aoa.push([])
    for (const note of doc.notes) aoa.push([note])
  }
  aoa.push([])
  aoa.push([`Generated ${formatGeneratedAt(doc.generatedAt ?? new Date())}`])
  const colWidths = doc.columns.map((col, c) => {
    if (col.width) return col.width
    const longest = Math.max(col.header.length, ...doc.rows.map((row) => formatReportCell(row.cells[c], col.kind).length))
    return Math.min(Math.max(longest + 2, col.kind && col.kind !== "text" ? 14 : 10), 60)
  })
  return { aoa, headerRow, formats, merges, colWidths }
}

function formatGeneratedAt(d: Date): string {
  return d.toLocaleString("en-GB", { day: "2-digit", month: "short", year: "numeric", hour: "2-digit", minute: "2-digit" })
}

/** Safe, dated file name, e.g. "profit-and-loss_2026-07-17_2026-10-17.pdf" (AD dates of the period). */
export function reportFilename(base: string, period: ReportPeriod, ext: "pdf" | "xlsx"): string {
  const slug = base.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "") || "report"
  const dates = period.kind === "asOf" ? [period.date] : [period.from, period.to]
  return `${slug}_${dates.join("_")}.${ext}`
}

/** Downloads the report as an .xlsx workbook (one sheet). */
export async function exportReportXlsx(doc: ReportDocument, baseName: string): Promise<void> {
  const [XLSX, { saveAs }] = await Promise.all([import("xlsx"), import("file-saver")])
  const layout = buildSheetLayout(doc)
  const sheet = XLSX.utils.aoa_to_sheet(layout.aoa)
  for (const [r, c, z] of layout.formats) {
    const cell = sheet[XLSX.utils.encode_cell({ r, c })]
    if (cell) cell.z = z
  }
  sheet["!merges"] = layout.merges
  sheet["!cols"] = layout.colWidths.map((wch) => ({ wch }))
  const book = XLSX.utils.book_new()
  XLSX.utils.book_append_sheet(book, sheet, doc.title.slice(0, 31).replace(/[\\/?*[\]:]/g, " "))
  const buffer = XLSX.write(book, { bookType: "xlsx", type: "array" })
  saveAs(
    new Blob([buffer], { type: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet" }),
    reportFilename(baseName, doc.period, "xlsx"),
  )
}

const TOTAL_PAGES = "{total_pages_count_string}"

/**
 * jsPDF's built-in fonts only cover WinAnsi: map the few typographic characters the reports use that fall outside
 * it (minus sign, narrow spaces) and replace anything else non-Latin (e.g. Devanagari names) with "?".
 */
export function pdfText(text: string): string {
  return text
    .replace(/−/g, "-")
    .replace(/[   ]/g, " ")
    .replace(/[^\t\n\r\x20-\x7e\xa0-\xff–—‘’“”•…€]/g, "?")
}

/** Downloads the report as a PDF: letterhead on page 1, repeated table header, "Page x of y" on every page. */
export async function exportReportPdf(doc: ReportDocument, baseName: string): Promise<void> {
  const [{ default: JsPdf }, { default: autoTable }] = await Promise.all([import("jspdf"), import("jspdf-autotable")])
  const landscape = doc.columns.length > 6
  const pdf = new JsPdf({ orientation: landscape ? "landscape" : "portrait", unit: "mm", format: "a4" })
  const pageWidth = pdf.internal.pageSize.getWidth()
  const pageHeight = pdf.internal.pageSize.getHeight()
  const margin = 12

  // Letterhead: name large and bold, then smaller lines; the title bold again.
  const header = reportHeaderLines(doc)
  const titleIndex = header.indexOf(doc.title)
  let y = 14
  header.forEach((line, i) => {
    const isName = i === 0
    const isTitle = i === titleIndex
    pdf.setFont("helvetica", isName || isTitle ? "bold" : "normal")
    pdf.setFontSize(isName ? 14 : isTitle ? 12 : 9)
    if (isTitle) y += 2
    pdf.text(pdfText(line), pageWidth / 2, y, { align: "center" })
    y += isName ? 6 : isTitle ? 6 : 4.5
  })

  const kinds = doc.columns.map((c) => c.kind ?? "text")
  autoTable(pdf, {
    startY: y + 2,
    head: [doc.columns.map((c) => pdfText(c.header))],
    body: doc.rows.map((row) => doc.columns.map((_, c) => pdfText(formatReportCell(row.cells[c], kinds[c])))),
    theme: "plain",
    styles: { fontSize: 8, cellPadding: 1.4, overflow: "linebreak" },
    headStyles: { fontStyle: "bold", fillColor: [241, 245, 249], textColor: [15, 23, 42], lineWidth: { bottom: 0.3 }, lineColor: [100, 116, 139] },
    columnStyles: Object.fromEntries(kinds.map((k, i) => [i, { halign: k === "text" ? "left" : "right" }])),
    margin: { left: margin, right: margin, bottom: 16 },
    didParseCell: (data) => {
      if (data.section !== "body") return
      const style = doc.rows[data.row.index]?.style ?? "normal"
      if (style === "section") {
        data.cell.styles.fontStyle = "bold"
        data.cell.styles.fillColor = [248, 250, 252]
      } else if (style === "subtotal" || style === "total") {
        data.cell.styles.fontStyle = "bold"
        data.cell.styles.lineWidth = style === "total" ? { top: 0.4, bottom: 0.6 } : { top: 0.2 }
        data.cell.styles.lineColor = [71, 85, 105]
      } else if (style === "muted") {
        data.cell.styles.textColor = [100, 116, 139]
        data.cell.styles.fontStyle = "italic"
      }
    },
    didDrawPage: () => {
      const page = pdf.getCurrentPageInfo().pageNumber
      pdf.setFont("helvetica", "normal")
      pdf.setFontSize(8)
      pdf.setTextColor(100, 116, 139)
      pdf.text(pdfText(`${doc.profile.name} · ${doc.title}`), margin, pageHeight - 8)
      pdf.text(`Page ${page} of ${TOTAL_PAGES}`, pageWidth - margin, pageHeight - 8, { align: "right" })
      pdf.setTextColor(0, 0, 0)
    },
  })

  const lastTable = (pdf as unknown as { lastAutoTable?: { finalY: number } }).lastAutoTable
  let noteY = (lastTable?.finalY ?? y) + 6
  pdf.setFont("helvetica", "normal")
  pdf.setFontSize(8)
  for (const note of [...(doc.notes ?? []), `Generated ${formatGeneratedAt(doc.generatedAt ?? new Date())}`]) {
    if (noteY > pageHeight - 18) {
      pdf.addPage()
      noteY = 16
    }
    const wrapped = pdf.splitTextToSize(pdfText(note), pageWidth - margin * 2) as string[]
    pdf.text(wrapped, margin, noteY)
    noteY += 4.5 * wrapped.length
  }

  if (typeof pdf.putTotalPages === "function") pdf.putTotalPages(TOTAL_PAGES)
  pdf.save(reportFilename(baseName, doc.period, "pdf"))
}
