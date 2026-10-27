import { describe, expect, it } from "vitest"
import { receivedBills, receivedStockTotals, supplierPaymentNote, type ReceivedStockLine } from "./stock-receipt-summary"

const line = (over: Partial<ReceivedStockLine> = {}): ReceivedStockLine => ({
  medicineName: "Cetamol",
  batchNumber: "C-1",
  expiryDate: "2027-12-31",
  quantity: 100,
  unitCost: 1.25,
  sellingPrice: 2,
  vat: 0,
  ...over,
})

describe("receivedStockTotals", () => {
  it("adds goods value and VAT like the posted bill", () => {
    expect(receivedStockTotals([line(), line({ quantity: 10, unitCost: 4, vat: 5.2 })])).toEqual({
      lineCount: 2,
      quantity: 110,
      goods: 165,
      vat: 5.2,
      total: 170.2,
    })
  })
})

describe("receivedBills", () => {
  it("drops card-only rows and bills left empty", () => {
    const bills = receivedBills([
      { supplierName: "A", invoiceNumber: "1", receiptDate: "2026-10-27", paymentNote: null, lines: [line(), line({ quantity: 0 })] },
      { supplierName: null, invoiceNumber: null, receiptDate: "2026-10-27", paymentNote: null, lines: [line({ quantity: 0 })] },
    ])
    expect(bills).toHaveLength(1)
    expect(bills[0].lines).toHaveLength(1)
  })
})

describe("supplierPaymentNote", () => {
  it("names credit or the paid method", () => {
    expect(supplierPaymentNote({ paid: false, method: "cash" })).toBe("On credit")
    expect(supplierPaymentNote({ paid: true, method: "bank" })).toBe("Paid · Bank transfer")
  })
})
