import { describe, expect, it } from "vitest"
import { buildDebitNotePrintHtml } from "./debit-note-print"

describe("buildDebitNotePrintHtml", () => {
  const html = buildDebitNotePrintHtml({
    profile: { name: "City Pharmacy", panVat: "601234567" },
    supplier: { name: "Acme <Pharma>", address: "Kathmandu", panVat: "300111222" },
    branchName: "Main",
    printedAt: new Date("2026-10-11T10:00:00Z"),
    debitNote: {
      id: "r1",
      supplierId: "s1",
      returnDateUtc: "2026-10-11T00:00:00Z",
      notes: null,
      totalCost: 100,
      vatAmount: 13,
      totalAmount: 113,
      createdAtUtc: "2026-10-11T00:00:00Z",
      documentNumber: "DN-MAIN-2083/84-00001",
      supplierInvoiceNumber: "INV-77",
      items: [
        {
          id: "i1",
          medicineId: "m1",
          medicineName: "Cetamol 500mg",
          quantity: 10,
          unitCost: 10,
          totalCost: 100,
          returnReason: "near_expiry",
          notes: null,
          batchNo: "B-42",
          vatAmount: 13,
        },
      ],
    },
  })

  it("shows the number, bill, lot, VAT and total", () => {
    expect(html).toContain("DN-MAIN-2083/84-00001")
    expect(html).toContain("INV-77")
    expect(html).toContain("B-42")
    expect(html).toContain("Near expiry")
    expect(html).toContain("13.00")
    expect(html).toContain("113.00")
  })

  it("escapes names", () => {
    expect(html).toContain("Acme &lt;Pharma&gt;")
    expect(html).not.toContain("Acme <Pharma>")
  })
})
