import { describe, expect, it } from "vitest"
import {
  buildIrdBillRegisterQuery,
  buyerDetailsIssue,
  IRD_BILL_REGISTER_HEADERS,
  irdBillRegisterCsvRows,
  irdInvoiceType,
  isValidPan,
  type IrdBillRegisterRow,
} from "@/lib/api/ird-api"
import { toDotnetCreateSaleBody } from "@/lib/api/sales-api"
import type { CreateSaleData } from "@/features/sales/api-client"
import { buildInvoicePrintHtml, invoiceTitle, type InvoicePrintInput } from "@/features/sales/lib/invoice-print"

describe("irdInvoiceType", () => {
  it("is abbreviated up to and including the threshold when there is no buyer PAN", () => {
    expect(irdInvoiceType(9_999.99, null, 10_000)).toBe("abbreviated_tax_invoice")
    expect(irdInvoiceType(10_000, "", 10_000)).toBe("abbreviated_tax_invoice")
    expect(irdInvoiceType(10_000.01, null, 10_000)).toBe("tax_invoice")
  })

  it("is a full tax invoice whenever the buyer gives a PAN", () => {
    expect(irdInvoiceType(500, "123456789", 10_000)).toBe("tax_invoice")
  })
})

describe("isValidPan", () => {
  it("accepts exactly nine digits", () => {
    expect(isValidPan("123456789")).toBe(true)
    expect(isValidPan(" 123456789 ")).toBe(true)
    expect(isValidPan("12345678")).toBe(false)
    expect(isValidPan("12345678a")).toBe(false)
    expect(isValidPan(null)).toBe(false)
  })
})

describe("buyerDetailsIssue", () => {
  it("errors on a malformed PAN", () => {
    expect(buyerDetailsIssue(100, "Ram", "1234", 10_000)?.level).toBe("error")
  })

  it("warns above the threshold without a buyer name", () => {
    const issue = buyerDetailsIssue(12_000, "", "", 10_000)
    expect(issue?.level).toBe("warning")
    expect(issue?.message).toContain("10,000")
  })

  it("is quiet for a small walk-in bill or a named large one", () => {
    expect(buyerDetailsIssue(500, "", "", 10_000)).toBeNull()
    expect(buyerDetailsIssue(12_000, "Ram Sharma", "", 10_000)).toBeNull()
  })
})

describe("buildIrdBillRegisterQuery", () => {
  it("sends the fiscal year as the BS start year", () => {
    expect(buildIrdBillRegisterQuery({ fiscalYear: 2083 })).toBe("fiscalYear=2083")
  })

  it("converts Nepal dates to inclusive UTC bounds", () => {
    const params = new URLSearchParams(buildIrdBillRegisterQuery({ from: "2026-10-01", to: "2026-10-31" }))
    expect(params.get("fromUtc")).toBe("2026-09-30T18:15:00.000Z")
    expect(params.get("toUtc")?.startsWith("2026-10-31T18:14:59")).toBe(true)
  })
})

const row: IrdBillRegisterRow = {
  saleId: "s-1",
  fiscalYear: "2083/84",
  billNo: "INV-MAIN-2083/84-00001",
  customerName: "=HYPERLINK(\"x\")",
  customerPan: "987654321",
  billDate: "2083.06.27",
  billDateUtc: "2026-10-13T06:00:00Z",
  amount: 176,
  discount: 13,
  taxableAmount: 100,
  taxAmount: 13,
  exemptAmount: 50,
  totalAmount: 163,
  syncWithIrd: true,
  isBillPrinted: true,
  isBillActive: true,
  printedTimeUtc: "2026-10-13T06:01:00Z",
  enteredBy: "Gita Cashier",
  printedBy: "printer1",
  isRealtime: true,
  paymentMethod: "fonepay",
  vatRefundAmount: 0,
  transactionId: "FP-123",
  printCount: 1,
  irdStatus: "Synced",
  invoiceType: "tax_invoice",
}

describe("irdBillRegisterCsvRows", () => {
  it("emits IRD's materialized-view columns in order", () => {
    expect(IRD_BILL_REGISTER_HEADERS).toEqual([
      "Fiscal_Year", "Bill_No", "Customer_Name", "Customer_PAN", "Bill_Date", "Amount", "Discount", "Taxable_Amount",
      "Tax_Amount", "Total_Amount", "Sync_with_IRD", "Is_Bill_Printed", "Is_Bill_Active", "Printed_Time", "Entered_By",
      "Printed_By", "Is_Realtime", "Payment_Method", "VAT_Refund_Amount", "Transaction_Id",
    ])
    const [cells] = irdBillRegisterCsvRows([row])
    expect(cells).toHaveLength(IRD_BILL_REGISTER_HEADERS.length)
    expect(cells[1]).toBe("INV-MAIN-2083/84-00001")
    expect(cells[5]).toBe("176.00")
    expect(cells[10]).toBe("Yes")
    expect(cells[19]).toBe("FP-123")
  })

  it("neutralises formula injection in free text but leaves negative numbers alone", () => {
    const [cells] = irdBillRegisterCsvRows([{ ...row, vatRefundAmount: -5 }])
    expect(cells[2].startsWith("'=")).toBe(true)
    expect(cells[18]).toBe("-5.00")
  })
})

describe("abbreviated tax invoice print", () => {
  const base: InvoicePrintInput = {
    profile: { name: "Sagarmatha Pharmacy", panVat: "609876543" },
    invoiceNumber: "INV-MAIN-2083/84-00001",
    saleDate: "2026-10-09T06:00:00.000Z",
    lines: [{ name: "Paracetamol", detail: null, quantity: 1, unitPrice: 113, discount: 0, total: 113, taxable: true }],
    vat: { ratePercent: 13, taxableAmount: 100, vatAmount: 13, exemptAmount: 0 },
    total: 113,
    payments: [{ method: "cash", amount: 113 }],
    printNumber: 1,
    format: "thermal-80",
    printedAt: new Date("2026-10-09T06:05:00.000Z"),
  }

  it("prints Abbreviated Tax Invoice below the threshold without a buyer PAN", () => {
    expect(invoiceTitle({ ...base, abbreviatedThreshold: 10_000 })).toBe("Abbreviated Tax Invoice")
    expect(buildInvoicePrintHtml({ ...base, abbreviatedThreshold: 10_000 })).toContain("Abbreviated Tax Invoice")
  })

  it("prints a full Tax Invoice with a buyer PAN, above the threshold, or without IRD settings", () => {
    expect(invoiceTitle({ ...base, abbreviatedThreshold: 10_000, buyerPan: "123456789" })).toBe("Tax Invoice")
    expect(invoiceTitle({ ...base, abbreviatedThreshold: 100 })).toBe("Tax Invoice")
    expect(invoiceTitle(base)).toBe("Tax Invoice")
  })
})

describe("checkout body buyer fields", () => {
  const data: CreateSaleData = {
    sale_number: "S-1",
    customer_id: "",
    total_amount: "113.00",
    discount_amount: "0",
    tax_amount: "13.00",
    payments: [{ method: "cash", amount: 113 }],
    payment_status: "paid",
    sale_date: "2026-10-09T06:00:00.000Z",
    sale_items: [],
  }

  it("sends buyer name / PAN only when entered", () => {
    expect(toDotnetCreateSaleBody(data)).not.toHaveProperty("buyerName")
    const body = toDotnetCreateSaleBody({ ...data, buyer_name: " Ram Sharma ", buyer_pan: "123456789" })
    expect(body.buyerName).toBe("Ram Sharma")
    expect(body.buyerPan).toBe("123456789")
  })
})
