import { describe, expect, it } from "vitest"
import {
  EXAMPLE_PREFIX,
  GO_LIVE_SHEETS,
  consignmentSupplierNames,
  goLiveTemplateSheets,
  mapGoLiveBalances,
  mapGoLiveCustomers,
  mapGoLiveStock,
  mapGoLiveSuppliers,
  openingLinesWithCashAndBank,
  problemSheets,
  resolveConsignmentSuppliers,
  sheetsFromMatrices,
  supplierKey,
} from "./go-live-workbook"

const FULL = { suppliers: true, customers: true, consignment: true, detail: "full" } as const
const sheetsOf = (options: Parameters<typeof goLiveTemplateSheets>[0]) =>
  Object.fromEntries(goLiveTemplateSheets(options).map((s) => [s.name, s.rows]))
const template = sheetsOf(FULL)
/** The template with "Example: " taken off, so its example rows read back as real rows. */
const unprefixed = Object.fromEntries(
  Object.entries(template).map(([name, rows]) => [name, rows.map((row) => row.map((cell) => (typeof cell === "string" ? cell.replace(EXAMPLE_PREFIX, "") : cell)))]),
)

describe("go-live template", () => {
  it("has a sheet per chosen section plus instructions, and its examples (unprefixed) are valid rows", () => {
    expect(Object.keys(template)).toEqual(["Medicines & stock", "Suppliers", "Customers", "Instructions"])
    const sheets = sheetsFromMatrices(unprefixed)
    expect(sheets.suppliers.missingColumns).toEqual([])
    expect(sheets.stock.unknownHeaders).toEqual([])
    expect(mapGoLiveStock(sheets.stock.rows).every((r) => r.errors.length === 0)).toBe(true)
    expect(mapGoLiveSuppliers(sheets.suppliers.rows, "2026-10-17").every((r) => r.errors.length === 0)).toBe(true)
    expect(mapGoLiveCustomers(sheets.customers.rows, "2026-10-17").every((r) => r.errors.length === 0)).toBe(true)
  })

  it("never imports the Example rows", () => {
    const sheets = sheetsFromMatrices(template)
    expect(sheets.stock.rows).toEqual([])
    expect(sheets.suppliers.rows).toEqual([])
  })

  it("only asks for what the owner said they have", () => {
    const simple = sheetsOf({ suppliers: false, customers: true, consignment: false, detail: "simple" })
    expect(Object.keys(simple)).toEqual(["Medicines & stock", "Customers", "Instructions"])
    expect(simple["Medicines & stock"][0]).toEqual(["Medicine name *", "Form", "MRP *", "Quantity", "Cost price", "Expiry date"])
    expect(simple.Customers[0]).toEqual(["Customer name *", "Phone", "Amount they still owe you"])
    expect(JSON.stringify(simple)).not.toMatch(/owns this stock|Himal Drug House/)
    expect(template["Medicines & stock"][0]).toContain("Supplier who owns this stock")
  })

  it("reads starred headers and older templates' headers alike", () => {
    const sheets = sheetsFromMatrices({
      "Medicines & stock": [["Medicine name *", "MRP *", "Consignment supplier"], ["Cetamol", "2", "Himal"]],
      Suppliers: [["Name", "Amount you owe them"], ["Himal", "500"]],
    })
    expect(sheets.stock.rows[0].cells).toMatchObject({ medicine_name: "Cetamol", selling_price: "2", consignment_supplier: "Himal" })
    expect(sheets.suppliers.rows[0].cells).toMatchObject({ name: "Himal", opening_balance: "500" })
  })

  it("finds sheets whatever their case or ampersand, and treats a missing sheet as empty", () => {
    const sheets = sheetsFromMatrices({ "medicines and STOCK": unprefixed[GO_LIVE_SHEETS.stock] })
    expect(sheets.stock.rows.length).toBe(4)
    expect(sheets.suppliers.rows).toEqual([])
  })
})

describe("go-live medicine rows", () => {
  it("lets a row leave quantity and cost blank (a medicine card only)", () => {
    const [row] = mapGoLiveStock([{ rowNumber: 2, cells: { medicine_name: "Vitamin C", selling_price: "5" } }])
    expect(row.errors).toEqual([])
    expect(row.data).toMatchObject({ quantity: 0, costPrice: 0 })
  })

  it("still refuses a negative quantity", () => {
    const [row] = mapGoLiveStock([{ rowNumber: 2, cells: { medicine_name: "X", quantity: "-1" } }])
    expect(row.errors.map((e) => e.field)).toContain("quantity")
  })
})

describe("problemSheets", () => {
  it("puts each row's problems in a first column the upload ignores", () => {
    const sheets = sheetsFromMatrices({ "Medicines & stock": [["Medicine name", "MRP"], ["Cetamol", ""], ["Zinc", "3"]] })
    const [stock] = problemSheets(sheets, new Map([["stock", new Map([[2, ["MRP missing"]]])]]))
    expect(stock.rows).toEqual([
      ["Problem", "Medicine name *", "MRP *"],
      ["MRP missing", "Cetamol", ""],
      ["", "Zinc", "3"],
    ])
    expect(sheetsFromMatrices({ [stock.name]: stock.rows }).stock.rows.map((r) => r.cells.medicine_name)).toEqual(["Cetamol", "Zinc"])
  })
})

describe("go-live rows", () => {
  it("dates supplier and customer amounts on the go-live date", () => {
    const sheets = sheetsFromMatrices(unprefixed)
    expect(mapGoLiveSuppliers(sheets.suppliers.rows, "2026-10-17").map((r) => r.data.asOfDate)).toEqual(["2026-10-17", "2026-10-17"])
    expect(mapGoLiveCustomers(sheets.customers.rows, "2026-10-17")[0].data.openingBalance).toBe(1250.5)
  })

  it("reads what a new medicine needs and the consignment supplier", () => {
    const [cetamol, , , insulin] = mapGoLiveStock(sheetsFromMatrices(unprefixed).stock.rows).map((r) => r.data)
    expect(cetamol).toMatchObject({ medicineName: "Cetamol 500mg", genericName: "Paracetamol", isTaxable: false, unitsPerPack: 10, reorderLevel: 50 })
    expect(cetamol.consignmentSupplierName).toBeUndefined()
    expect(insulin.consignmentSupplierName).toBe("Himal Drug House")
  })

  it("flags a VAT cell that isn't yes or no", () => {
    const rows = mapGoLiveStock([{ rowNumber: 2, cells: { medicine_name: "X", quantity: "1", cost_price: "1", vat: "maybe" } }])
    expect(rows[0].errors).toContainEqual({ field: "vat", message: 'VAT "maybe" — write Yes or No.' })
  })

  it("gives consigned rows their supplier id, and flags an unknown supplier", () => {
    const rows = mapGoLiveStock([
      { rowNumber: 2, cells: { medicine_name: "A", quantity: "1", cost_price: "1", consignment_supplier: "himal  drug house" } },
      { rowNumber: 3, cells: { medicine_name: "B", quantity: "1", cost_price: "1", consignment_supplier: "Nobody" } },
      { rowNumber: 4, cells: { medicine_name: "C", quantity: "1", cost_price: "1" } },
    ])
    expect(consignmentSupplierNames(rows.map((r) => r.data))).toEqual(["himal  drug house", "Nobody"])
    const resolved = resolveConsignmentSuppliers(rows, new Map([[supplierKey("Himal Drug House"), "sup-1"]]))
    expect(resolved[0].data.consignmentSupplierId).toBe("sup-1")
    expect(resolved[1].errors[0].field).toBe("consignment_supplier")
    expect(resolved[2]).toBe(rows[2])
  })

  it("reads cash and bank, and refuses other rows or negative amounts", () => {
    expect(
      mapGoLiveBalances([
        { rowNumber: 2, cells: { account: "Cash in hand", amount: "20,000" } },
        { rowNumber: 3, cells: { account: "Bank balance", amount: "150000" } },
      ]),
    ).toEqual({ cash: 20000, bank: 150000, errors: [] })
    const bad = mapGoLiveBalances([
      { rowNumber: 2, cells: { account: "Loan", amount: "5" } },
      { rowNumber: 3, cells: { account: "Cash", amount: "-5" } },
    ])
    expect(bad.errors.map((e) => e.rowNumber)).toEqual([2, 3])
  })
})

describe("openingLinesWithCashAndBank", () => {
  it("replaces cash and bank, keeps other lines and drops zero amounts", () => {
    const existing = [
      { accountId: "cash", debitAmount: 5, creditAmount: 0 },
      { accountId: "loan", debitAmount: 0, creditAmount: 900 },
    ]
    expect(openingLinesWithCashAndBank(existing, { accountId: "cash", amount: 20000 }, { accountId: "bank", amount: 0 })).toEqual([
      { accountId: "loan", debitAmount: 0, creditAmount: 900 },
      { accountId: "cash", debitAmount: 20000, creditAmount: 0 },
    ])
  })
})
