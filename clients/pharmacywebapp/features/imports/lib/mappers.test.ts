import { describe, expect, it } from "vitest"
import { mapCustomerRows } from "./customer-import"
import { mapSupplierRows } from "./supplier-import"
import { mapStockRows } from "./stock-import"
import { buildPreviewRows, countPreview, errorReportRows, importFingerprint } from "./import-report"
import { STOCK_IMPORT_COLUMNS } from "./stock-import"
import { toImportResult } from "../api-client"

describe("mapCustomerRows", () => {
  it("builds the API row and parses money, days and dates", () => {
    const [row] = mapCustomerRows([
      {
        rowNumber: 2,
        cells: { name: " Ram ", phone: "9841234567", pan: "301 234 567", credit_limit: "50,000", credit_days: "30", opening_balance: "(300)", as_of_date: "2026-07-16" },
      },
    ])
    expect(row.errors).toEqual([])
    expect(row.data).toEqual({
      rowNumber: 2,
      name: "Ram",
      phone: "9841234567",
      email: undefined,
      address: undefined,
      panNumber: "301234567",
      creditLimit: 50000,
      creditDays: 30,
      openingBalance: -300,
      asOfDate: "2026-07-16",
    })
  })

  it("flags a missing name, a bad PAN, bad numbers and out-of-range days against their columns", () => {
    const [row] = mapCustomerRows([{ rowNumber: 7, cells: { name: "", pan: "12AB", credit_days: "400", opening_balance: "lots" } }])
    expect(row.errors.map((e) => e.field).sort()).toEqual(["credit_days", "name", "opening_balance", "pan"])
  })
})

describe("mapSupplierRows", () => {
  it("maps the opening payable and PAN", () => {
    const [row] = mapSupplierRows([{ rowNumber: 3, cells: { name: "Himal Drugs", pan: "600123456", opening_balance: "1,25,000", credit_days: "45" } }])
    expect(row.errors).toEqual([])
    expect(row.data).toMatchObject({ name: "Himal Drugs", panNumber: "600123456", openingBalance: 125000, creditDays: 45 })
  })
})

describe("mapStockRows", () => {
  it("needs a medicine, a positive quantity and a cost", () => {
    const [row] = mapStockRows([{ rowNumber: 4, cells: { quantity: "0" } }])
    expect(row.errors.map((e) => e.field).sort()).toEqual(["cost_price", "medicine", "quantity"])
  })

  it("maps a valid line; a blank selling price means the medicine's price", () => {
    const [row] = mapStockRows([
      {
        rowNumber: 2,
        cells: { medicine_name: "Paracetamol", strength: "500mg", form: "Tablet", batch_no: "PCM1", expiry_date: "30/06/2027", quantity: "500", cost_price: "1.2", selling_price: "", rack: "A1" },
      },
    ])
    expect(row.errors).toEqual([])
    expect(row.data).toMatchObject({
      medicineName: "Paracetamol",
      expiryDate: "2027-06-30",
      quantity: 500,
      costPrice: 1.2,
      sellingPrice: undefined,
      rackLocation: "A1",
    })
  })
})

describe("import report", () => {
  const raw = [
    { rowNumber: 2, cells: { medicine_name: "Paracetamol", quantity: "5", cost_price: "1" } },
    { rowNumber: 3, cells: { medicine_name: "Nope", quantity: "5", cost_price: "1" } },
  ]
  const mapped = mapStockRows(raw)
  const server = toImportResult({
    committed: false,
    dryRun: true,
    received: 1,
    failed: 1,
    totalValue: 5,
    rows: [
      { rowNumber: 2, status: "received", medicineId: "m1", medicineLabel: "Paracetamol 500mg", errors: [], warnings: ["No batch number — one will be generated."] },
      { rowNumber: 3, status: "failed", medicineId: null, errors: [{ field: "medicine_name", message: "No medicine \"Nope\"" }], warnings: [] },
    ],
  })

  it("normalizes the API result and merges it into the preview", () => {
    expect(server.created).toBe(1)
    const preview = buildPreviewRows(mapped, server)
    expect(preview.map((p) => p.status)).toEqual(["received", "failed"])
    expect(preview[0].label).toBe("Paracetamol 500mg")
    expect(countPreview(preview)).toEqual({ ready: 1, failed: 1, pending: 0 })
    expect(countPreview(buildPreviewRows(mapped, null)).pending).toBe(2)
  })

  it("lists the rows with problems or notes, with their original cells", () => {
    const report = errorReportRows(STOCK_IMPORT_COLUMNS, raw, buildPreviewRows(mapped, server))
    expect(report[0][0]).toBe("Row")
    expect(report).toHaveLength(3)
    const failed = report.find((r) => r[0] === 3)!
    expect(failed).toContain("Nope")
    expect(failed).toContain("failed")
    expect(String(failed.at(-2))).toContain("Medicine name: No medicine")
  })

  it("fingerprints change with the options, so a changed choice gets a new Idempotency-Key", () => {
    expect(importFingerprint("stock", [1], { funding: "cash" })).not.toBe(importFingerprint("stock", [1], { funding: "bank" }))
  })
})
