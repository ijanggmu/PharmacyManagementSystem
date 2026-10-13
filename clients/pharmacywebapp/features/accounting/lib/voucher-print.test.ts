import { describe, expect, it } from "vitest"
import type { AccountingVoucherRow, VoucherLineView } from "@/features/accounting/api-client"
import { buildVoucherPrintHtml, formatPrintAmount } from "./voucher-print"
import { voucherDocumentTitle, voucherIdentifier, voucherTypeLabel, displayUserName, isBalanced } from "./voucher-meta"

const voucher: AccountingVoucherRow = {
  id: "v1",
  voucher_no: "JV-000123",
  voucher_date: "2026-10-08",
  voucher_type: "journal",
  source: "manual",
  status: "posted",
  narration: `<img src=x onerror="alert(1)">`,
  reference_type: null,
  reference_id: null,
  posted_at: "2026-10-08T05:00:00Z",
  posted_by: "Asha <admin>",
}

const lines: VoucherLineView[] = [
  {
    id: "v1:1",
    line_no: 1,
    account_id: "a1",
    description: `Rent "Oct" & co`,
    debit_amount: 74.1,
    credit_amount: 0,
    accounting_accounts: { code: "6100", name: "Rent <expense>" },
  },
  {
    id: "v1:2",
    line_no: 2,
    account_id: "a2",
    description: null,
    debit_amount: 0,
    credit_amount: 74.1,
    accounting_accounts: { code: "1000", name: "Cash" },
  },
]

const profile = { name: "Sagarmatha <Pharmacy>", address: "Kathmandu", phone: "01-4000000", panVat: "123456789" }

describe("buildVoucherPrintHtml", () => {
  const html = buildVoucherPrintHtml({ voucher, lines, profile, printedAt: new Date(2026, 9, 8, 10, 0) })

  it("escapes every user-controlled value", () => {
    expect(html).not.toContain(`<img src=x`)
    expect(html).toContain("&lt;img src=x onerror=&quot;alert(1)&quot;&gt;")
    expect(html).toContain("Rent &lt;expense&gt;")
    expect(html).toContain("Rent &quot;Oct&quot; &amp; co")
    expect(html).toContain("Sagarmatha &lt;Pharmacy&gt;")
    expect(html).toContain("Asha &lt;admin&gt;")
  })

  it("renders the title, totals, amount in words and BS date", () => {
    expect(html).toContain("Journal Voucher")
    expect(html).toContain("74.10")
    expect(html).toContain("Rupees Seventy-Four and Ten Paisa Only")
    expect(html).toContain("22 Ashwin 2083")
    expect(html).toContain("Debits equal credits")
    expect(html).toContain("PAN/VAT No.")
  })

  it("adds a VOID watermark for void vouchers and DRAFT for drafts", () => {
    const voidHtml = buildVoucherPrintHtml({ voucher: { ...voucher, status: "void" }, lines, profile, voidReason: "<b>dup</b>" })
    expect(voidHtml).toContain(`class="watermark"`)
    expect(voidHtml).toContain(">VOID</div>")
    expect(voidHtml).toContain("&lt;b&gt;dup&lt;/b&gt;")
    const draftHtml = buildVoucherPrintHtml({ voucher: { ...voucher, status: "draft" }, lines, profile })
    expect(draftHtml).toContain(">DRAFT</div>")
    expect(html).not.toContain(`class="watermark`)
  })

  it("flags an unbalanced voucher", () => {
    const bad = buildVoucherPrintHtml({ voucher, lines: [lines[0]], profile })
    expect(bad).toContain("Out of balance by Rs 74.10")
  })

  it("keeps the @page footer string CSS-safe", () => {
    const tricky = buildVoucherPrintHtml({ voucher: { ...voucher, voucher_no: `X"</style><script>` }, lines, profile })
    expect(tricky).not.toContain("</style><script>")
  })
})

describe("formatPrintAmount", () => {
  it("uses two decimals and lakh grouping", () => {
    expect(formatPrintAmount(1234567.5)).toBe("12,34,567.50")
    expect(formatPrintAmount(0)).toBe("0.00")
  })
})

describe("voucher-meta", () => {
  it("identifies manual journals", () => {
    expect(voucherIdentifier({ source: "manual", voucher_type: "journal" })).toBe("MJE")
    expect(voucherIdentifier({ source: "system", voucher_type: "system_sale" })).toBe("SYS")
    expect(voucherIdentifier({ source: "Manual", voucher_type: "journal" })).toBe("MJE")
  })

  it("titles documents by type", () => {
    expect(voucherDocumentTitle("journal")).toBe("Journal Voucher")
    expect(voucherDocumentTitle("system_sale")).toBe("Sales Voucher")
    expect(voucherDocumentTitle("system_purchase")).toBe("Purchase Voucher")
    expect(voucherDocumentTitle("system_customer_payment")).toBe("Receipt Voucher")
    expect(voucherDocumentTitle("system_supplier_payment")).toBe("Payment Voucher")
    expect(voucherDocumentTitle("mystery")).toBe("Voucher")
  })

  it.each([
    ["system_sales_return", "Credit Note"],
    ["system_refund", "Credit Note"],
    ["system_purchase_return", "Debit Note"],
    ["system_expense", "Payment Voucher"],
    ["system_vat_payment", "Payment Voucher"],
    ["system_tds_payment", "Payment Voucher"],
    ["system_bank_deposit", "Contra Voucher"],
    ["system_inventory_adjustment", "Journal Voucher"],
    ["system_stock_transfer", "Journal Voucher"],
    ["system_consignment_settlement", "Journal Voucher"],
    ["system_opening_stock", "Opening Balance Voucher"],
    ["system_opening_balance", "Opening Balance Voucher"],
    ["opening_balance", "Opening Balance Voucher"],
  ])("titles %s as %s", (type, title) => {
    expect(voucherDocumentTitle(type)).toBe(title)
  })

  it("labels types and hides user ids", () => {
    expect(voucherTypeLabel("system_purchase_return")).toBe("Purchase return")
    expect(voucherTypeLabel("system_vat_payment")).toBe("VAT payment")
    expect(voucherTypeLabel("system_tds_payment")).toBe("TDS deposit")
    expect(voucherTypeLabel("system_stock_transfer")).toBe("Stock transfer")
    expect(voucherTypeLabel("system_sales_return")).toBe("Sales return")
    expect(voucherTypeLabel("system_new_kind")).toBe("New Kind")
    expect(displayUserName("3f2a9c1b-1234-4abc-9def-001122334455")).toBeNull()
    expect(displayUserName(" Asha ")).toBe("Asha")
  })

  it("compares balances to the paisa", () => {
    expect(isBalanced(0.1 + 0.2, 0.3)).toBe(true)
    expect(isBalanced(10, 10.01)).toBe(false)
  })
})
