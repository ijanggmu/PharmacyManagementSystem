import { describe, expect, it } from "vitest"
import {
  GO_LIVE_SHEETS,
  consignmentSupplierNames,
  goLiveTemplateSheets,
  mapGoLiveBalances,
  mapGoLiveCustomers,
  mapGoLiveStock,
  mapGoLiveSuppliers,
  openingLinesWithCashAndBank,
  resolveConsignmentSuppliers,
  sheetsFromMatrices,
  supplierKey,
} from "./go-live-workbook"

const template = Object.fromEntries(goLiveTemplateSheets().map((s) => [s.name, s.rows]))

describe("go-live template", () => {
  it("has one sheet per section plus instructions, and reads back its own examples", () => {
    expect(Object.keys(template)).toEqual(["Suppliers", "Customers", "Medicines & stock", "Cash & bank", "Instructions"])
    const sheets = sheetsFromMatrices(template)
    expect(sheets.suppliers.missingColumns).toEqual([])
    expect(sheets.stock.unknownHeaders).toEqual([])
    expect(mapGoLiveStock(sheets.stock.rows).every((r) => r.errors.length === 0)).toBe(true)
    expect(mapGoLiveSuppliers(sheets.suppliers.rows, "2026-10-17").every((r) => r.errors.length === 0)).toBe(true)
    expect(mapGoLiveCustomers(sheets.customers.rows, "2026-10-17").every((r) => r.errors.length === 0)).toBe(true)
  })

  it("finds sheets whatever their case or ampersand, and treats a missing sheet as empty", () => {
    const sheets = sheetsFromMatrices({ "medicines and STOCK": template[GO_LIVE_SHEETS.stock] })
    expect(sheets.stock.rows.length).toBe(3)
    expect(sheets.suppliers.rows).toEqual([])
  })
})

describe("go-live rows", () => {
  it("dates supplier and customer amounts on the go-live date", () => {
    const sheets = sheetsFromMatrices(template)
    expect(mapGoLiveSuppliers(sheets.suppliers.rows, "2026-10-17").map((r) => r.data.asOfDate)).toEqual(["2026-10-17", "2026-10-17"])
    expect(mapGoLiveCustomers(sheets.customers.rows, "2026-10-17")[0].data.openingBalance).toBe(1250.5)
  })

  it("reads what a new medicine needs and the consignment supplier", () => {
    const [cetamol, , insulin] = mapGoLiveStock(sheetsFromMatrices(template).stock.rows).map((r) => r.data)
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
