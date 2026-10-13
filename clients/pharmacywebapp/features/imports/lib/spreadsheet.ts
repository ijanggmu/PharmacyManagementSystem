/**
 * Spreadsheet plumbing shared by the customer, supplier and stock imports: turn an uploaded .xlsx/.xls/.csv into
 * rows keyed by column key (with the user's row numbers kept, so errors point at the right line), build the
 * downloadable templates (a data sheet + an "Instructions" sheet), and parse the cell values. `xlsx` is imported
 * lazily so it only loads when someone actually imports or downloads.
 */
import { normalizeCsvDate } from "@/features/medicines/lib/csv-date"

/** One column of an import template. */
export interface ImportColumn {
  /** Stable key sent back in errors (matches the API's error `field`). */
  key: string
  /** Header text in the template. */
  label: string
  required?: boolean
  /** One line for the Instructions sheet. */
  help: string
  /** Other headers accepted for this column (case/space-insensitive). */
  aliases?: string[]
}

/** A data row of the uploaded file: cells keyed by column key, as text. */
export interface RawImportRow {
  /** The row number in the user's sheet (header row = 1). */
  rowNumber: number
  cells: Record<string, string>
}

export interface ImportFieldError {
  field: string
  message: string
}

/** A row after client-side mapping: the payload to send, plus the problems found before sending. */
export interface MappedRow<T> {
  rowNumber: number
  data: T
  errors: ImportFieldError[]
}

export interface ParsedSheet {
  rows: RawImportRow[]
  /** Headers that matched no column (shown as a hint, never an error). */
  unknownHeaders: string[]
  /** Required columns missing from the header row. */
  missingColumns: string[]
}

export const INSTRUCTIONS_SHEET = "Instructions"

/** "Opening Balance (Rs)*" → "opening_balance". */
export function normalizeHeader(header: string): string {
  return header
    .replace(/\(.*?\)/g, "")
    .replace(/[*:]/g, "")
    .trim()
    .toLowerCase()
    .replace(/[\s\-/.]+/g, "_")
    .replace(/^_+|_+$/g, "")
}

function headerLookup(columns: ImportColumn[]): Map<string, string> {
  const lookup = new Map<string, string>()
  for (const column of columns) {
    lookup.set(normalizeHeader(column.key), column.key)
    lookup.set(normalizeHeader(column.label), column.key)
    for (const alias of column.aliases ?? []) lookup.set(normalizeHeader(alias), column.key)
  }
  return lookup
}

function cellText(value: unknown): string {
  if (value === null || value === undefined) return ""
  return String(value).trim()
}

/**
 * The first non-empty row is the header; every later non-empty row is data. Row numbers are 1-based positions in
 * the sheet, so a blank line in the middle doesn't shift the numbers the user sees.
 */
export function rowsFromMatrix(matrix: unknown[][], columns: ImportColumn[]): ParsedSheet {
  const lookup = headerLookup(columns)
  const headerIndex = matrix.findIndex((row) => row.some((cell) => cellText(cell) !== ""))
  if (headerIndex < 0) return { rows: [], unknownHeaders: [], missingColumns: columns.filter((c) => c.required).map((c) => c.label) }

  const headerRow = matrix[headerIndex]
  const keys = headerRow.map((cell) => lookup.get(normalizeHeader(cellText(cell))) ?? null)
  const unknownHeaders = headerRow
    .map(cellText)
    .filter((text, i) => text !== "" && keys[i] === null)
  const present = new Set(keys.filter((k): k is string => k !== null))
  const missingColumns = columns.filter((c) => c.required && !present.has(c.key)).map((c) => c.label)

  const rows: RawImportRow[] = []
  for (let i = headerIndex + 1; i < matrix.length; i++) {
    const source = matrix[i] ?? []
    const cells: Record<string, string> = {}
    let any = false
    keys.forEach((key, col) => {
      if (!key) return
      const text = cellText(source[col])
      if (text !== "") any = true
      // A repeated header keeps its first non-empty value.
      if (!(key in cells) || cells[key] === "") cells[key] = text
    })
    if (any) rows.push({ rowNumber: i + 1, cells })
  }
  return { rows, unknownHeaders, missingColumns }
}

/** Reads the first sheet that isn't the Instructions sheet (Excel) or the CSV text. */
export async function readSpreadsheetFile(file: File, columns: ImportColumn[]): Promise<ParsedSheet> {
  const lower = file.name.toLowerCase()
  const XLSX = await import("xlsx")
  let workbook
  if (lower.endsWith(".csv") || lower.endsWith(".txt")) {
    // raw: keep every CSV cell as typed (no guessing of dates or numbers).
    workbook = XLSX.read(await file.text(), { type: "string", raw: true })
  } else if (lower.endsWith(".xlsx") || lower.endsWith(".xls")) {
    workbook = XLSX.read(await file.arrayBuffer(), { type: "array" })
  } else {
    throw new Error("Upload an Excel or CSV file (.xlsx, .xls or .csv).")
  }

  const sheetName =
    workbook.SheetNames.find((name) => name.trim().toLowerCase() !== INSTRUCTIONS_SHEET.toLowerCase()) ?? workbook.SheetNames[0]
  const sheet = sheetName ? workbook.Sheets[sheetName] : undefined
  if (!sheet) throw new Error("That file has no sheets.")

  // raw: false gives each cell as displayed; date cells with the default format come out as yyyy-mm-dd.
  const matrix = XLSX.utils.sheet_to_json<unknown[]>(sheet, { header: 1, raw: false, defval: "", blankrows: true, dateNF: "yyyy-mm-dd" })
  return rowsFromMatrix(matrix, columns)
}

/** A workbook to download: the data sheet first, then the Instructions sheet. */
export async function downloadWorkbook(fileName: string, sheets: { name: string; rows: (string | number)[][] }[]): Promise<void> {
  const XLSX = await import("xlsx")
  const workbook = XLSX.utils.book_new()
  for (const sheet of sheets) {
    const worksheet = XLSX.utils.aoa_to_sheet(sheet.rows)
    worksheet["!cols"] = (sheet.rows[0] ?? []).map((_, col) => ({
      wch: Math.min(60, Math.max(12, ...sheet.rows.map((row) => String(row[col] ?? "").length + 2))),
    }))
    XLSX.utils.book_append_sheet(workbook, worksheet, sheet.name)
  }
  XLSX.writeFile(workbook, fileName)
}

/** Template rows: header, example rows; plus the Instructions sheet describing each column. */
export function templateSheets(
  columns: ImportColumn[],
  examples: (string | number)[][],
  notes: string[],
): { name: string; rows: (string | number)[][] }[] {
  return [
    { name: "Data", rows: [columns.map((c) => c.label), ...examples] },
    {
      name: INSTRUCTIONS_SHEET,
      rows: [
        ["Column", "Required", "What to enter"],
        ...columns.map((c) => [c.label, c.required ? "Yes" : "No", c.help]),
        [],
        ["Notes"],
        ...notes.map((note) => [note]),
      ],
    },
  ]
}

// ---- cell parsers -------------------------------------------------------------------------------------------

export type CellResult<T> = { value: T; error: string | null }

/** Trimmed text, or undefined when blank. */
export function textCell(value: string | undefined): string | undefined {
  const text = (value ?? "").trim()
  return text === "" ? undefined : text
}

/** "1,250.50", "Rs 1250.5", "(300)" (accounting negative) → number; blank → undefined. */
export function numberCell(value: string | undefined, label: string): CellResult<number | undefined> {
  let text = (value ?? "").trim()
  if (text === "") return { value: undefined, error: null }
  let negative = false
  if (/^\(.*\)$/.test(text)) {
    negative = true
    text = text.slice(1, -1)
  }
  text = text.replace(/^(rs\.?|npr|रु\.?)\s*/i, "").replace(/,/g, "").replace(/\s+/g, "")
  if (!/^-?\d+(\.\d+)?$/.test(text)) return { value: undefined, error: `${label} "${value?.trim()}" is not a number.` }
  const n = Number(text)
  return { value: negative ? -n : n, error: null }
}

/** Whole number; blank → undefined. */
export function integerCell(value: string | undefined, label: string): CellResult<number | undefined> {
  const parsed = numberCell(value, label)
  if (parsed.error || parsed.value === undefined) return parsed
  if (!Number.isInteger(parsed.value)) return { value: undefined, error: `${label} must be a whole number.` }
  return parsed
}

/** A date as yyyy-mm-dd (see normalizeCsvDate for what's accepted); blank → undefined. */
export function dateCell(value: string | undefined, label: string): CellResult<string | undefined> {
  const { ymd, error } = normalizeCsvDate(value, label)
  return { value: ymd ?? undefined, error }
}

/** Collects parser errors against their column. */
export function collect<T>(errors: ImportFieldError[], field: string, result: CellResult<T>): T {
  if (result.error) errors.push({ field, message: result.error })
  return result.value
}
