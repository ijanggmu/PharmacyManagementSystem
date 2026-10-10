import { describe, expect, it } from "vitest"
import {
  supplierBillLabel,
  supplierLedgerPageQuery,
  supplierOpenBillsQuery,
  toSupplierOpenBills,
  type DotnetSupplierOpenBillsDto,
} from "@/lib/api/suppliers-api"

const dto: DotnetSupplierOpenBillsDto = {
  supplierId: "s1",
  totalOutstanding: 326,
  unappliedCredit: 0,
  bills: [
    {
      ledgerEntryId: "le-0",
      billDateUtc: "2026-07-01T00:00:00Z",
      entryType: "OpeningBalance",
      referenceType: "LedgerEntry",
      referenceId: "le-0",
      documentNumber: null,
      supplierBillNumber: null,
      description: "Opening balance",
      amount: 100,
      paid: 0,
      credited: 0,
      outstanding: 100,
      status: "open",
      ageDays: 99,
      branchId: null,
    },
    {
      ledgerEntryId: "le-1",
      billDateUtc: "2026-09-15T00:00:00Z",
      entryType: "Purchase",
      referenceType: "DirectGoodsReceipt",
      referenceId: "grn-1",
      documentNumber: "GRN-MAIN-2083/84-00002",
      supplierBillNumber: "ZZ-INV-002",
      description: "Purchase GRN-MAIN-2083/84-00002 (bill ZZ-INV-002)",
      amount: 452,
      paid: 226,
      credited: 0,
      outstanding: 226,
      status: "partially_paid",
      ageDays: 25,
      branchId: "b1",
    },
  ],
}

describe("toSupplierOpenBills", () => {
  it("maps bills, totals and status, flagging the opening balance", () => {
    const out = toSupplierOpenBills(dto)
    expect(out.total_outstanding).toBe(326)
    expect(out.bills).toHaveLength(2)
    expect(out.bills[0]).toMatchObject({ is_opening: true, status: "open", outstanding: 100 })
    expect(out.bills[1]).toMatchObject({
      reference_type: "DirectGoodsReceipt",
      reference_id: "grn-1",
      document_number: "GRN-MAIN-2083/84-00002",
      supplier_bill_number: "ZZ-INV-002",
      status: "partially_paid",
      age_days: 25,
      is_opening: false,
    })
  })

  it("labels bills by GRN and supplier bill number", () => {
    const [opening, grn] = toSupplierOpenBills(dto).bills
    expect(supplierBillLabel(opening)).toBe("Opening balance")
    expect(supplierBillLabel(grn)).toBe("GRN-MAIN-2083/84-00002 · Bill ZZ-INV-002")
  })
})

describe("queries", () => {
  it("builds the open-bills and ledger page paths", () => {
    expect(supplierOpenBillsQuery("s1")).toBe("/api/v1/suppliers/s1/open-bills?onlyOpen=true")
    expect(supplierOpenBillsQuery("s1", { onlyOpen: false, branchId: "b1" })).toBe(
      "/api/v1/suppliers/s1/open-bills?onlyOpen=false&branchId=b1",
    )
    expect(supplierLedgerPageQuery("s1", 2, 20)).toBe("/api/v1/suppliers/s1/ledger?pageNumber=2&pageSize=20")
  })
})
