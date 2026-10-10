import { describe, expect, it } from "vitest"
import {
  buildInvoicePrintHtml,
  copyMarking,
  invoiceTitle,
  isInvoicePaperFormat,
  paymentMethodLabel,
  type InvoicePrintInput,
} from "./invoice-print"

function input(overrides: Partial<InvoicePrintInput> = {}): InvoicePrintInput {
  return {
    profile: { name: "Sagarmatha Pharmacy", address: "Baneshwor, Kathmandu", phone: "01-4000000", panVat: "609876543" },
    branchName: "Main",
    invoiceNumber: "INV-MAIN-2083/84-00001",
    fiscalYear: "2083/84",
    saleDate: "2026-10-09T06:00:00.000Z",
    buyerName: null,
    lines: [
      { name: "Paracetamol 500mg", detail: "500mg Tablet", quantity: 1, unitPrice: 113, discount: 0, total: 113, taxable: true },
      { name: "ORS Sachet", detail: null, quantity: 2, unitPrice: 25, discount: 0, total: 50, taxable: false },
    ],
    vat: { ratePercent: 13, taxableAmount: 100, vatAmount: 13, exemptAmount: 50 },
    total: 163,
    payments: [{ method: "cash", amount: 163 }],
    printNumber: 1,
    format: "thermal-80",
    printedAt: new Date("2026-10-09T06:05:00.000Z"),
    ...overrides,
  }
}

describe("invoice print", () => {
  it("prints the IRD essentials: seller PAN, invoice number, fiscal year, VAT breakdown, amount in words", () => {
    const html = buildInvoicePrintHtml(input())
    expect(html).toContain("PAN/VAT No: 609876543")
    expect(html).toContain("INV-MAIN-2083/84-00001")
    expect(html).toContain("2083/84")
    expect(html).toContain("Taxable Amount")
    expect(html).toContain("VAT 13%")
    expect(html).toContain("Exempt Amount")
    expect(html).toContain("Rupees One Hundred Sixty-Three Only")
    expect(html).toContain("* VAT-exempt item")
    expect(html).toContain("Tax Invoice")
  })

  it("marks reprints as copies and the first print as original", () => {
    expect(copyMarking(0)).toBeNull()
    expect(copyMarking(1)).toBe("ORIGINAL")
    expect(copyMarking(2)).toBe("COPY OF ORIGINAL — 1")
    expect(buildInvoicePrintHtml(input({ printNumber: 3 }))).toContain("COPY OF ORIGINAL — 2")
    expect(buildInvoicePrintHtml(input({ printNumber: 1 }))).not.toContain("COPY OF ORIGINAL")
    expect(buildInvoicePrintHtml(input({ printNumber: 1 }))).toContain("ORIGINAL")
    expect(buildInvoicePrintHtml(input({ printNumber: 0 }))).not.toContain("ORIGINAL")
  })

  it("uses the right title for registered, unregistered and provisional documents", () => {
    expect(invoiceTitle(input())).toBe("Tax Invoice")
    expect(invoiceTitle(input({ profile: { name: "X" } }))).toBe("Invoice")
    expect(invoiceTitle(input({ invoiceNumber: null }))).toBe("Provisional Receipt")
  })

  it("omits the VAT breakdown for legacy sales recorded without it", () => {
    const html = buildInvoicePrintHtml(input({ vat: null }))
    expect(html).not.toContain("Taxable Amount")
    expect(html).toContain("Grand Total")
  })

  it("sizes the page for each paper format", () => {
    expect(buildInvoicePrintHtml(input({ format: "thermal-58" }))).toContain("size: 58mm auto")
    expect(buildInvoicePrintHtml(input({ format: "thermal-80" }))).toContain("size: 80mm auto")
    expect(buildInvoicePrintHtml(input({ format: "a5" }))).toContain("size: A5")
  })

  it("escapes user-entered text", () => {
    const html = buildInvoicePrintHtml(input({ buyerName: "<script>alert(1)</script>" }))
    expect(html).not.toContain("<script>alert(1)</script>")
    expect(html).toContain("&lt;script&gt;")
  })

  it("prints a credit note against its invoice", () => {
    const html = buildInvoicePrintHtml(
      input({
        kind: "credit-note",
        invoiceNumber: "CN-MAIN-2083/84-00001",
        againstInvoice: "INV-MAIN-2083/84-00042",
        reason: "Damaged pack",
        printNumber: 2,
      }),
    )
    expect(invoiceTitle(input({ kind: "credit-note" }))).toBe("Credit Note")
    expect(html).toContain("Credit Note No")
    expect(html).toContain("CN-MAIN-2083/84-00001")
    expect(html).toContain("Against Invoice")
    expect(html).toContain("INV-MAIN-2083/84-00042")
    expect(html).toContain("Damaged pack")
    expect(html).toContain("Total Credit")
    expect(html).toContain("COPY OF ORIGINAL — 1")
    expect(html).not.toContain("Grand Total")
  })

  it("validates paper formats and labels payment methods", () => {
    expect(isInvoicePaperFormat("a5")).toBe(true)
    expect(isInvoicePaperFormat("a4")).toBe(false)
    expect(paymentMethodLabel("esewa")).toBe("eSewa")
    expect(paymentMethodLabel("credit")).toBe("Credit (on account)")
  })
})
