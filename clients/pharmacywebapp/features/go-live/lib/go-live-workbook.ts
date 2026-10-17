/**
 * The go-live workbook: one Excel file with everything a pharmacy brings on its first day — suppliers (and what it
 * owes them), customers (and what they owe), medicines with the stock on the shelf (owned or consigned), and the
 * cash and bank balances. Pure helpers only: building the template, reading the sheets, and turning rows into the
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
  c.key === "opening_balance" ? { ...c, label: "Amount you owe them", aliases: [...(c.aliases ?? []), "opening payable"] } : c,
)

export const GO_LIVE_CUSTOMER_COLUMNS = withoutAsOf(CUSTOMER_IMPORT_COLUMNS).map((c) =>
  c.key === "opening_balance" ? { ...c, label: "Amount they owe you", aliases: [...(c.aliases ?? []), "opening balance"] } : c,
)

const stockColumn = (key: string) => STOCK_IMPORT_COLUMNS.find((c) => c.key === key)!

export const GO_LIVE_STOCK_COLUMNS: ImportColumn[] = [
  { ...stockColumn("medicine_name"), help: "The medicine's name. A medicine not in your list yet is added from this row." },
  { key: "generic_name", label: "Generic name", help: "For a new medicine, e.g. Paracetamol.", aliases: ["generic"] },
  stockColumn("strength"),
  { ...stockColumn("form"), help: "e.g. Tablet, Capsule, Syrup. Needed for a new medicine." },
  stockColumn("barcode"),
  stockColumn("batch_no"),
  stockColumn("expiry_date"),
  stockColumn("quantity"),
  stockColumn("cost_price"),
  { ...stockColumn("selling_price"), label: "MRP", help: "Selling price per unit. Needed for a new medicine.", aliases: ["selling price", "sale price", "price"] },
  { key: "vat", label: "VAT", help: "Yes if the medicine carries VAT, No if exempt. Blank = Yes. Used for a new medicine.", aliases: ["taxable", "vat applicable"] },
  { key: "units_per_pack", label: "Pack size", help: "Units in one strip / pack, e.g. 10. Optional.", aliases: ["units per pack", "pack"] },
  { key: "reorder_level", label: "Reorder level", help: "Flag as low stock at or below this quantity. Optional.", aliases: ["minimum stock", "reorder"] },
  stockColumn("rack"),
  {
    key: "consignment_supplier",
    label: "Consignment supplier",
    help: "Leave empty for your own stock. For a supplier's consignment (paid only when sold), write the supplier's name.",
    aliases: ["consignment", "consigned by"],
  },
]

export const GO_LIVE_BALANCE_COLUMNS: ImportColumn[] = [
  { key: "account", label: "Account", required: true, help: "Keep the two rows: Cash in hand and Bank balance." },
  { key: "amount", label: "Amount", required: true, help: "What you hold on the go-live date, in rupees (0 if none)." },
]

const STOCK_EXAMPLES: (string | number)[][] = [
  ["Cetamol 500mg", "Paracetamol", "500mg", "Tablet", "", "CTM-2401", "2027-06-30", 500, 1.2, 2, "No", 10, 50, "A1", ""],
  ["Amoxil 500mg", "Amoxicillin", "500mg", "Capsule", "8901234567890", "AMX-77", "2027-01-31", 120, 6.5, 9, "Yes", 10, 20, "B3", ""],
  ["Insulin Glargine", "Insulin glargine", "100IU", "Injection", "", "INS-C1", "2027-08-31", 10, 1100, 1500, "Yes", 1, 2, "Fridge", "Himal Drug House"],
]

const NOTES = [
  "Fill the four sheets and upload this one file on the Go-live setup page. Keep the header rows; columns can be in any order.",
  "Suppliers: what you owe each one on the go-live date. Customers: what each one owes you. Only new suppliers and customers get these amounts.",
  "Medicines & stock: one row per batch on your shelf. A medicine not in your list yet is added from its row (name, form and MRP are needed).",
  "Consignment supplier: leave empty for your own stock. Write the supplier's name for consignment stock — it is paid for only when it sells (Consignment › Settle). The supplier can be one on the Suppliers sheet.",
  "Cash & bank: the cash in hand and the bank balance on the go-live date.",
  "Everything is dated on the go-live date you choose on the page. Nothing is saved until you press Go live; the page lists any problems first.",
]

/** The workbook to download: one sheet per section (with examples), then the Instructions sheet. */
export function goLiveTemplateSheets(): { name: string; rows: (string | number)[][] }[] {
  const instructions = (title: string, columns: ImportColumn[]) => [
    [title],
    ...columns.map((c) => [c.label, c.required ? "Yes" : "No", c.help]),
    [],
  ]
  return [
    { name: GO_LIVE_SHEETS.suppliers, rows: [GO_LIVE_SUPPLIER_COLUMNS.map((c) => c.label), ...SUPPLIER_IMPORT_EXAMPLES.map((r) => r.slice(0, -1))] },
    { name: GO_LIVE_SHEETS.customers, rows: [GO_LIVE_CUSTOMER_COLUMNS.map((c) => c.label), ...CUSTOMER_IMPORT_EXAMPLES.map((r) => r.slice(0, -1))] },
    { name: GO_LIVE_SHEETS.stock, rows: [GO_LIVE_STOCK_COLUMNS.map((c) => c.label), ...STOCK_EXAMPLES] },
    { name: GO_LIVE_SHEETS.balances, rows: [GO_LIVE_BALANCE_COLUMNS.map((c) => c.label), ["Cash in hand", 0], ["Bank balance", 0]] },
    {
      name: INSTRUCTIONS_SHEET,
      rows: [
        ["Column", "Required", "What to enter"],
        ...instructions(GO_LIVE_SHEETS.suppliers, GO_LIVE_SUPPLIER_COLUMNS),
        ...instructions(GO_LIVE_SHEETS.customers, GO_LIVE_CUSTOMER_COLUMNS),
        ...instructions(GO_LIVE_SHEETS.stock, GO_LIVE_STOCK_COLUMNS),
        ...instructions(GO_LIVE_SHEETS.balances, GO_LIVE_BALANCE_COLUMNS),
        ["Notes"],
        ...NOTES.map((n) => [n]),
      ],
    },
  ]
}

export type GoLiveSheets = Record<GoLiveSection, ParsedSheet>

const COLUMNS: Record<GoLiveSection, ImportColumn[]> = {
  suppliers: GO_LIVE_SUPPLIER_COLUMNS,
  customers: GO_LIVE_CUSTOMER_COLUMNS,
  stock: GO_LIVE_STOCK_COLUMNS,
  balances: GO_LIVE_BALANCE_COLUMNS,
}

const EMPTY_SHEET: ParsedSheet = { rows: [], unknownHeaders: [], missingColumns: [] }

/** Each section's sheet, found by name (case, spaces and "&"/"and" don't matter); a missing sheet is empty. */
export function sheetsFromMatrices(matrices: Record<string, unknown[][]>): GoLiveSheets {
  const byName = new Map(Object.entries(matrices).map(([name, matrix]) => [sheetKey(name), matrix]))
  const read = (section: GoLiveSection) => {
    const matrix = byName.get(sheetKey(GO_LIVE_SHEETS[section]))
    return matrix ? rowsFromMatrix(matrix, COLUMNS[section]) : EMPTY_SHEET
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
    throw new Error("That file has none of the go-live sheets filled in. Download the template and fill it in.")
  }
  return sheets
}

export function mapGoLiveSuppliers(rows: RawImportRow[], goLiveDate: string): MappedRow<SupplierImportRowDto>[] {
  return mapSupplierRows(rows).map((r) => ({ ...r, data: { ...r.data, asOfDate: goLiveDate } }))
}

export function mapGoLiveCustomers(rows: RawImportRow[], goLiveDate: string): MappedRow<CustomerImportRowDto>[] {
  return mapCustomerRows(rows).map((r) => ({ ...r, data: { ...r.data, asOfDate: goLiveDate } }))
}

export function mapGoLiveStock(rows: RawImportRow[]): MappedRow<GoLiveStockRowDto>[] {
  const base = mapStockRows(rows)
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

/** Cash and bank from the "Cash & bank" sheet: rows whose account says cash / bank. */
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

export interface OpeningLine {
  accountId: string
  debitAmount: number
  creditAmount: number
}

/**
 * The opening-balance lines after go-live: the lines already there (if opening balances were set before) with Cash
 * and Bank replaced by the sheet's figures. Zero amounts drop the line.
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
