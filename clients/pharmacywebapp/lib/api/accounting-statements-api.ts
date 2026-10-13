/**
 * Financial statement reads beyond the single-period P&L and balance sheet: the cash flow statement (indirect
 * method), its account classification, and the multi-period P&L used by comparatives and the monthly trend.
 *
 * The cash flow statement and the P&L columns are computed by the .NET API (GetCashFlowStatement,
 * GetProfitAndLossColumns) on the same ledger rules as {@link getProfitAndLoss}: year-end closing vouchers are left
 * out, so every P&L column equals the single-period P&L and the cash flow's net profit equals the P&L's.
 * Balance sheet comparatives reuse {@link getBalanceSheet} once per date.
 *
 * Mapping functions are pure and exported for unit tests.
 */

import { dotnetClient } from "@/lib/api/dotnet-client"
import { endOfDayUtc, getBalanceSheet, startOfDayUtc, type BalanceSheetView } from "@/lib/api/accounting-reports-api"

function round2(n: number): number {
  return Number(Number(n || 0).toFixed(2))
}

// ---------------------------------------------------------------------------
// Cash flow statement
// ---------------------------------------------------------------------------

export interface DotnetCashFlowAccountAmountDto {
  accountId: string
  accountCode: string
  accountName: string
  amount: number
}

export interface DotnetCashFlowLineDto {
  key: string
  label: string
  amount: number
  accounts: DotnetCashFlowAccountAmountDto[]
}

export interface DotnetCashFlowCashAccountDto {
  accountId: string
  accountCode: string
  accountName: string
  opening: number
  closing: number
}

/** CashFlowStatementDto from Modules.Accounting.Contracts. Amounts: positive = cash in. */
export interface DotnetCashFlowStatementDto {
  fromUtc: string
  toUtc: string
  branchId: string | null
  netProfit: number
  adjustments: DotnetCashFlowLineDto[]
  workingCapitalChanges: DotnetCashFlowLineDto[]
  netCashFromOperating: number
  investingLines: DotnetCashFlowLineDto[]
  netCashFromInvesting: number
  financingLines: DotnetCashFlowLineDto[]
  netCashFromFinancing: number
  netChangeInCash: number
  openingCash: number
  closingCash: number
  difference: number
  isReconciled: boolean
  cashAccounts: DotnetCashFlowCashAccountDto[]
}

export interface CashFlowAccountAmount {
  account_id: string
  code: string
  name: string
  amount: number
}

export interface CashFlowLine {
  key: string
  label: string
  amount: number
  accounts: CashFlowAccountAmount[]
}

export interface CashFlowStatement {
  period_from: string
  period_to: string
  branch_id: string | null
  net_profit: number
  adjustments: CashFlowLine[]
  working_capital: CashFlowLine[]
  net_cash_operating: number
  investing: CashFlowLine[]
  net_cash_investing: number
  financing: CashFlowLine[]
  net_cash_financing: number
  net_change: number
  opening_cash: number
  closing_cash: number
  /** Actual closing cash − (opening + net change); 0 when the statement reconciles. */
  difference: number
  is_reconciled: boolean
  cash_accounts: Array<{ account_id: string; code: string; name: string; opening: number; closing: number }>
}

function toCashFlowLine(l: DotnetCashFlowLineDto): CashFlowLine {
  return {
    key: l.key,
    label: l.label,
    amount: round2(l.amount),
    accounts: (l.accounts ?? []).map((a) => ({ account_id: a.accountId, code: a.accountCode, name: a.accountName, amount: round2(a.amount) })),
  }
}

export function toCashFlowStatement(dto: DotnetCashFlowStatementDto, from: string, to: string): CashFlowStatement {
  return {
    period_from: from,
    period_to: to,
    branch_id: dto.branchId ?? null,
    net_profit: round2(dto.netProfit),
    adjustments: dto.adjustments.map(toCashFlowLine),
    working_capital: dto.workingCapitalChanges.map(toCashFlowLine),
    net_cash_operating: round2(dto.netCashFromOperating),
    investing: dto.investingLines.map(toCashFlowLine),
    net_cash_investing: round2(dto.netCashFromInvesting),
    financing: dto.financingLines.map(toCashFlowLine),
    net_cash_financing: round2(dto.netCashFromFinancing),
    net_change: round2(dto.netChangeInCash),
    opening_cash: round2(dto.openingCash),
    closing_cash: round2(dto.closingCash),
    difference: round2(dto.difference),
    is_reconciled: dto.isReconciled,
    cash_accounts: dto.cashAccounts.map((a) => ({
      account_id: a.accountId,
      code: a.accountCode,
      name: a.accountName,
      opening: round2(a.opening),
      closing: round2(a.closing),
    })),
  }
}

export async function getCashFlowStatement(from: string, to: string, branchId?: string | null): Promise<CashFlowStatement> {
  const p = new URLSearchParams({ fromUtc: startOfDayUtc(from), toUtc: endOfDayUtc(to) })
  if (branchId) p.set("branchId", branchId)
  const dto = await dotnetClient.get<DotnetCashFlowStatementDto>(`/accounting/reports/cash-flow?${p.toString()}`)
  return toCashFlowStatement(dto, from, to)
}

// ---------------------------------------------------------------------------
// Cash flow classification (per-account tags)
// ---------------------------------------------------------------------------

export type CashFlowActivity = "Operating" | "Investing" | "Financing" | "NonCash"
export const CASH_FLOW_ACTIVITIES: readonly CashFlowActivity[] = ["Operating", "Investing", "Financing", "NonCash"]

export interface CashFlowClassification {
  accountId: string
  accountCode: string
  accountName: string
  accountType: string
  parentId: string | null
  isPostable: boolean
  /** The account's own tag, or null when it inherits / uses the default. */
  tag: CashFlowActivity | null
  /** "Cash" for the 10xx cash and bank accounts (not taggable). */
  defaultActivity: CashFlowActivity | "Cash"
  effectiveActivity: CashFlowActivity | "Cash"
}

export function getCashFlowClassifications(): Promise<CashFlowClassification[]> {
  return dotnetClient.get<CashFlowClassification[]>("/accounting/reports/cash-flow/classifications")
}

/** Sets (or, with null, clears) accounts' cash flow tags; returns the whole classification afterwards. */
export function updateCashFlowClassifications(
  items: ReadonlyArray<{ accountId: string; activity: CashFlowActivity | null }>,
): Promise<CashFlowClassification[]> {
  return dotnetClient.put<CashFlowClassification[]>("/accounting/reports/cash-flow/classifications", {
    items: items.map((i) => ({ accountId: i.accountId, activity: i.activity })),
  })
}

// ---------------------------------------------------------------------------
// Multi-period P&L (comparatives, monthly trend)
// ---------------------------------------------------------------------------

export interface DateRangeYmd {
  /** yyyy-mm-dd, inclusive */
  from: string
  /** yyyy-mm-dd, inclusive */
  to: string
}

interface DotnetProfitAndLossColumnsDto {
  branchId: string | null
  columns: Array<{ fromUtc: string; toUtc: string; totalRevenue: number; totalExpense: number; netIncome: number }>
  lines: Array<{ accountId: string; accountCode: string; accountName: string; accountType: string; amounts: number[] }>
}

export interface ProfitAndLossColumns {
  periods: DateRangeYmd[]
  columns: Array<{ total_revenue: number; total_expense: number; net_income: number }>
  rows: Array<{ account_id: string; code: string; name: string; account_type: "revenue" | "expense"; amounts: number[] }>
}

/** Query string for the P&L columns: repeated fromUtc/toUtc pairs, n-th from with n-th to. */
export function profitAndLossColumnsPath(periods: readonly DateRangeYmd[], branchId?: string | null): string {
  const p = new URLSearchParams()
  for (const period of periods) {
    p.append("fromUtc", startOfDayUtc(period.from))
    p.append("toUtc", endOfDayUtc(period.to))
  }
  if (branchId) p.set("branchId", branchId)
  return `/accounting/reports/profit-and-loss/columns?${p.toString()}`
}

export function toProfitAndLossColumns(dto: DotnetProfitAndLossColumnsDto, periods: readonly DateRangeYmd[]): ProfitAndLossColumns {
  return {
    periods: [...periods],
    columns: dto.columns.map((c) => ({
      total_revenue: round2(c.totalRevenue),
      total_expense: round2(c.totalExpense),
      net_income: round2(c.netIncome),
    })),
    rows: dto.lines.map((l) => ({
      account_id: l.accountId,
      code: l.accountCode,
      name: l.accountName,
      account_type: l.accountType.toLowerCase() === "revenue" ? "revenue" : "expense",
      amounts: l.amounts.map(round2),
    })),
  }
}

export async function getProfitAndLossColumns(periods: readonly DateRangeYmd[], branchId?: string | null): Promise<ProfitAndLossColumns> {
  if (periods.length === 0) return { periods: [], columns: [], rows: [] }
  const dto = await dotnetClient.get<DotnetProfitAndLossColumnsDto>(profitAndLossColumnsPath(periods, branchId))
  return toProfitAndLossColumns(dto, periods)
}

/** Balance sheets as of each date (one as-of trial balance call per date, in parallel). */
export function getBalanceSheets(asOfs: readonly string[], branchId?: string | null): Promise<BalanceSheetView[]> {
  return Promise.all(asOfs.map((d) => getBalanceSheet(d, branchId)))
}
