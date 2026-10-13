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

/** The row the API takes (ImportCustomersCommand.Rows). */
export interface CustomerImportRowDto {
  rowNumber: number
  name: string
  phone?: string
  email?: string
  address?: string
  panNumber?: string
  creditLimit?: number
  creditDays?: number
  openingBalance?: number
  asOfDate?: string
}

export const CUSTOMER_IMPORT_COLUMNS: ImportColumn[] = [
  { key: "name", label: "Name", required: true, help: "Customer or business name.", aliases: ["customer", "customer name", "full name"] },
  { key: "phone", label: "Phone", help: "Mobile or landline. Used to find customers you already have (+977 and spaces are ignored).", aliases: ["mobile", "phone number", "contact"] },
  { key: "email", label: "Email", help: "Optional email address.", aliases: ["email address"] },
  { key: "address", label: "Address", help: "Optional address." },
  { key: "pan", label: "PAN", help: "9-digit PAN / VAT number (businesses). Also used to find existing customers.", aliases: ["pan number", "pan no", "vat", "vat no", "pan_vat"] },
  { key: "credit_limit", label: "Credit limit", help: "Most the customer may owe on account, in rupees. Blank = no limit." },
  { key: "credit_days", label: "Credit days", help: "Payment terms in days (0–365). Blank = no terms." },
  { key: "opening_balance", label: "Opening balance", help: "What the customer owes you today, in rupees. Negative = an advance you hold for them. New customers only.", aliases: ["opening due", "balance", "due"] },
  { key: "as_of_date", label: "As of date", help: "Date of the opening balance, yyyy-mm-dd. Blank = the date chosen in the import dialog.", aliases: ["as of", "balance date"] },
]

export const CUSTOMER_IMPORT_EXAMPLES: (string | number)[][] = [
  ["Ram Bahadur Thapa", "9841234567", "ram@example.com", "Baneshwor, Kathmandu", "", "", "", 1250.5, "2026-07-16"],
  ["Shrestha Traders", "01-4412345", "", "Lalitpur", "301234567", 50000, 30, 18000, ""],
  ["Gita Gurung", "+977 9801122334", "", "", "", "", "", -300, ""],
]

export const CUSTOMER_IMPORT_NOTES = [
  "Keep the header row. Columns can be in any order; extra columns are ignored.",
  "A customer whose phone or PAN is already on file is skipped, or updated if you choose \"Update existing\" (blank cells keep what is stored).",
  "Opening balances are only set on new customers. They post to the customer's ledger and to Accounts Receivable in the books on the as-of date.",
  "The whole file is checked first: if any row has a problem, nothing is imported. Fix the rows shown and upload again.",
  "At most 2,000 customers per file.",
]

/** Client-side mapping: parse each cell and catch what can be caught before the server's check. */
export function mapCustomerRows(rows: RawImportRow[]): MappedRow<CustomerImportRowDto>[] {
  return rows.map(({ rowNumber, cells }) => {
    const errors: ImportFieldError[] = []
    const name = textCell(cells.name)
    if (!name) errors.push({ field: "name", message: "Enter the customer's name." })

    const pan = textCell(cells.pan)?.replace(/\s+/g, "")
    if (pan && !/^\d{9}$/.test(pan)) errors.push({ field: "pan", message: "PAN / VAT number must be 9 digits." })

    const creditLimit = collect(errors, "credit_limit", numberCell(cells.credit_limit, "Credit limit"))
    if (creditLimit !== undefined && creditLimit < 0) errors.push({ field: "credit_limit", message: "Credit limit can't be negative." })
    const creditDays = collect(errors, "credit_days", integerCell(cells.credit_days, "Credit days"))
    if (creditDays !== undefined && (creditDays < 0 || creditDays > 365))
      errors.push({ field: "credit_days", message: "Credit days must be between 0 and 365." })

    return {
      rowNumber,
      errors,
      data: {
        rowNumber,
        name: name ?? "",
        phone: textCell(cells.phone),
        email: textCell(cells.email),
        address: textCell(cells.address),
        panNumber: pan || undefined,
        creditLimit,
        creditDays,
        openingBalance: collect(errors, "opening_balance", numberCell(cells.opening_balance, "Opening balance")),
        asOfDate: collect(errors, "as_of_date", dateCell(cells.as_of_date, "As of date")),
      },
    }
  })
}
