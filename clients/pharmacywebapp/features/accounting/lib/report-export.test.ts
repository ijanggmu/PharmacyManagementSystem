import { describe, expect, it } from "vitest"
import {
  XLSX_AMOUNT_FORMAT,
  XLSX_PERCENT_FORMAT,
  buildSheetLayout,
  formatReportAmount,
  formatReportCell,
  formatReportPercent,
  pdfText,
  reportFilename,
  reportHeaderLines,
  reportNeedsDevanagari,
  reportPeriodLine,
  type ReportDocument,
} from "./report-export"
import { agingDocument, cashFlowDocument, profitAndLossDocument, trialBalanceDocument } from "./statement-documents"
import { buildTrialBalanceView } from "./period-trial-balance"
import type { CashFlowStatement } from "@/lib/api/accounting-statements-api"

const profile = { name: "Himal Pharmacy", legalName: "Himal Pharmacy Pvt. Ltd.", address: "Baneshwor, Kathmandu", panVat: "601234567", phone: "01-4000000" }

describe("number formatting", () => {
  it("groups digits the Nepali way, brackets negatives and dashes zero", () => {
    expect(formatReportAmount(1234567.5)).toBe("12,34,567.50")
    expect(formatReportAmount(-1250)).toBe("(1,250.00)")
    expect(formatReportAmount(0)).toBe("-")
    expect(formatReportAmount(-0.001)).toBe("-")
    expect(formatReportAmount(null)).toBe("")
    expect(formatReportAmount(Number.NaN)).toBe("")
  })

  it("formats percentages with one decimal", () => {
    expect(formatReportPercent(12.345)).toBe("12.3%")
    expect(formatReportPercent(-100)).toBe("-100.0%")
    expect(formatReportPercent(null)).toBe("")
    expect(formatReportCell(25, "percent")).toBe("25.0%")
    expect(formatReportCell(25, "amount")).toBe("25.00")
    expect(formatReportCell("Sales")).toBe("Sales")
  })

  it("keeps PDF text within the built-in font's character set", () => {
    expect(pdfText("Dr − Cr")).toBe("Dr - Cr")
    expect(pdfText("1 Shrawan 2083 – 31 Ashwin · BS")).toBe("1 Shrawan 2083 – 31 Ashwin · BS")
    expect(pdfText("राम Traders")).toBe("??? Traders")
  })

  it("keeps Devanagari when the Devanagari font is registered", () => {
    expect(pdfText("राम Traders", true)).toBe("राम Traders")
    expect(pdfText("Dr − Cr ₹ 1,000", true)).toBe("Dr - Cr ₹ 1,000")
    expect(pdfText("北京", true)).toBe("??")
  })
})

describe("Devanagari font need", () => {
  const base: ReportDocument = {
    title: "Receivables",
    profile,
    period: { kind: "asOf", date: "2026-10-08" },
    columns: [{ header: "Customer" }, { header: "Balance", kind: "amount" }],
    rows: [{ cells: ["Ram Traders", 1200] }],
  }

  it("is false for an all-Latin report", () => {
    expect(reportNeedsDevanagari(base)).toBe(false)
  })

  it("is true when a cell, the letterhead, a header or a note has Devanagari", () => {
    expect(reportNeedsDevanagari({ ...base, rows: [{ cells: ["राम ट्रेडर्स", 1200] }] })).toBe(true)
    expect(reportNeedsDevanagari({ ...base, profile: { ...profile, name: "हिमाल फार्मेसी" } })).toBe(true)
    expect(reportNeedsDevanagari({ ...base, columns: [{ header: "ग्राहक" }, { header: "Balance", kind: "amount" }] })).toBe(true)
    expect(reportNeedsDevanagari({ ...base, notes: ["कैफियत"] })).toBe(true)
    expect(reportNeedsDevanagari({ ...base, branchName: "पोखरा" })).toBe(true)
  })
})

describe("header", () => {
  it("prints the period in BS first, then AD", () => {
    expect(reportPeriodLine({ kind: "range", from: "2026-07-17", to: "2026-10-17" })).toBe(
      "For the period 1 Shrawan 2083 – 31 Ashwin 2083 (BS) · 17 Jul 2026 – 17 Oct 2026 (AD)",
    )
    expect(reportPeriodLine({ kind: "asOf", date: "2026-10-08" })).toBe("As at 22 Ashwin 2083 (BS) · 8 Oct 2026 (AD)")
  })

  it("stacks letterhead, PAN, title, period and branch", () => {
    const lines = reportHeaderLines({
      profile,
      title: "Balance Sheet",
      subtitle: null,
      period: { kind: "asOf", date: "2026-10-08" },
      branchName: "New Road",
    })
    expect(lines).toEqual([
      "Himal Pharmacy",
      "Himal Pharmacy Pvt. Ltd.",
      "Baneshwor, Kathmandu",
      "PAN/VAT: 601234567   Phone: 01-4000000",
      "Balance Sheet",
      "As at 22 Ashwin 2083 (BS) · 8 Oct 2026 (AD)",
      "Branch: New Road",
    ])
    expect(reportHeaderLines({ profile: { name: "X" }, title: "T", period: { kind: "asOf", date: "2026-10-08" } }).at(-1)).toBe("All branches")
  })

  it("names files after the report and its AD dates", () => {
    expect(reportFilename("Profit & Loss", { kind: "range", from: "2026-07-17", to: "2026-10-17" }, "pdf")).toBe(
      "profit-loss_2026-07-17_2026-10-17.pdf",
    )
    expect(reportFilename("balance-sheet", { kind: "asOf", date: "2026-10-08" }, "xlsx")).toBe("balance-sheet_2026-10-08.xlsx")
  })
})

describe("sheet layout", () => {
  const doc: ReportDocument = {
    ...profitAndLossDocument(
      {
        revenue: [{ code: "4000", name: "Sales", amount: 1500.456 }],
        expense: [{ code: "5000", name: "COGS", amount: 900 }],
        totalRevenue: 1500.456,
        totalExpense: 900,
        net: 600.456,
      },
      { from: "2026-07-17", to: "2026-10-17" },
      { branchName: null },
    ),
    profile,
    generatedAt: new Date(2026, 9, 13, 10, 30),
  }

  it("puts the letterhead above the table, merged across its width", () => {
    const layout = buildSheetLayout(doc)
    const headerLines = reportHeaderLines(doc)
    expect(layout.aoa.slice(0, headerLines.length).map((r) => r[0])).toEqual(headerLines)
    expect(layout.merges[0]).toEqual({ s: { r: 0, c: 0 }, e: { r: 0, c: 2 } })
    expect(layout.aoa[layout.headerRow]).toEqual(["Code", "Particulars", "Amount (Rs)"])
    expect(layout.colWidths).toHaveLength(3)
    expect(String(layout.aoa.at(-1)?.[0])).toMatch(/^Generated /)
  })

  it("keeps amounts as rounded numbers with an accounting number format", () => {
    const layout = buildSheetLayout(doc)
    const salesRow = layout.aoa.findIndex((r) => r[1] === "Sales")
    expect(layout.aoa[salesRow][2]).toBe(1500.46)
    expect(layout.formats).toContainEqual([salesRow, 2, XLSX_AMOUNT_FORMAT])
    const netRow = layout.aoa.findIndex((r) => r[1] === "Net profit")
    expect(layout.aoa[netRow][2]).toBe(600.46)
    // section rows leave the amount cell empty instead of 0
    const sectionRow = layout.aoa.findIndex((r) => r[1] === "Revenue")
    expect(layout.aoa[sectionRow][2]).toBe("")
  })

  it("stores percentages as fractions with a percent format", () => {
    const layout = buildSheetLayout({
      profile,
      title: "T",
      period: { kind: "asOf", date: "2026-10-08" },
      columns: [{ header: "Name" }, { header: "Change", kind: "percent" }],
      rows: [{ cells: ["Sales", 12.5] }, { cells: ["Rent", null] }],
    })
    const row = layout.aoa.findIndex((r) => r[0] === "Sales")
    expect(layout.aoa[row][1]).toBe(0.125)
    expect(layout.formats).toContainEqual([row, 1, XLSX_PERCENT_FORMAT])
  })
})

describe("statement documents", () => {
  it("lays out the cash flow statement with its check line", () => {
    const cf: CashFlowStatement = {
      period_from: "2026-09-01",
      period_to: "2026-09-30",
      branch_id: null,
      net_profit: 3860,
      adjustments: [{ key: "depreciation", label: "Depreciation", amount: 500, accounts: [] }],
      working_capital: [{ key: "receivables", label: "(Increase)/decrease in accounts receivable", amount: -2000, accounts: [] }],
      net_cash_operating: 2360,
      investing: [{ key: "account:1510", label: "Shop fit-out", amount: -20000, accounts: [] }],
      net_cash_investing: -20000,
      financing: [{ key: "account:2500", label: "Bank Loan", amount: 15000, accounts: [] }],
      net_cash_financing: 15000,
      net_change: -2640,
      opening_cash: 106130,
      closing_cash: 103490,
      difference: 0,
      is_reconciled: true,
      cash_accounts: [],
    }
    const doc = cashFlowDocument(cf, { branchName: "Main" })
    const labels = doc.rows.map((r) => String(r.cells[0]).trim())
    expect(labels[0]).toMatch(/^A\. Cash flows from operating/)
    expect(doc.rows.find((r) => String(r.cells[0]).includes("Net increase"))?.cells[1]).toBe(-2640)
    expect(doc.rows.at(-1)?.cells).toEqual(["Cash and cash equivalents at the end of the period", 103490])
    expect(doc.notes?.[0]).toMatch(/^Check: /)
    expect(cashFlowDocument({ ...cf, is_reconciled: false, difference: 12.5 }).notes?.[0]).toMatch(/FAILED.*12\.50/)
  })

  it("lays out the trial balance with group subtotals and a total", () => {
    const view = buildTrialBalanceView([
      { accountId: "a", code: "1000", name: "Cash", accountType: "asset", openingDebit: 100, openingCredit: 0, periodDebit: 50, periodCredit: 0, openingVoucherDebit: 0, openingVoucherCredit: 0, yearEndCloseDebit: 0, yearEndCloseCredit: 0 },
      { accountId: "b", code: "4000", name: "Sales", accountType: "revenue", openingDebit: 0, openingCredit: 100, periodDebit: 0, periodCredit: 50, openingVoucherDebit: 0, openingVoucherCredit: 0, yearEndCloseDebit: 0, yearEndCloseCredit: 0 },
    ])
    const doc = trialBalanceDocument(view, true, { from: "2026-09-01", to: "2026-09-30" })
    expect(doc.columns).toHaveLength(8)
    expect(doc.rows.filter((r) => r.style === "section").map((r) => r.cells[1])).toEqual(["Assets", "Revenue"])
    expect(doc.rows.at(-1)?.cells).toEqual(["", "Total", 100, 100, 50, 50, 150, 150])
    expect(doc.notes?.at(-1)).toMatch(/balance/)
  })

  it("totals the aging buckets", () => {
    const doc = agingDocument(
      "receivable",
      [
        { name: "A", balance: 100, current: 60, days_31_60: 40, days_61_90: 0, days_90_plus: 0 },
        { name: "B", balance: 50, current: 0, days_31_60: 0, days_61_90: 0, days_90_plus: 50 },
      ],
      "2026-10-08",
    )
    expect(doc.title).toBe("Accounts Receivable Aging")
    expect(doc.rows.at(-1)?.cells).toEqual(["Total", 150, 60, 40, 0, 50])
  })
})
