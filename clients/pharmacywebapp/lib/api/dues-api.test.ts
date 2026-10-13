import { describe, expect, it } from "vitest"
import { payablesDueQuery, receivablesDueQuery, toPayablesDue, toReceivablesDue } from "./dues-api"

describe("payables due", () => {
  it("asks for the end of the Nepal day with the due-soon window", () => {
    const q = payablesDueQuery("2026-10-13", { branchId: "b1" })
    expect(q).toContain("/api/v1/reports/payables-due?")
    expect(q).toContain("withinDays=7")
    expect(q).toContain("branchId=b1")
    expect(q).not.toContain("includeAll")
    expect(decodeURIComponent(q)).toContain("asOfUtc=2026-10-13T18:14:59")
  })

  it("maps bills and supplier totals, turning UTC instants into Nepal days", () => {
    const due = toPayablesDue({
      asOfUtc: "2026-10-13T18:14:59.999Z",
      withinDays: 7,
      totalOverdue: 100.004,
      totalDueSoon: 50,
      totalLater: 0,
      totalNoDueDate: 0,
      suppliers: [
        {
          supplierId: "s1",
          supplierName: "Himal",
          creditDays: 30,
          overdue: 100,
          dueSoon: 50,
          later: 0,
          noDueDate: 0,
          total: 150,
          overdueBillCount: 1,
          dueSoonBillCount: 1,
          earliestDueDateUtc: "2026-10-01T00:00:00Z",
        },
      ],
      bills: [
        {
          supplierId: "s1",
          supplierName: "Himal",
          ledgerEntryId: "e1",
          billDateUtc: "2026-09-01T00:00:00Z",
          referenceType: "DirectGoodsReceipt",
          referenceId: "r1",
          documentNumber: "GRN-1",
          supplierBillNumber: "B-9",
          outstanding: 100,
          dueDateUtc: "2026-10-01T00:00:00Z",
          daysOverdue: 12,
          ageDays: 42,
          status: "overdue",
          branchId: null,
        },
      ],
    })
    expect(due.total_overdue).toBe(100)
    expect(due.suppliers[0].earliest_due_date).toBe("2026-10-01")
    expect(due.bills[0]).toMatchObject({ due_date: "2026-10-01", days_overdue: 12, status: "overdue", bill_date: "2026-09-01" })
  })
})

describe("receivables due", () => {
  it("filters by customer and maps open invoices", () => {
    expect(receivablesDueQuery("2026-10-13", { customerId: "c1", includeAll: true })).toContain("customerId=c1")
    const due = toReceivablesDue({
      asOfUtc: "2026-10-13T18:14:59.999Z",
      withinDays: 7,
      totalOverdue: 0,
      totalDueSoon: 0,
      totalLater: 0,
      totalNoDueDate: 80,
      invoices: [
        {
          customerId: "c1",
          customerName: "Ram",
          ledgerEntryId: "l1",
          entryDateUtc: "2026-10-01T04:00:00Z",
          entryType: "Sale",
          documentNumber: "INV-7",
          referenceType: "Sale",
          referenceId: "s7",
          outstanding: 80,
          dueDateUtc: null,
          daysOverdue: null,
          ageDays: 12,
          status: "weird",
          branchId: null,
        },
      ],
    })
    expect(due.invoices[0]).toMatchObject({ due_date: null, days_overdue: null, status: "no_due_date", entry_date: "2026-10-01" })
  })
})
