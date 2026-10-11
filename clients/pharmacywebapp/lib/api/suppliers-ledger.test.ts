import { describe, expect, it } from "vitest"
import {
  statementBounds,
  supplierCostHistoryQuery,
  supplierReturnCreateBody,
  supplierReturnsListQuery,
  supplierReturnTotal,
  supplierStatementQuery,
  toCostHistory,
  toSupplierLedgerSummary,
  toSupplierStatement,
  type DotnetSupplierCostHistoryDto,
  type DotnetSupplierLedgerEntryDto,
  type DotnetSupplierStatementDto,
} from "@/lib/api/suppliers-api"
import type { Supplier } from "@/features/suppliers/api-client"

const statement: DotnetSupplierStatementDto = {
  supplierId: "s1",
  periodFromUtc: "2026-03-01T00:00:00Z",
  periodToUtc: "2026-03-31T23:59:59.999Z",
  openingBalance: 1000,
  closingBalance: 1150.5,
  lines: [
    {
      id: "l1",
      entryDateUtc: "2026-03-05T08:00:00Z",
      entryType: "Purchase",
      referenceType: "PurchaseOrder",
      referenceId: "po-1",
      description: "Receipt",
      debitAmount: 0,
      creditAmount: 300,
      runningBalance: 1300,
    },
    {
      id: "l2",
      entryDateUtc: "2026-03-12T08:00:00Z",
      entryType: "Payment",
      referenceType: null,
      referenceId: null,
      description: "Cash paid",
      debitAmount: 149.5,
      creditAmount: 0,
      runningBalance: 1150.5,
    },
  ],
}

describe("statementBounds and supplierStatementQuery", () => {
  it("widens a date range to whole Nepal days (UTC+05:45) so the last day is included", () => {
    expect(statementBounds("2026-03-01", "2026-03-31")).toEqual({
      fromUtc: "2026-02-28T18:15:00.000Z",
      toUtc: "2026-03-31T18:14:59.999Z",
    })
  })

  it("rejects non date-only input", () => {
    expect(() => statementBounds("01/03/2026", "2026-03-31")).toThrow(/YYYY-MM-DD/)
  })

  it("builds the statement query with an optional branch", () => {
    expect(supplierStatementQuery("s1", "2026-03-01", "2026-03-31")).toBe(
      "/api/v1/suppliers/s1/statement?fromUtc=2026-02-28T18%3A15%3A00.000Z&toUtc=2026-03-31T18%3A14%3A59.999Z",
    )
    expect(supplierStatementQuery("s1", "2026-03-01", "2026-03-31", "b2")).toContain("&branchId=b2")
  })
})

describe("toSupplierStatement", () => {
  it("maps the period, balances and lines, with amount as debit minus credit", () => {
    const out = toSupplierStatement(statement, "2026-03-01", "2026-03-31")
    expect(out.supplier_id).toBe("s1")
    expect(out.period_from).toBe("2026-03-01")
    expect(out.period_to).toBe("2026-03-31")
    expect(out.opening_balance).toBe(1000)
    expect(out.closing_balance).toBe(1150.5)
    expect(out.lines).toEqual([
      {
        id: "l1",
        entry_date: "2026-03-05",
        entry_type: "purchase",
        reference_number: null,
        supplier_bill_number: null,
        description: "Receipt",
        amount: -300,
        balance_after: 1300,
        debit: 0,
        credit: 300,
        reference_type: "PurchaseOrder",
        reference_id: "po-1",
        branch_id: null,
      },
      {
        id: "l2",
        entry_date: "2026-03-12",
        entry_type: "payment",
        reference_number: null,
        supplier_bill_number: null,
        description: "Cash paid",
        amount: 149.5,
        balance_after: 1150.5,
        debit: 149.5,
        credit: 0,
        reference_type: null,
        reference_id: null,
        branch_id: null,
      },
    ])
  })

  it("carries the GRN and supplier bill numbers when the API sends them", () => {
    const withNumbers = {
      ...statement,
      lines: [{ ...statement.lines[0], documentNumber: "GRN-MAIN-2083/84-00002", supplierBillNumber: "ZZ-INV-002", branchId: "b1" }],
    }
    const [line] = toSupplierStatement(withNumbers, "2026-03-01", "2026-03-31").lines
    expect(line.reference_number).toBe("GRN-MAIN-2083/84-00002")
    expect(line.supplier_bill_number).toBe("ZZ-INV-002")
    expect(line.branch_id).toBe("b1")
  })

  it("rejects an unknown entry type", () => {
    const bad = { ...statement, lines: [{ ...statement.lines[0], entryType: "Weird" }] }
    expect(() => toSupplierStatement(bad, "2026-03-01", "2026-03-31")).toThrow(/Unknown supplier ledger entry type/)
  })
})

const supplier: Supplier = {
  id: "s1",
  name: "Himalayan Pharma",
  contact_person: null,
  email: "sales@himalayan.example",
  phone: "01-4000000",
  address: null,
  created_at: "2025-01-01T00:00:00Z",
}

const ledgerNewestFirst: DotnetSupplierLedgerEntryDto[] = [
  {
    id: "e3",
    supplierId: "s1",
    entryDateUtc: "2026-03-12T00:00:00Z",
    entryType: "Payment",
    description: null,
    debitAmount: 0,
    creditAmount: 100,
    runningBalance: 900,
    referenceType: null,
    referenceId: null,
    createdAtUtc: "2026-03-12T09:00:00Z",
  },
  {
    id: "e2",
    supplierId: "s1",
    entryDateUtc: "2026-03-05T00:00:00Z",
    entryType: "Purchase",
    description: null,
    debitAmount: 0,
    creditAmount: 1000,
    runningBalance: 1000,
    referenceType: null,
    referenceId: null,
    createdAtUtc: "2026-03-05T09:00:00Z",
  },
  {
    id: "e1",
    supplierId: "s1",
    entryDateUtc: "2026-03-01T00:00:00Z",
    entryType: "OpeningBalance",
    description: "Opening",
    debitAmount: 0,
    creditAmount: 0,
    runningBalance: 0,
    referenceType: null,
    referenceId: null,
    createdAtUtc: "2026-03-01T09:00:00Z",
  },
]

describe("toSupplierLedgerSummary", () => {
  it("reverses the newest-first .NET list to oldest-first and takes the balance from the last row", () => {
    const summary = toSupplierLedgerSummary("s1", supplier, ledgerNewestFirst)
    expect(summary.entries.map((e) => e.id)).toEqual(["e1", "e2", "e3"])
    expect(summary.balance).toBe(900)
    expect(summary.entries[1]).toMatchObject({ entry_type: "purchase", amount: -1000, balance_after: 1000, entry_date: "2026-03-05" })
    expect(summary.entries[2]).toMatchObject({ entry_type: "payment", amount: -100, balance_after: 900 })
  })

  it("carries the supplier header the modal reads, with no reconciliation account on .NET", () => {
    const summary = toSupplierLedgerSummary("s1", supplier, ledgerNewestFirst)
    expect(summary.supplier).toEqual({
      id: "s1",
      name: "Himalayan Pharma",
      reconciliation_account_ref: null,
      phone: "01-4000000",
      email: "sales@himalayan.example",
    })
  })

  it("returns a zero balance and no supplier header when there are no entries or no supplier row", () => {
    const summary = toSupplierLedgerSummary("s1", null, [])
    expect(summary).toEqual({ supplierId: "s1", balance: 0, supplier: null, entries: [] })
  })
})

describe("cost history", () => {
  const rows: DotnetSupplierCostHistoryDto[] = [
    { medicineId: "m1", medicineName: "Paracetamol", receiptDateUtc: "2026-01-10T00:00:00Z", unitCost: 4.5, quantityReceived: 100 },
    { medicineId: "m2", medicineName: "Amoxicillin", receiptDateUtc: "2026-03-02T00:00:00Z", unitCost: 22, quantityReceived: 20 },
    { medicineId: "m1", medicineName: "Paracetamol", receiptDateUtc: "2026-02-14T00:00:00Z", unitCost: 4.8, quantityReceived: 50 },
  ]

  it("maps to legacy rows, newest receipt first", () => {
    const out = toCostHistory(rows)
    expect(out.map((r) => r.receipt_date)).toEqual(["2026-03-02", "2026-02-14", "2026-01-10"])
    expect(out[0]).toEqual({
      medicine_id: "m2",
      medicine_name: "Amoxicillin",
      receipt_date: "2026-03-02",
      unit_cost: 22,
      quantity_received: 20,
    })
  })

  it("builds the query with the legacy default limit of 200", () => {
    expect(supplierCostHistoryQuery("s1")).toBe("/api/v1/suppliers/s1/cost-history?limit=200")
    expect(supplierCostHistoryQuery("s1", 0)).toBe("/api/v1/suppliers/s1/cost-history?limit=200")
    expect(supplierCostHistoryQuery("s1", 25.9)).toBe("/api/v1/suppliers/s1/cost-history?limit=25")
  })
})

describe("supplierReturnCreateBody", () => {
  it("sends the legacy payload as the .NET command with the supplied return date", () => {
    const body = supplierReturnCreateBody(
      {
        supplier_id: "s1",
        notes: "  damaged in transit ",
        items: [{ medicine_id: "m1", quantity: 3, unit_cost: 4.5, return_reason: "damaged", notes: "" }],
      },
      "2026-04-01T08:00:00.000Z",
    )
    expect(body).toEqual({
      returnDateUtc: "2026-04-01T08:00:00.000Z",
      notes: "damaged in transit",
      supplierInvoiceNumber: null,
      reverseInputVat: true,
      items: [{ medicineId: "m1", quantity: 3, unitCost: 4.5, returnReason: "damaged", notes: null, batchId: null }],
    })
  })

  it("sends the bill number, the VAT switch and a pinned batch", () => {
    const body = supplierReturnCreateBody(
      {
        supplier_id: "s1",
        supplier_invoice_number: " INV-9 ",
        reverse_input_vat: false,
        items: [{ medicine_id: "m1", quantity: 2, unit_cost: 10, return_reason: "expired", batch_id: "b1" }],
      },
      "2026-04-01T08:00:00.000Z",
    )
    expect(body.supplierInvoiceNumber).toBe("INV-9")
    expect(body.reverseInputVat).toBe(false)
    expect(body.items[0].batchId).toBe("b1")
  })

  it("sends null notes when none were given", () => {
    const body = supplierReturnCreateBody(
      { supplier_id: "s1", items: [{ medicine_id: "m1", quantity: 1, unit_cost: 2, return_reason: "expired" }] },
      "2026-04-01T08:00:00.000Z",
    )
    expect(body.notes).toBeNull()
    expect(body.items[0].notes).toBeNull()
  })
})

describe("supplierReturnsListQuery", () => {
  it("lists one supplier's returns", () => {
    expect(supplierReturnsListQuery("s1", { page: 2, limit: 20 })).toBe("/api/v1/suppliers/s1/returns?pageNumber=2&pageSize=20")
  })
  it("lists every supplier's debit notes when no supplier is given", () => {
    expect(supplierReturnsListQuery("", { branchId: "b1" })).toBe("/api/v1/suppliers/returns?pageNumber=1&pageSize=50&branchId=b1")
  })
})

describe("supplierReturnTotal", () => {
  it("is cost + VAT when the server sent it, else the cost", () => {
    expect(supplierReturnTotal({ totalCost: 100, totalAmount: 113 })).toBe(113)
    expect(supplierReturnTotal({ totalCost: 100 })).toBe(100)
  })
})
