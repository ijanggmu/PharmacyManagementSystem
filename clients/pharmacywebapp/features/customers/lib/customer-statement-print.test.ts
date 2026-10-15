import { describe, expect, it } from "vitest"
import type { CustomerStatement } from "@/lib/api/customers-api"
import {
  buildCustomerStatementPrintHtml,
  customerStatementCsv,
  formatStatementBalance,
  statementSettleNote,
} from "./customer-statement-print"

function statement(overrides: Partial<CustomerStatement> = {}): CustomerStatement {
  return {
    customer_id: "c1",
    customer_name: "Ram <Bahadur> & Sons",
    customer_code: "C-000123",
    phone: "9800000000",
    pan_number: "123456789",
    credit_limit: 10000,
    credit_days: 30,
    period_from: "2026-09-17",
    period_to: "2026-10-17",
    opening_balance: 1000,
    total_debits: 1500,
    total_credits: 700,
    closing_balance: 1800,
    lines: [
      {
        id: "l1",
        entry_date: "2026-09-20",
        entry_type: "invoice",
        description: "Sale <script>alert(1)</script>",
        document_number: "INV-0001",
        debit: 1500,
        credit: 0,
        balance: 2500,
        is_voided: false,
        due_date: "2026-10-20",
      },
      {
        id: "l2",
        entry_date: "2026-09-25",
        entry_type: "payment",
        description: null,
        document_number: "RCP-0007",
        debit: 0,
        credit: 700,
        balance: 1800,
        is_voided: true,
        due_date: null,
      },
    ],
    ageing: {
      current: 1500,
      days_31_60: 300,
      days_61_90: 0,
      over_90: 0,
      unapplied_advance: 0,
      net_balance: 1800,
      overdue: 0,
      earliest_due_date: "2026-10-20",
    },
    ...overrides,
  }
}

const printedAt = new Date("2026-10-15T04:00:00Z")

describe("buildCustomerStatementPrintHtml", () => {
  const html = buildCustomerStatementPrintHtml({
    statement: statement(),
    profile: { name: "City Pharmacy", address: "Kathmandu", phone: "01-4000000", panVat: "601234567" },
    printedAt,
  })

  it("escapes customer-supplied text", () => {
    expect(html).toContain("Ram &lt;Bahadur&gt; &amp; Sons")
    expect(html).not.toContain("Ram <Bahadur>")
    expect(html).toContain("Sale &lt;script&gt;alert(1)&lt;/script&gt;")
    expect(html).not.toContain("<script>")
  })

  it("shows the letterhead, customer block and terms", () => {
    expect(html).toContain("City Pharmacy")
    expect(html).toContain("601234567")
    expect(html).toContain("C-000123")
    expect(html).toContain("123456789")
    expect(html).toContain("Net 30")
    expect(html).toContain("Statement of account")
  })

  it("prints the totals, amount due and ageing", () => {
    expect(html).toContain("1,000.00 Dr")
    expect(html).toContain("1,500.00")
    expect(html).toContain("700.00")
    expect(html).toContain("Rs 1,800.00")
    expect(html).toContain("300.00")
    expect(html).toContain("Rupees One Thousand Eight Hundred Only")
  })

  it("marks voided lines", () => {
    expect(html).toContain('<tr class="voided">')
    expect(html).toContain("VOIDED")
    // A payment without a description falls back to its type label.
    expect(html).toContain("Payment received")
  })

  it("asks to settle by the earliest due date", () => {
    expect(html).toContain("Please settle Rs 1,800.00 by")
  })

  it("prints the period in BS and AD", () => {
    // 2026-09-17 is 1 Ashwin 2083; 2026-10-17 is 31 Ashwin 2083.
    expect(html).toMatch(/1 Ashwin 2083 – \d+ Ashwin 2083 \(BS\)/)
    expect(html).toMatch(/Oct 2026 \(AD\)/)
  })
})

describe("statementSettleNote", () => {
  it("is null when nothing is due", () => {
    expect(statementSettleNote(statement({ closing_balance: 0 }), "2026-10-15")).toBeNull()
    expect(statementSettleNote(statement({ closing_balance: -200 }), "2026-10-15")).toBeNull()
  })

  it("asks for the overdue part at once", () => {
    const s = statement({ ageing: { ...statement().ageing, overdue: 300 } })
    expect(statementSettleNote(s, "2026-10-15")).toBe("Rs 300.00 is past due. Please settle it at the earliest.")
  })
})

describe("formatStatementBalance", () => {
  it("marks debit and credit balances", () => {
    expect(formatStatementBalance(1234.5)).toBe("1,234.50 Dr")
    expect(formatStatementBalance(-250)).toBe("250.00 Cr")
    expect(formatStatementBalance(0.001)).toBe("0.00")
  })
})

describe("customerStatementCsv", () => {
  it("has opening, line and closing rows", () => {
    const { headers, rows } = customerStatementCsv(statement())
    expect(headers[0]).toBe("Date (BS)")
    expect(rows).toHaveLength(4)
    expect(rows[0][3]).toBe("Opening balance")
    expect(rows[2][7]).toBe("Yes")
    expect(rows[3]).toEqual(expect.arrayContaining(["Closing balance", "1500.00", "700.00", "1800.00"]))
  })
})
