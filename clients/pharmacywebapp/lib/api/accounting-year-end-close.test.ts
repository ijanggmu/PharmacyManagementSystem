import { describe, expect, it } from "vitest"
import {
  fiscalYearActionPath,
  toFiscalYearStatus,
  type DotnetFiscalYearStatusDto,
  type FiscalYearStatus,
} from "@/lib/api/accounting-api"
import {
  toBalanceSheet,
  toPeriodBalances,
  toPeriodTrialBalanceData,
  toProfitAndLoss,
  type AccountBalanceRow,
  type DotnetPeriodTrialBalanceDto,
} from "@/lib/api/accounting-reports-api"
import { fiscalYearState, latestClosedYear, nextClosableYear } from "@/features/accounting/lib/fiscal-years"
import { voucherDocumentTitle, voucherTypeLabel } from "@/features/accounting/lib/voucher-meta"

const zero = { openingDebit: 0, openingCredit: 0, openingVoucherDebit: 0, openingVoucherCredit: 0 }

/**
 * FY 2082/83 after its year-end close: sales 1,000 and COGS 600 for the year, closed by one closing voucher
 * (Dr Sales 1,000 / Cr COGS 600 / Cr Retained Earnings 400) dated the year's last day.
 */
const closedYearDto: DotnetPeriodTrialBalanceDto = {
  fromUtc: "2025-07-16T18:15:00Z",
  toUtc: "2026-07-16T18:14:59.999Z",
  branchId: null,
  lines: [
    { ...zero, accountId: "cash", accountCode: "1000", accountName: "Cash", accountType: "Asset", periodDebit: 1000, periodCredit: 0 },
    { ...zero, accountId: "inv", accountCode: "1200", accountName: "Inventory", accountType: "Asset", openingDebit: 600, periodDebit: 0, periodCredit: 600 },
    { ...zero, accountId: "cap", accountCode: "3000", accountName: "Owner's Equity", accountType: "Equity", openingCredit: 600, periodDebit: 0, periodCredit: 0 },
    {
      ...zero,
      accountId: "re",
      accountCode: "3900",
      accountName: "Retained Earnings",
      accountType: "Equity",
      periodDebit: 0,
      periodCredit: 400,
      yearEndCloseVoucherDebit: 0,
      yearEndCloseVoucherCredit: 400,
    },
    {
      ...zero,
      accountId: "sales",
      accountCode: "4000",
      accountName: "Sales",
      accountType: "Revenue",
      periodDebit: 1000,
      periodCredit: 1000,
      yearEndCloseVoucherDebit: 1000,
      yearEndCloseVoucherCredit: 0,
    },
    {
      ...zero,
      accountId: "cogs",
      accountCode: "5000",
      accountName: "COGS",
      accountType: "Expense",
      periodDebit: 600,
      periodCredit: 600,
      yearEndCloseVoucherDebit: 0,
      yearEndCloseVoucherCredit: 600,
    },
  ],
  openingVouchersInPeriod: [],
}

/** The same shape from an API build that predates the year-end split (no yearEndClose* fields). */
const olderApiDto: DotnetPeriodTrialBalanceDto = {
  fromUtc: "2026-09-01T00:00:00Z",
  toUtc: "2026-09-30T23:59:59.999Z",
  branchId: null,
  lines: [
    { ...zero, accountId: "cash", accountCode: "1000", accountName: "Cash", accountType: "Asset", periodDebit: 210, periodCredit: 0 },
    { ...zero, accountId: "sales", accountCode: "4000", accountName: "Sales", accountType: "Revenue", periodDebit: 0, periodCredit: 210 },
  ],
  openingVouchersInPeriod: [],
}

describe("year-end close in the period reports", () => {
  it("keeps closing vouchers in activity (opening + activity = closing) but not in activity before the close", () => {
    const balances = toPeriodBalances(toPeriodTrialBalanceData(closedYearDto, "2025-07-17", "2026-07-16"))
    expect(balances.activity.find((r) => r.code === "4000")).toMatchObject({ debit: 1000, credit: 1000 })
    expect(balances.activityBeforeClose.find((r) => r.code === "4000")).toMatchObject({ debit: 0, credit: 1000 })
    expect(balances.activityBeforeClose.find((r) => r.code === "3900")).toMatchObject({ debit: 0, credit: 0 })
    expect(balances.closing.find((r) => r.code === "4000")).toMatchObject({ debit: 1000, credit: 1000 })
  })

  it("reports a closed year's real profit on the P&L", () => {
    const pl = toProfitAndLoss(toPeriodBalances(toPeriodTrialBalanceData(closedYearDto, "2025-07-17", "2026-07-16")))
    expect(pl.rows.map((r) => [r.code, r.amount])).toEqual([
      ["4000", 1000],
      ["5000", 600],
    ])
    expect(pl.net_income).toBe(400)
    expect(pl.debits_equal_credits).toBe(true)
  })

  it("treats an older API build (no year-end split) as having no closing vouchers", () => {
    const pl = toProfitAndLoss(toPeriodBalances(toPeriodTrialBalanceData(olderApiDto, "2026-09-01", "2026-09-30")))
    expect(pl.net_income).toBe(210)
  })
})

describe("balance sheet with retained earnings", () => {
  const row = (code: string, accountType: string, debit: number, credit: number): AccountBalanceRow => ({
    accountId: code,
    code,
    name: code,
    accountType,
    debit,
    credit,
  })

  it("splits closed years (Retained Earnings) from the unclosed profit (current year earnings)", () => {
    // Capital 700 bought stock. Closed year: sales 1,000, COGS 600 -> 400 in RE. Current year so far: sales 300, COGS 100.
    const bs = toBalanceSheet([
      row("1000", "asset", 1300, 0),
      row("1200", "asset", 700, 700),
      row("3000", "equity", 0, 700),
      row("3900", "equity", 0, 400),
      row("4000", "revenue", 1000, 1300),
      row("5000", "expense", 700, 600),
    ])
    expect(bs.retained_earnings).toBe(400)
    expect(bs.current_year_earnings).toBe(200)
    expect(bs.total_equity).toBe(1100)
    expect(bs.equity.map((r) => r.code)).toEqual(["3000", "3900"])
    expect(bs.total_assets).toBe(1300)
    expect(bs.accounting_equation_residual).toBe(0)
  })

  it("reports zero retained earnings before any year is closed", () => {
    const bs = toBalanceSheet([row("1000", "asset", 500, 0), row("4000", "revenue", 0, 500)])
    expect(bs.retained_earnings).toBe(0)
    expect(bs.current_year_earnings).toBe(500)
    expect(bs.accounting_equation_residual).toBe(0)
  })
})

describe("fiscal year client", () => {
  const dto = (fiscalYear: number, hasEnded: boolean, isClosed: boolean): DotnetFiscalYearStatusDto => ({
    fiscalYear,
    label: `${fiscalYear}/${String((fiscalYear + 1) % 100).padStart(2, "0")}`,
    startDate: "2025-07-17",
    endDate: "2026-07-16",
    hasEnded,
    isClosed,
    closedAtUtc: isClosed ? "2026-07-20T04:00:00Z" : null,
    closedBy: isClosed ? "admin" : null,
    netProfit: isClosed ? 400 : null,
    closingVoucherNos: isClosed ? ["JV-000012"] : [],
  })

  it("maps FiscalYearStatusDto", () => {
    expect(toFiscalYearStatus(dto(2082, true, true))).toEqual({
      fiscal_year: 2082,
      label: "2082/83",
      start_date: "2025-07-17",
      end_date: "2026-07-16",
      has_ended: true,
      is_closed: true,
      closed_at: "2026-07-20T04:00:00Z",
      closed_by: "admin",
      net_profit: 400,
      closing_voucher_nos: ["JV-000012"],
    })
  })

  it("builds the close and reopen paths for a BS start year only", () => {
    expect(fiscalYearActionPath(2082, "close")).toBe("/accounting/fiscal-years/2082/close")
    expect(fiscalYearActionPath(2082, "reopen")).toBe("/accounting/fiscal-years/2082/reopen")
    expect(() => fiscalYearActionPath(82, "close")).toThrow()
    expect(() => fiscalYearActionPath(2082.5, "close")).toThrow()
  })

  it("offers Close for the oldest ended open year and Reopen for the latest closed year", () => {
    const years: FiscalYearStatus[] = [
      toFiscalYearStatus(dto(2083, false, false)),
      toFiscalYearStatus(dto(2082, true, false)),
      toFiscalYearStatus(dto(2081, true, false)),
      toFiscalYearStatus(dto(2080, true, true)),
      toFiscalYearStatus(dto(2079, true, true)),
    ]
    expect(nextClosableYear(years)?.fiscal_year).toBe(2081)
    expect(latestClosedYear(years)?.fiscal_year).toBe(2080)
    expect(years.map((y) => fiscalYearState(y, years))).toEqual(["in_progress", "waiting", "ready", "closed", "closed"])
    expect(nextClosableYear([toFiscalYearStatus(dto(2083, false, false))])).toBeNull()
    expect(latestClosedYear([])).toBeNull()
  })

  it("labels the closing voucher type", () => {
    expect(voucherTypeLabel("system_year_end_close")).toBe("Year-end close")
    expect(voucherDocumentTitle("system_year_end_close")).toBe("Journal Voucher")
  })
})
