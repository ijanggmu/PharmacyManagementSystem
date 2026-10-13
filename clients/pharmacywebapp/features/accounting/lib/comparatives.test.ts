import { describe, expect, it } from "vitest"
import type { BalanceSheetView } from "@/lib/api/accounting-reports-api"
import type { ProfitAndLossColumns } from "@/lib/api/accounting-statements-api"
import {
  bsMonthLength,
  buildBalanceSheetComparison,
  buildProfitAndLossComparison,
  buildProfitAndLossTrend,
  comparisonPeriod,
  fiscalYearMonths,
  previousPeriod,
  samePeriodLastYear,
  variance,
} from "./comparatives"
import { formatBsYmd } from "./date-presets"

const bs = (ymd: string) => formatBsYmd(ymd)

describe("comparison periods", () => {
  // Ashwin 2083 = 2026-09-17 .. 2026-10-17
  const ashwin = fiscalYearMonths(2083)[2]

  it("steps a whole BS month back to the previous BS month", () => {
    expect(bs(ashwin.from)).toBe("2083-06-01")
    const prev = previousPeriod(ashwin)
    expect(bs(prev.from)).toBe("2083-05-01")
    expect(bs(prev.to)).toBe(`2083-05-${String(bsMonthLength(2083, 4)).padStart(2, "0")}`)
    // contiguous: the previous period ends the day before the current one starts
    const dayAfter = new Date(`${prev.to}T00:00:00Z`)
    dayAfter.setUTCDate(dayAfter.getUTCDate() + 1)
    expect(dayAfter.toISOString().slice(0, 10)).toBe(ashwin.from)
  })

  it("steps a fiscal year back to the previous fiscal year", () => {
    const months = fiscalYearMonths(2083)
    const fy = { from: months[0].from, to: months[11].to }
    const prev = previousPeriod(fy)
    expect(bs(prev.from)).toBe("2082-04-01")
    expect(bs(prev.to).startsWith("2083-03-")).toBe(true)
    expect(samePeriodLastYear(fy)).toEqual(prev)
  })

  it("steps any other range back by its own length", () => {
    expect(previousPeriod({ from: "2026-10-05", to: "2026-10-11" })).toEqual({ from: "2026-09-28", to: "2026-10-04" })
    expect(previousPeriod({ from: "2026-10-05", to: "2026-10-05" })).toEqual({ from: "2026-10-04", to: "2026-10-04" })
  })

  it("maps the same BS dates a year back, keeping month ends at month ends", () => {
    const last = samePeriodLastYear(ashwin)
    expect(bs(last.from)).toBe("2082-06-01")
    expect(bs(last.to)).toBe(`2082-06-${String(bsMonthLength(2082, 5)).padStart(2, "0")}`)
    const partial = samePeriodLastYear({ from: "2026-09-20", to: "2026-10-08" })
    expect(bs(partial.from)).toBe("2082-06-04")
    expect(bs(partial.to)).toBe("2082-06-22")
  })

  it("resolves the mode, ignoring an incomplete custom period", () => {
    const current = { from: "2026-10-05", to: "2026-10-11" }
    expect(comparisonPeriod("none", current)).toBeNull()
    expect(comparisonPeriod("custom", current, null)).toBeNull()
    expect(comparisonPeriod("custom", current, { from: "2026-10-10", to: "2026-10-01" })).toBeNull()
    expect(comparisonPeriod("custom", current, { from: "2025-01-01", to: "2025-01-31" })).toEqual({ from: "2025-01-01", to: "2025-01-31" })
    expect(comparisonPeriod("previous_period", current)).toEqual(previousPeriod(current))
  })
})

describe("variance", () => {
  it("is current − prior, in percent of |prior|", () => {
    expect(variance(120, 100)).toEqual({ amount: 20, percent: 20 })
    expect(variance(80, 100)).toEqual({ amount: -20, percent: -20 })
    // a loss shrinking from -200 to -50 is a +75% improvement
    expect(variance(-50, -200)).toEqual({ amount: 150, percent: 75 })
    expect(variance(10, 0)).toEqual({ amount: 10, percent: null })
    expect(variance(0.1 + 0.2, 0.3)).toEqual({ amount: 0, percent: 0 })
  })
})

const columns: ProfitAndLossColumns = {
  periods: [
    { from: "2026-09-17", to: "2026-10-17" },
    { from: "2026-08-17", to: "2026-09-16" },
  ],
  columns: [
    { total_revenue: 1500, total_expense: 900, net_income: 600 },
    { total_revenue: 1000, total_expense: 1000, net_income: 0 },
  ],
  rows: [
    { account_id: "s", code: "4000", name: "Sales", account_type: "revenue", amounts: [1500, 1000] },
    { account_id: "c", code: "5000", name: "COGS", account_type: "expense", amounts: [900, 600] },
    { account_id: "r", code: "5100", name: "Rent", account_type: "expense", amounts: [0, 400] },
  ],
}

describe("profit & loss comparison", () => {
  it("pairs column 0 (current) with column 1 (comparison)", () => {
    const cmp = buildProfitAndLossComparison(columns)
    expect(cmp.revenue).toHaveLength(1)
    expect(cmp.expense.map((r) => [r.code, r.current, r.prior, r.variance.amount])).toEqual([
      ["5000", 900, 600, 300],
      ["5100", 0, 400, -400],
    ])
    expect(cmp.expense[1].variance.percent).toBe(-100)
    expect(cmp.totalRevenue.variance).toEqual({ amount: 500, percent: 50 })
    expect(cmp.netIncome.current).toBe(600)
    expect(cmp.netIncome.variance).toEqual({ amount: 600, percent: null })
  })

  it("builds the trend with a row total per account", () => {
    const trend = buildProfitAndLossTrend(columns)
    expect(trend.revenue[0].amounts).toEqual([1500, 1000])
    expect(trend.revenue[0].total).toBe(2500)
    expect(trend.netIncome.amounts).toEqual([600, 0])
    expect(trend.netIncome.total).toBe(600)
    expect(trend.totalExpense.total).toBe(1900)
  })
})

function sheet(over: Partial<BalanceSheetView>): BalanceSheetView {
  return {
    assets: [],
    liabilities: [],
    equity: [],
    total_assets: 0,
    total_liabilities: 0,
    total_equity: 0,
    retained_earnings: 0,
    current_year_earnings: 0,
    accounting_equation_residual: 0,
    ...over,
  }
}

describe("balance sheet comparison", () => {
  it("matches accounts by id, fills a missing side with 0 and carries current earnings into equity", () => {
    const row = (id: string, code: string, balance: number) => ({ account_id: id, code, name: code, account_type: "asset", balance })
    const current = sheet({
      assets: [row("cash", "1000", 700), row("fa", "1510", 2000)],
      liabilities: [{ ...row("ap", "2000", 500), account_type: "liability" }],
      equity: [{ ...row("cap", "3000", 1000), account_type: "equity" }],
      total_assets: 2700,
      total_liabilities: 500,
      total_equity: 1000,
      current_year_earnings: 1200,
    })
    const prior = sheet({
      assets: [row("cash", "1000", 1000)],
      equity: [{ ...row("cap", "3000", 1000), account_type: "equity" }],
      total_assets: 1000,
      total_equity: 1000,
    })
    const cmp = buildBalanceSheetComparison(current, prior)
    expect(cmp.assets.map((r) => [r.code, r.current, r.prior])).toEqual([
      ["1000", 700, 1000],
      ["1510", 2000, 0],
    ])
    expect(cmp.equity.at(-1)?.name).toMatch(/Current year earnings/)
    expect(cmp.totalEquity.current).toBe(2200)
    expect(cmp.totalLiabilitiesAndEquity.current).toBe(2700)
    expect(cmp.totalLiabilitiesAndEquity.prior).toBe(1000)
    expect(cmp.totalAssets.variance).toEqual({ amount: 1700, percent: 170 })
  })
})

describe("fiscal year months", () => {
  it("lists Shrawan to Ashadh, contiguous", () => {
    const months = fiscalYearMonths(2083)
    expect(months).toHaveLength(12)
    expect(months[0].label).toBe("Shrawan 2083")
    expect(months[0].from).toBe("2026-07-17")
    expect(months[8].label).toBe("Chaitra 2083")
    expect(months[9].label).toBe("Baishakh 2084")
    expect(months[11].label).toBe("Ashadh 2084")
    for (let i = 1; i < 12; i++) {
      const next = new Date(`${months[i - 1].to}T00:00:00Z`)
      next.setUTCDate(next.getUTCDate() + 1)
      expect(next.toISOString().slice(0, 10)).toBe(months[i].from)
    }
    expect(bs(months[11].to).startsWith("2084-03-")).toBe(true)
  })
})
