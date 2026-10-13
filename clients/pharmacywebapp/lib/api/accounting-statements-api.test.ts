import { describe, expect, it } from "vitest"
import { endOfDayUtc, startOfDayUtc } from "./accounting-reports-api"
import { profitAndLossColumnsPath, toCashFlowStatement, toProfitAndLossColumns, type DotnetCashFlowStatementDto } from "./accounting-statements-api"

describe("profit & loss columns", () => {
  it("sends periods as repeated fromUtc/toUtc pairs in order", () => {
    const path = profitAndLossColumnsPath(
      [
        { from: "2026-09-17", to: "2026-10-17" },
        { from: "2025-09-17", to: "2025-10-17" },
      ],
      "b1",
    )
    const [base, qs] = path.split("?")
    expect(base).toBe("/accounting/reports/profit-and-loss/columns")
    const p = new URLSearchParams(qs)
    expect(p.getAll("fromUtc")).toEqual([startOfDayUtc("2026-09-17"), startOfDayUtc("2025-09-17")])
    expect(p.getAll("toUtc")).toEqual([endOfDayUtc("2026-10-17"), endOfDayUtc("2025-10-17")])
    expect(p.get("branchId")).toBe("b1")
  })

  it("maps lines and column totals", () => {
    const data = toProfitAndLossColumns(
      {
        branchId: null,
        columns: [{ fromUtc: "x", toUtc: "y", totalRevenue: 100.004, totalExpense: 40, netIncome: 60.004 }],
        lines: [{ accountId: "a", accountCode: "4000", accountName: "Sales", accountType: "Revenue", amounts: [100.004] }],
      },
      [{ from: "2026-09-17", to: "2026-10-17" }],
    )
    expect(data.columns[0]).toEqual({ total_revenue: 100, total_expense: 40, net_income: 60 })
    expect(data.rows[0]).toEqual({ account_id: "a", code: "4000", name: "Sales", account_type: "revenue", amounts: [100] })
  })
})

describe("cash flow statement", () => {
  it("maps the API statement", () => {
    const dto: DotnetCashFlowStatementDto = {
      fromUtc: "2026-08-31T18:15:00Z",
      toUtc: "2026-09-30T18:14:59.999Z",
      branchId: null,
      netProfit: 3860,
      adjustments: [{ key: "depreciation", label: "Depreciation", amount: 500, accounts: [{ accountId: "d", accountCode: "5200", accountName: "Depreciation", amount: 500 }] }],
      workingCapitalChanges: [{ key: "receivables", label: "AR", amount: -2000, accounts: [] }],
      netCashFromOperating: 2360,
      investingLines: [],
      netCashFromInvesting: 0,
      financingLines: [],
      netCashFromFinancing: 0,
      netChangeInCash: 2360,
      openingCash: 1000,
      closingCash: 3360,
      difference: 0,
      isReconciled: true,
      cashAccounts: [{ accountId: "c", accountCode: "1000", accountName: "Cash", opening: 1000, closing: 3360 }],
    }
    const cf = toCashFlowStatement(dto, "2026-09-01", "2026-09-30")
    expect(cf.period_from).toBe("2026-09-01")
    expect(cf.adjustments[0].accounts[0]).toEqual({ account_id: "d", code: "5200", name: "Depreciation", amount: 500 })
    expect(cf.working_capital[0].amount).toBe(-2000)
    expect(cf.cash_accounts[0].closing).toBe(3360)
    expect(cf.opening_cash + cf.net_change).toBe(cf.closing_cash)
  })
})
