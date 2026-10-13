import {
  collect,
  dateCell,
  integerCell,
  numberCell,
  textCell,
  type ImportColumn,
  type ImportFieldError,
  type MappedRow,
  type RawImportRow,
} from "@/features/imports/lib/spreadsheet"

/** The row the API takes (ImportSuppliersCommand.Rows). */
export interface SupplierImportRowDto {
  rowNumber: number
  name: string
  contactPerson?: string
  phone?: string
  email?: string
  address?: string
  panNumber?: string
  creditDays?: number
  openingBalance?: number
  asOfDate?: string
}

export const SUPPLIER_IMPORT_COLUMNS: ImportColumn[] = [
  { key: "name", label: "Name", required: true, help: "Supplier / distributor name. Also used to find suppliers you already have.", aliases: ["supplier", "supplier name", "company"] },
  { key: "contact_person", label: "Contact person", help: "Who you deal with there.", aliases: ["contact", "contact name"] },
  { key: "phone", label: "Phone", help: "Optional phone number.", aliases: ["mobile", "phone number"] },
  { key: "email", label: "Email", help: "Optional email address." },
  { key: "address", label: "Address", help: "Optional address." },
  { key: "pan", label: "PAN / VAT no", help: "9-digit PAN / VAT number. Used first to find existing suppliers.", aliases: ["pan", "vat", "vat no", "pan no", "tax id", "pan_vat"] },
  { key: "credit_days", label: "Credit days", help: "Payment terms in days (0–365): bills fall due this many days after the bill date." },
  { key: "opening_balance", label: "Opening payable", help: "What you owe the supplier today, in rupees. Negative = an advance you paid them. New suppliers only.", aliases: ["opening balance", "payable", "balance", "due"] },
  { key: "as_of_date", label: "As of date", help: "Date of the opening payable, yyyy-mm-dd. Blank = the date chosen in the import dialog.", aliases: ["as of", "balance date"] },
]

export const SUPPLIER_IMPORT_EXAMPLES: (string | number)[][] = [
  ["Himal Drug House", "Bikash Shrestha", "01-4433221", "orders@himaldrugs.com.np", "Teku, Kathmandu", "600123456", 45, 125000, "2026-07-16"],
  ["Everest Pharma Distributors", "Sunita Rai", "9851012345", "", "Biratnagar", "601987654", 30, "", ""],
]

export const SUPPLIER_IMPORT_NOTES = [
  "Keep the header row. Columns can be in any order; extra columns are ignored.",
  "A supplier whose PAN or name is already on file is skipped, or updated if you choose \"Update existing\" (blank cells keep what is stored; the name is never changed).",
  "Opening payables are only set on new suppliers. They post to the supplier's ledger and to Accounts Payable in the books on the as-of date.",
  "The whole file is checked first: if any row has a problem, nothing is imported.",
  "At most 2,000 suppliers per file.",
]

export function mapSupplierRows(rows: RawImportRow[]): MappedRow<SupplierImportRowDto>[] {
  return rows.map(({ rowNumber, cells }) => {
    const errors: ImportFieldError[] = []
    const name = textCell(cells.name)
    if (!name) errors.push({ field: "name", message: "Enter the supplier's name." })

    const pan = textCell(cells.pan)?.replace(/\s+/g, "")
    if (pan && !/^\d{9}$/.test(pan)) errors.push({ field: "pan", message: "PAN / VAT number must be 9 digits." })

    const creditDays = collect(errors, "credit_days", integerCell(cells.credit_days, "Credit days"))
    if (creditDays !== undefined && (creditDays < 0 || creditDays > 365))
      errors.push({ field: "credit_days", message: "Credit days must be between 0 and 365." })

    return {
      rowNumber,
      errors,
      data: {
        rowNumber,
        name: name ?? "",
        contactPerson: textCell(cells.contact_person),
        phone: textCell(cells.phone),
        email: textCell(cells.email),
        address: textCell(cells.address),
        panNumber: pan || undefined,
        creditDays,
        openingBalance: collect(errors, "opening_balance", numberCell(cells.opening_balance, "Opening payable")),
        asOfDate: collect(errors, "as_of_date", dateCell(cells.as_of_date, "As of date")),
      },
    }
  })
}
