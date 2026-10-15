import { describe, expect, it } from "vitest"
import {
  customerStatementBounds,
  customerStatementQuery,
  toCustomerStatement,
  type DotnetCustomerStatementDto,
} from "@/lib/api/customers-api"

const dto: DotnetCustomerStatementDto = {
  customerId: "c1",
  customerName: "Ram Bahadur",
  customerCode: "C-000001",
  phone: "9800000000",
  panNumber: null,
  creditLimit: 5000,
  creditDays: 30,
  periodFromUtc: "2026-02-28T18:15:00Z",
  periodToUtc: "2026-03-31T18:14:59.999Z",
  openingBalance: 700,
  totalDebits: 200.456,
  totalCredits: 100,
  closingBalance: 800.456,
  lines: [
    {
      id: "l1",
      // 20:00 UTC on 4 March is already 5 March in Nepal.
      entryDateUtc: "2026-03-04T20:00:00Z",
      entryType: "Sale",
      description: "Credit sale",
      documentNumber: "INV-1",
      debitAmount: 200.456,
      creditAmount: 0,
      runningBalance: 900.456,
      isVoided: false,
      dueDateUtc: "2026-04-03T20:00:00Z",
    },
    {
      id: "l2",
      entryDateUtc: "2026-03-10T08:00:00Z",
      entryType: "Payment",
      description: null,
      documentNumber: "RCP-1",
      debitAmount: 0,
      creditAmount: 100,
      runningBalance: 800.456,
      isVoided: true,
      dueDateUtc: null,
    },
  ],
  ageing: {
    current: 800.456,
    days31To60: 0,
    days61To90: 0,
    over90: 0,
    unappliedAdvance: 0,
    netBalance: 800.456,
    overdueAmount: 0,
    earliestDueDateUtc: "2026-04-03T20:00:00Z",
  },
}

describe("customerStatementBounds and customerStatementQuery", () => {
  it("widens the range to whole Nepal days (UTC+05:45)", () => {
    expect(customerStatementBounds("2026-03-01", "2026-03-31")).toEqual({
      fromUtc: "2026-02-28T18:15:00.000Z",
      toUtc: "2026-03-31T18:14:59.999Z",
    })
  })

  it("rejects non date-only or inverted input", () => {
    expect(() => customerStatementBounds("01/03/2026", "2026-03-31")).toThrow(/YYYY-MM-DD/)
    expect(() => customerStatementBounds("2026-04-01", "2026-03-31")).toThrow(/on or before/)
  })

  it("builds the statement URL with an optional branch", () => {
    expect(customerStatementQuery("c 1", "2026-03-01", "2026-03-31")).toBe(
      "/api/v1/customers/c%201/statement?fromUtc=2026-02-28T18%3A15%3A00.000Z&toUtc=2026-03-31T18%3A14%3A59.999Z",
    )
    expect(customerStatementQuery("c1", "2026-03-01", "2026-03-31", "b1")).toMatch(/&branchId=b1$/)
  })
})

describe("toCustomerStatement", () => {
  const s = toCustomerStatement(dto, "2026-03-01", "2026-03-31")

  it("keeps the requested period and rounds money to paisa", () => {
    expect(s.period_from).toBe("2026-03-01")
    expect(s.period_to).toBe("2026-03-31")
    expect(s.opening_balance).toBe(700)
    expect(s.total_debits).toBe(200.46)
    expect(s.closing_balance).toBe(800.46)
    expect(s.credit_days).toBe(30)
  })

  it("maps lines to Nepal business days and legacy entry types", () => {
    expect(s.lines[0]).toMatchObject({ entry_date: "2026-03-05", entry_type: "invoice", document_number: "INV-1", due_date: "2026-04-04" })
    expect(s.lines[1]).toMatchObject({ entry_type: "payment", is_voided: true, credit: 100, due_date: null })
  })

  it("maps the ageing", () => {
    expect(s.ageing).toEqual({
      current: 800.46,
      days_31_60: 0,
      days_61_90: 0,
      over_90: 0,
      unapplied_advance: 0,
      net_balance: 800.46,
      overdue: 0,
      earliest_due_date: "2026-04-04",
    })
  })

  it("fails loudly on an unknown entry type", () => {
    expect(() => toCustomerStatement({ ...dto, lines: [{ ...dto.lines[0], entryType: "Mystery" }] }, "2026-03-01", "2026-03-31")).toThrow(
      /Unknown customer ledger entry type/,
    )
  })
})
