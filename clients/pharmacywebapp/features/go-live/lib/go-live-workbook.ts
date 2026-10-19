/**
 * The go-live workbook: one Excel file with what a pharmacy brings on its first day — medicines with the stock on the
 * shelf (owned or consigned), and, when the owner says they have any, suppliers (what is still owed to them) and
 * customers (udharo still owed). Cash and bank are typed on the page; an older file's "Cash & bank" sheet is still read.
 * Pure helpers only: building the template the owner's answers ask for, reading the sheets, and turning rows into the
 * requests the existing imports and opening balances take. The page (go-live-setup.tsx) runs them in order.
 */
import {
  CUSTOMER_IMPORT_COLUMNS,
  CUSTOMER_IMPORT_EXAMPLES,
  mapCustomerRows,
  type CustomerImportRowDto,
} from "@/features/imports/lib/customer-import"
import {
  INSTRUCTIONS_SHEET,
  collect,
  normalizeHeader,
  numberCell,
  integerCell,
  rowsFromMatrix,
  textCell,
  type ImportColumn,
  type MappedRow,
  type ParsedSheet,
  type RawImportRow,
} from "@/features/imports/lib/spreadsheet"
import { STOCK_IMPORT_COLUMNS, mapStockRows, type StockImportRowDto } from "@/features/imports/lib/stock-import"
import {
  SUPPLIER_IMPORT_COLUMNS,
  SUPPLIER_IMPORT_EXAMPLES,
  mapSupplierRows,
  type SupplierImportRowDto,
} from "@/features/imports/lib/supplier-import"

export type GoLiveSection = "suppliers" | "customers" | "stock" | "balances"

export const GO_LIVE_SHEETS: Record<GoLiveSection, string> = {
  suppliers: "Suppliers",
  customers: "Customers",
  stock: "Medicines & stock",
  balances: "Cash & bank",
}

/** A stock row of the go-live file: the stock import's row plus what a new medicine needs and the consignment supplier. */
export interface GoLiveStockRowDto extends StockImportRowDto {
  genericName?: string
  isTaxable?: boolean
  unitsPerPack?: number
  reorderLevel?: number
  /** As typed; resolved to an id once the suppliers exist (blank = the pharmacy's own stock). */
  consignmentSupplierName?: string
  consignmentSupplierId?: string
}

// The party sheets take their opening date from the go-live date, so the per-row "As of date" column is left out.
const withoutAsOf = (columns: ImportColumn[]) => columns.filter((c) => c.key !== "as_of_date")

export const GO_LIVE_SUPPLIER_COLUMNS = withoutAsOf(SUPPLIER_IMPORT_COLUMNS).map((c) =>
  c.key === "opening_balance"
    ? {
        ...c,
        label: "Amount you still owe them",
        help: "Unpaid bills to this supplier on your start date, in rupees. Leave blank if nothing is owed.",
        aliases: [...(c.aliases ?? []), "opening payable", "amount you owe them"],
      }
    : c.key === "name"
      ? { ...c, label: "Supplier name", aliases: [...(c.aliases ?? []), "name"] }
      : c,
)

export const GO_LIVE_CUSTOMER_COLUMNS = withoutAsOf(CUSTOMER_IMPORT_COLUMNS).map((c) =>
  c.key === "opening_balance"
    ? {
        ...c,
        label: "Amount they still owe you",
        help: "Udharo this customer still owes on your start date, in rupees.",
        aliases: [...(c.aliases ?? []), "opening balance", "amount they owe you", "udharo"],
      }
    : c.key === "name"
      ? { ...c, label: "Customer name", aliases: [...(c.aliases ?? []), "name"] }
      : c,
)

const stockColumn = (key: string) => STOCK_IMPORT_COLUMNS.find((c) => c.key === key)!

export const GO_LIVE_STOCK_COLUMNS: ImportColumn[] = [
  { ...stockColumn("medicine_name"), help: "The medicine's name, e.g. Cetamol 500mg. A medicine not in your list yet is added from this row." },
  { key: "generic_name", label: "Generic name", help: "For a new medicine, e.g. Paracetamol.", aliases: ["generic"] },
  stockColumn("strength"),
  { ...stockColumn("form"), help: "e.g. Tablet, Capsule, Syrup. Blank = Other." },
  stockColumn("barcode"),
  stockColumn("batch_no"),
  stockColumn("expiry_date"),
  {
    ...stockColumn("quantity"),
    required: false,
    help: "How many units are on your shelf. Leave blank for a medicine you sell but have none of today.",
  },
  { ...stockColumn("cost_price"), required: false, help: "What you paid per unit, in rupees. Blank = 0." },
  {
    ...stockColumn("selling_price"),
    label: "MRP",
    help: "Selling price per unit. Needed for a medicine not in your list yet.",
    aliases: ["selling price", "sale price", "price"],
  },
  { key: "vat", label: "VAT", help: "Yes if the medicine carries VAT, No if exempt. Blank = Yes. Used for a new medicine.", aliases: ["taxable", "vat applicable"] },
  { key: "units_per_pack", label: "Pack size", help: "Units in one strip / pack, e.g. 10. Optional.", aliases: ["units per pack", "pack"] },
  { key: "reorder_level", label: "Reorder level", help: "Flag as low stock at or below this quantity. Optional.", aliases: ["minimum stock", "reorder"] },
  stockColumn("rack"),
  {
    key: "consignment_supplier",
    label: "Supplier who owns this stock",
    help: "Leave empty for your own stock. For a supplier's stock that you pay for only after it sells, write the supplier's name.",
    aliases: ["consignment supplier", "consignment", "consigned by"],
  },
]

export const GO_LIVE_BALANCE_COLUMNS: ImportColumn[] = [
  { key: "account", label: "Account", required: true, help: "Keep the two rows: Cash in hand and Bank balance." },
  { key: "amount", label: "Amount", required: true, help: "What you hold on the go-live date, in rupees (0 if none)." },
]

/** What the owner said applies to them: the template has only those sheets and columns. */
export interface GoLiveTemplateOptions {
  /** They owe suppliers money today. */
  suppliers: boolean
  /** Customers owe them money (udharo) today. */
  customers: boolean
  /** They keep a supplier's stock that is paid for only after it sells. */
  consignment: boolean
  /** "simple": the few columns most pharmacies fill; "full": every column (barcode, batch, VAT, …). */
  detail: "simple" | "full"
}

export const DEFAULT_TEMPLATE_OPTIONS: GoLiveTemplateOptions = { suppliers: true, customers: true, consignment: false, detail: "simple" }

const SIMPLE_KEYS: Record<"suppliers" | "customers" | "stock", string[]> = {
  suppliers: ["name", "phone", "pan", "opening_balance"],
  customers: ["name", "phone", "opening_balance"],
  stock: ["medicine_name", "form", "selling_price", "quantity", "cost_price", "expiry_date"],
}

/** Columns marked "*" in the template header: the ones every row needs. */
const MUST_FILL = new Set(["suppliers:name", "customers:name", "stock:medicine_name", "stock:selling_price"])

/** A row whose name starts with this is one of the template's examples and is never imported. */
export const EXAMPLE_PREFIX = "Example: "

const isExampleRow = (row: RawImportRow) =>
  (row.cells.name ?? row.cells.medicine_name ?? "").trim().toLowerCase().startsWith(EXAMPLE_PREFIX.trim().toLowerCase())

const exampleRecords = (columns: ImportColumn[], rows: (string | number)[][]) =>
  rows.map((row) => Object.fromEntries(columns.map((c, i) => [c.key, row[i] ?? ""])) as Record<string, string | number>)

const STOCK_EXAMPLES: Record<string, string | number>[] = [
  {
    medicine_name: "Cetamol 500mg", generic_name: "Paracetamol", strength: "500mg", form: "Tablet", batch_no: "CTM-2401",
    expiry_date: "2027-06-30", quantity: 500, cost_price: 1.2, selling_price: 2, vat: "No", units_per_pack: 10, reorder_level: 50, rack: "A1",
  },
  {
    medicine_name: "Amoxil 500mg", generic_name: "Amoxicillin", strength: "500mg", form: "Capsule", barcode: "8901234567890",
    batch_no: "AMX-77", expiry_date: "2027-01-31", quantity: 120, cost_price: 6.5, selling_price: 9, vat: "Yes", units_per_pack: 10,
    reorder_level: 20, rack: "B3",
  },
  // No quantity: the medicine is added to the list with no stock.
  { medicine_name: "Vitamin C 500mg", generic_name: "Ascorbic acid", strength: "500mg", form: "Tablet", selling_price: 5 },
]

const CONSIGNED_EXAMPLE: Record<string, string | number> = {
  medicine_name: "Insulin Glargine", generic_name: "Insulin glargine", strength: "100IU", form: "Injection", batch_no: "INS-C1",
  expiry_date: "2027-08-31", quantity: 10, cost_price: 1100, selling_price: 1500, vat: "Yes", units_per_pack: 1, reorder_level: 2,
  rack: "Fridge", consignment_supplier: "Himal Drug House",
}

/** Plain "add / don't add" guidance per sheet, shown on the page (translated) and in the Instructions sheet. */
export const GO_LIVE_GUIDE: Record<"suppliers" | "customers" | "stock", { add: string; dontAdd: string }> = {
  stock: {
    add: "Every medicine on your shelf today, one row per batch. Medicines you sell but have none of today (leave Quantity blank).",
    dontAdd: "Expired medicines. Stock you are returning to the supplier. Medicines you no longer sell.",
  },
  suppliers: {
    add: "Each supplier you still owe money to, with the unpaid amount on your start date.",
    dontAdd: "Bills you have already paid. Old bill history. Orders that haven't arrived.",
  },
  customers: {
    add: "Each customer who still owes you money (udharo), with the amount on your start date.",
    dontAdd: "Customers who have paid everything. Your own personal loans.",
  },
}

function columnsFor(section: "suppliers" | "customers" | "stock", options: GoLiveTemplateOptions): ImportColumn[] {
  const all = COLUMNS[section].filter((c) => options.consignment || c.key !== "consignment_supplier")
  if (options.detail === "full") return all
  const keys = [...SIMPLE_KEYS[section], ...(section === "stock" && options.consignment ? ["consignment_supplier"] : [])]
  return keys.map((k) => all.find((c) => c.key === k)!).filter(Boolean)
}

const headerLabel = (section: GoLiveSection, column: ImportColumn) => (MUST_FILL.has(`${section}:${column.key}`) ? `${column.label} *` : column.label)

/**
 * The workbook to download: the sheets the owner's answers need (medicines always), each with a header row marking
 * the must-fill columns with "*" and a few "Example: …" rows (never imported), then the Instructions sheet.
 */
export function goLiveTemplateSheets(options: GoLiveTemplateOptions = DEFAULT_TEMPLATE_OPTIONS): { name: string; rows: (string | number)[][] }[] {
  const sections = (["stock", "suppliers", "customers"] as const).filter((s) => s === "stock" || options[s])
  const examples: Record<(typeof sections)[number], Record<string, string | number>[]> = {
    stock: [...STOCK_EXAMPLES, ...(options.consignment ? [CONSIGNED_EXAMPLE] : [])],
    suppliers: exampleRecords(SUPPLIER_IMPORT_COLUMNS, SUPPLIER_IMPORT_EXAMPLES),
    customers: exampleRecords(CUSTOMER_IMPORT_COLUMNS, CUSTOMER_IMPORT_EXAMPLES),
  }
  const nameKey = (section: (typeof sections)[number]) => (section === "stock" ? "medicine_name" : "name")

  const dataSheets = sections.map((section) => {
    const columns = columnsFor(section, options)
    return {
      name: GO_LIVE_SHEETS[section],
      rows: [
        columns.map((c) => headerLabel(section, c)),
        ...examples[section].map((example) =>
          columns.map((c) => (c.key === nameKey(section) ? `${EXAMPLE_PREFIX}${example[c.key] ?? ""}` : (example[c.key] ?? ""))),
        ),
      ],
    }
  })

  const instructions: (string | number)[][] = [
    ["How to fill this file"],
    ["Write one row per item under the header. Delete the grey \"Example: …\" rows, or leave them — they are never imported."],
    ["Columns marked * must be filled. Every other column can be left blank."],
    ["Everything is saved on the start date you choose on the Go-live page. Nothing is saved until you press Go live."],
    ["Cash in hand and the bank balance are typed on the page, not in this file."],
    [],
  ]
  for (const section of sections) {
    const columns = columnsFor(section, options)
    instructions.push(
      [GO_LIVE_SHEETS[section]],
      ["Add", GO_LIVE_GUIDE[section].add],
      ["Don't add", GO_LIVE_GUIDE[section].dontAdd],
      ["Column", "Must fill?", "What to write"],
      ...columns.map((c) => [c.label, MUST_FILL.has(`${section}:${c.key}`) ? "Yes" : "No", c.help]),
      [],
    )
  }

  return [...dataSheets, { name: INSTRUCTIONS_SHEET, rows: instructions }]
}

export type GoLiveSheets = Record<GoLiveSection, ParsedSheet>

const COLUMNS: Record<GoLiveSection, ImportColumn[]> = {
  suppliers: GO_LIVE_SUPPLIER_COLUMNS,
  customers: GO_LIVE_CUSTOMER_COLUMNS,
  stock: GO_LIVE_STOCK_COLUMNS,
  balances: GO_LIVE_BALANCE_COLUMNS,
}

export function goLiveColumns(section: GoLiveSection): ImportColumn[] {
  return COLUMNS[section]
}

const EMPTY_SHEET: ParsedSheet = { rows: [], unknownHeaders: [], missingColumns: [] }

/** Each section's sheet, found by name (case, spaces and "&"/"and" don't matter); a missing sheet is empty. */
export function sheetsFromMatrices(matrices: Record<string, unknown[][]>): GoLiveSheets {
  const byName = new Map(Object.entries(matrices).map(([name, matrix]) => [sheetKey(name), matrix]))
  const read = (section: GoLiveSection) => {
    const matrix = byName.get(sheetKey(GO_LIVE_SHEETS[section]))
    if (!matrix) return EMPTY_SHEET
    const sheet = rowsFromMatrix(matrix, COLUMNS[section])
    return { ...sheet, rows: sheet.rows.filter((r) => !isExampleRow(r)) }
  }
  return { suppliers: read("suppliers"), customers: read("customers"), stock: read("stock"), balances: read("balances") }
}

function sheetKey(name: string): string {
  return normalizeHeader(name.replace(/&/g, " and "))
}

/** Reads every sheet of the uploaded workbook. */
export async function readGoLiveWorkbook(file: File): Promise<GoLiveSheets> {
  if (!/\.(xlsx|xls)$/i.test(file.name)) throw new Error("Upload the go-live Excel file (.xlsx).")
  const XLSX = await import("xlsx")
  const workbook = XLSX.read(await file.arrayBuffer(), { type: "array", dateNF: "yyyy-mm-dd" })
  const matrices: Record<string, unknown[][]> = {}
  for (const name of workbook.SheetNames) {
    const sheet = workbook.Sheets[name]
    if (sheet) {
      matrices[name] = XLSX.utils.sheet_to_json<unknown[]>(sheet, { header: 1, raw: false, defval: "", blankrows: true, dateNF: "yyyy-mm-dd" })
    }
  }
  const sheets = sheetsFromMatrices(matrices)
  if (Object.values(sheets).every((s) => s.rows.length === 0)) {
    throw new Error("That file has nothing filled in yet (example rows are skipped). Add your medicines under the header and upload again.")
  }
  return sheets
}

/** What a row is, for the problem list: the medicine, supplier or customer name as typed (or the barcode). */
export function rowName(section: GoLiveSection, row: RawImportRow | undefined): string | undefined {
  if (!row) return undefined
  if (section === "stock") return textCell(row.cells.medicine_name) ?? textCell(row.cells.barcode)
  if (section === "balances") return textCell(row.cells.account)
  return textCell(row.cells.name)
}

export function mapGoLiveSuppliers(rows: RawImportRow[], goLiveDate: string): MappedRow<SupplierImportRowDto>[] {
  return mapSupplierRows(rows).map((r) => ({ ...r, data: { ...r.data, asOfDate: goLiveDate } }))
}

export function mapGoLiveCustomers(rows: RawImportRow[], goLiveDate: string): MappedRow<CustomerImportRowDto>[] {
  return mapCustomerRows(rows).map((r) => ({ ...r, data: { ...r.data, asOfDate: goLiveDate } }))
}

export function mapGoLiveStock(rows: RawImportRow[]): MappedRow<GoLiveStockRowDto>[] {
  const base = mapStockRows(rows, { allowCardOnly: true })
  return base.map((mapped, i) => {
    const cells = rows[i].cells
    const errors = [...mapped.errors]
    const vat = textCell(cells.vat)?.toLowerCase()
    let isTaxable: boolean | undefined
    if (vat !== undefined) {
      if (["yes", "y", "true", "1", "vat"].includes(vat)) isTaxable = true
      else if (["no", "n", "false", "0", "exempt"].includes(vat)) isTaxable = false
      else errors.push({ field: "vat", message: `VAT "${cells.vat}" — write Yes or No.` })
    }
    const unitsPerPack = collect(errors, "units_per_pack", integerCell(cells.units_per_pack, "Pack size"))
    if (unitsPerPack !== undefined && unitsPerPack < 1) errors.push({ field: "units_per_pack", message: "Pack size must be 1 or more." })
    const reorderLevel = collect(errors, "reorder_level", numberCell(cells.reorder_level, "Reorder level"))
    if (reorderLevel !== undefined && reorderLevel < 0) errors.push({ field: "reorder_level", message: "Reorder level can't be negative." })
    return {
      ...mapped,
      errors,
      data: {
        ...mapped.data,
        genericName: textCell(cells.generic_name),
        isTaxable,
        unitsPerPack,
        reorderLevel,
        consignmentSupplierName: textCell(cells.consignment_supplier),
      },
    }
  })
}

export interface GoLiveBalances {
  cash: number
  bank: number
  errors: { rowNumber: number; message: string }[]
}

/** Cash and bank from an older file's "Cash & bank" sheet: rows whose account says cash / bank. */
export function mapGoLiveBalances(rows: RawImportRow[]): GoLiveBalances {
  const result: GoLiveBalances = { cash: 0, bank: 0, errors: [] }
  for (const { rowNumber, cells } of rows) {
    const account = (cells.account ?? "").toLowerCase()
    const kind = account.includes("cash") ? "cash" : account.includes("bank") ? "bank" : null
    const amount = numberCell(cells.amount, "Amount")
    if (!kind) {
      result.errors.push({ rowNumber, message: `"${cells.account}" — use the rows "Cash in hand" and "Bank balance".` })
    } else if (amount.error) {
      result.errors.push({ rowNumber, message: amount.error })
    } else if ((amount.value ?? 0) < 0) {
      result.errors.push({ rowNumber, message: "The amount can't be negative." })
    } else {
      result[kind] += amount.value ?? 0
    }
  }
  return result
}

/** Consignment supplier names in the stock sheet, de-duplicated (case and spaces ignored), as first typed. */
export function consignmentSupplierNames(rows: GoLiveStockRowDto[]): string[] {
  const seen = new Map<string, string>()
  for (const r of rows) {
    if (r.consignmentSupplierName) seen.set(supplierKey(r.consignmentSupplierName), r.consignmentSupplierName)
  }
  return [...seen.values()]
}

export function supplierKey(name: string): string {
  return name.trim().replace(/\s+/g, " ").toLowerCase()
}

/**
 * Gives each consigned row its supplier id. A name that is neither an existing supplier nor on the Suppliers sheet
 * is a problem with that row. `ids` maps supplierKey(name) to an id (for a preview, a stand-in id for a supplier
 * the sheet will create).
 */
export function resolveConsignmentSuppliers(
  rows: MappedRow<GoLiveStockRowDto>[],
  ids: ReadonlyMap<string, string>,
): MappedRow<GoLiveStockRowDto>[] {
  return rows.map((r) => {
    const name = r.data.consignmentSupplierName
    if (!name) return r
    const id = ids.get(supplierKey(name))
    if (!id) {
      return {
        ...r,
        errors: [
          ...r.errors,
          { field: "consignment_supplier", message: `No supplier "${name}" — add it to the Suppliers sheet or fix the name.` },
        ],
      }
    }
    return { ...r, data: { ...r.data, consignmentSupplierId: id } }
  })
}

/**
 * The uploaded sheets again, each with a first "Problem" column holding that row's messages (blank when the row is
 * fine), so the owner can fix everything in Excel and upload the same file. The Problem column is ignored on upload.
 */
export function problemSheets(
  sheets: GoLiveSheets,
  messages: ReadonlyMap<GoLiveSection, ReadonlyMap<number, string[]>>,
): { name: string; rows: (string | number)[][] }[] {
  return (Object.keys(GO_LIVE_SHEETS) as GoLiveSection[])
    .filter((section) => sheets[section].rows.length > 0)
    .map((section) => {
      const used = COLUMNS[section].filter((c) => sheets[section].rows.some((r) => (r.cells[c.key] ?? "") !== ""))
      const rowMessages = messages.get(section)
      return {
        name: GO_LIVE_SHEETS[section],
        rows: [
          ["Problem", ...used.map((c) => headerLabel(section, c))],
          ...sheets[section].rows.map((r) => [(rowMessages?.get(r.rowNumber) ?? []).join(" · "), ...used.map((c) => r.cells[c.key] ?? "")]),
        ],
      }
    })
}

export interface OpeningLine {
  accountId: string
  debitAmount: number
  creditAmount: number
}

/**
 * The opening-balance lines after go-live: the lines already there (if opening balances were set before) with Cash
 * and Bank replaced by the page's figures. Zero amounts drop the line.
 */
export function openingLinesWithCashAndBank(
  existing: OpeningLine[],
  cash: { accountId: string; amount: number },
  bank: { accountId: string; amount: number },
): OpeningLine[] {
  const others = existing.filter((l) => l.accountId !== cash.accountId && l.accountId !== bank.accountId)
  const added = [cash, bank]
    .filter((a) => a.amount > 0)
    .map((a) => ({ accountId: a.accountId, debitAmount: a.amount, creditAmount: 0 }))
  return [...others, ...added]
}
