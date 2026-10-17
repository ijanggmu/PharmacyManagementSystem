import {
  collect,
  dateCell,
  numberCell,
  textCell,
  type ImportColumn,
  type ImportFieldError,
  type MappedRow,
  type RawImportRow,
} from "@/features/imports/lib/spreadsheet"

/** The row the API takes (ImportOpeningStockCommand.Rows). */
export interface StockImportRowDto {
  rowNumber: number
  barcode?: string
  medicineName?: string
  strength?: string
  form?: string
  batchNo?: string
  expiryDate?: string
  quantity: number
  costPrice: number
  sellingPrice?: number
  rackLocation?: string
}

export const STOCK_IMPORT_COLUMNS: ImportColumn[] = [
  { key: "barcode", label: "Barcode", help: "The medicine's barcode / code. When given, it decides which medicine the row is.", aliases: ["code", "medicine code", "item code"] },
  { key: "medicine_name", label: "Medicine name", help: "Needed when there is no barcode. Must match a medicine already in your list.", aliases: ["medicine", "name", "item", "product"] },
  { key: "strength", label: "Strength", help: "As on the medicine, e.g. 500mg (spaces and case don't matter)." },
  { key: "form", label: "Form", help: "As on the medicine, e.g. Tablet, Syrup." },
  { key: "batch_no", label: "Batch no", help: "The lot number. Blank = one is generated. An existing batch is topped up (its expiry must match).", aliases: ["batch", "batch number", "lot", "lot no"] },
  { key: "expiry_date", label: "Expiry date", help: "yyyy-mm-dd. Blank = no expiry. Expired stock is refused.", aliases: ["expiry", "exp", "exp date"] },
  { key: "quantity", label: "Quantity", required: true, help: "Units on hand (more than 0).", aliases: ["qty", "stock", "units"] },
  { key: "cost_price", label: "Cost price", required: true, help: "Cost per unit in rupees — values the stock in the books.", aliases: ["cost", "purchase price", "rate"] },
  { key: "selling_price", label: "Selling price", help: "Price per unit for this batch. Blank = the medicine's current price.", aliases: ["mrp", "sale price", "price"] },
  { key: "rack", label: "Rack", help: "Shelf / rack location.", aliases: ["rack location", "location", "shelf"] },
]

export const STOCK_IMPORT_EXAMPLES: (string | number)[][] = [
  ["", "Paracetamol", "500mg", "Tablet", "PCM2401", "2027-06-30", 500, 1.2, 2, "A1"],
  ["8901234567890", "", "", "", "AMX-77", "2027-01-31", 120, 6.5, 9, "B3"],
]

export const STOCK_IMPORT_NOTES = [
  "For medicines already in your list only — add new medicines first (Inventory › Add medicine / bulk import).",
  "Stock goes into the branch you are working in now.",
  "Funding (chosen in the import dialog): \"Opening stock\" is stock you already owned at go-live (Inventory against Owner's Equity); \"Paid in cash\" / \"Paid by bank\" is stock bought without a supplier bill (Inventory against Cash / Bank). Stock bought on a supplier bill should be entered as a purchase instead.",
  "Consignment (chosen in the import dialog): the supplier's stock, paid for only when it sells. Each row becomes its own batch for that supplier, no accounting entry is made, and Consignment › Settle bills what was sold. A batch number already in stock is refused — use a new one or leave it blank.",
  "The whole file is checked first: if any row has a problem, nothing is received.",
  "At most 2,000 rows per file.",
]

export function mapStockRows(rows: RawImportRow[]): MappedRow<StockImportRowDto>[] {
  return rows.map(({ rowNumber, cells }) => {
    const errors: ImportFieldError[] = []
    const barcode = textCell(cells.barcode)
    const medicineName = textCell(cells.medicine_name)
    if (!barcode && !medicineName)
      errors.push({ field: "medicine", message: "Say which medicine: its barcode, or its name (with strength and form)." })

    const quantity = collect(errors, "quantity", numberCell(cells.quantity, "Quantity"))
    if (quantity === undefined) {
      if (!errors.some((e) => e.field === "quantity")) errors.push({ field: "quantity", message: "Enter the quantity." })
    } else if (quantity <= 0) errors.push({ field: "quantity", message: "Quantity must be more than 0." })

    const costPrice = collect(errors, "cost_price", numberCell(cells.cost_price, "Cost price"))
    if (costPrice === undefined) {
      if (!errors.some((e) => e.field === "cost_price")) errors.push({ field: "cost_price", message: "Enter the cost price (0 is allowed)." })
    } else if (costPrice < 0) errors.push({ field: "cost_price", message: "Cost price can't be negative." })

    const sellingPrice = collect(errors, "selling_price", numberCell(cells.selling_price, "Selling price"))
    if (sellingPrice !== undefined && sellingPrice < 0) errors.push({ field: "selling_price", message: "Selling price can't be negative." })

    return {
      rowNumber,
      errors,
      data: {
        rowNumber,
        barcode,
        medicineName,
        strength: textCell(cells.strength),
        form: textCell(cells.form),
        batchNo: textCell(cells.batch_no),
        expiryDate: collect(errors, "expiry_date", dateCell(cells.expiry_date, "Expiry date")),
        quantity: quantity ?? 0,
        costPrice: costPrice ?? 0,
        sellingPrice: sellingPrice || undefined,
        rackLocation: textCell(cells.rack),
      },
    }
  })
}
