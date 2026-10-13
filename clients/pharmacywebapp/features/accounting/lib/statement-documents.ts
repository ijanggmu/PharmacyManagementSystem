/**
 * Report documents (see report-export.ts) for each accounting statement: the rows and columns a PDF or Excel
 * export prints. Pure — they take the figures the screens already hold, so the export always matches the screen.
 */

import type { CashFlowLine, CashFlowStatement } from "@/lib/api/accounting-statements-api"
import type { BalanceSheetComparison, ComparisonRow, ProfitAndLossComparison, ProfitAndLossTrend, TrendRow } from "./comparatives"
import { ACCOUNT_TYPE_GROUP_LABEL, type TrialBalanceColumns, type TrialBalanceView, type TrialBalanceViewRow } from "./period-trial-balance"
import type { ReportColumn, ReportPeriod, ReportRow } from "./report-export"
import { formatBsYmd } from "./date-presets"

/** A report document without the letterhead profile (the export menu adds it). */
export interface StatementDocument {
  title: string
  subtitle?: string | null
  period: ReportPeriod
  branchName?: string | null
  columns: ReportColumn[]
  rows: ReportRow[]
  notes?: string[]
}

interface Scope {
  branchName?: string | null
}

export interface StatementLineInput {
  code?: string
  name: string
  amount: number
}

const ACCOUNT_COLUMNS: ReportColumn[] = [
  { header: "Code", width: 10 },
  { header: "Particulars", width: 44 },
]

function sectionRow(title: string, width: number): ReportRow {
  return { cells: [null, title, ...Array<null>(width - 2).fill(null)], style: "section" }
}

// ---------------------------------------------------------------------------
// Profit & loss, balance sheet
// ---------------------------------------------------------------------------

export interface ProfitAndLossInput {
  revenue: StatementLineInput[]
  expense: StatementLineInput[]
  totalRevenue: number
  totalExpense: number
  net: number
}

export function profitAndLossDocument(pl: ProfitAndLossInput, period: { from: string; to: string }, scope: Scope = {}): StatementDocument {
  const columns: ReportColumn[] = [...ACCOUNT_COLUMNS, { header: "Amount (Rs)", kind: "amount" }]
  const line = (l: StatementLineInput): ReportRow => ({ cells: [l.code ?? "", l.name, l.amount] })
  return {
    title: "Profit & Loss Statement",
    period: { kind: "range", ...period },
    branchName: scope.branchName,
    columns,
    rows: [
      sectionRow("Revenue", 3),
      ...pl.revenue.map(line),
      { cells: ["", "Total revenue", pl.totalRevenue], style: "subtotal" },
      sectionRow("Expenses", 3),
      ...pl.expense.map(line),
      { cells: ["", "Total expenses", pl.totalExpense], style: "subtotal" },
      { cells: ["", pl.net < 0 ? "Net loss" : "Net profit", pl.net], style: "total" },
    ],
  }
}

export interface BalanceSheetInput {
  assets: StatementLineInput[]
  liabilities: StatementLineInput[]
  equity: StatementLineInput[]
  totalAssets: number
  totalLiabilities: number
  totalEquity: number
  residual: number
}

export function balanceSheetDocument(bs: BalanceSheetInput, asOf: string, scope: Scope = {}): StatementDocument {
  const columns: ReportColumn[] = [...ACCOUNT_COLUMNS, { header: "Amount (Rs)", kind: "amount" }]
  const line = (l: StatementLineInput): ReportRow => ({ cells: [l.code ?? "", l.name, l.amount] })
  const balanced = Math.abs(bs.residual) < 0.005
  return {
    title: "Balance Sheet",
    period: { kind: "asOf", date: asOf },
    branchName: scope.branchName,
    columns,
    rows: [
      sectionRow("Assets", 3),
      ...bs.assets.map(line),
      { cells: ["", "Total assets", bs.totalAssets], style: "total" },
      sectionRow("Liabilities", 3),
      ...bs.liabilities.map(line),
      { cells: ["", "Total liabilities", bs.totalLiabilities], style: "subtotal" },
      sectionRow("Equity", 3),
      ...bs.equity.map(line),
      { cells: ["", "Total equity", bs.totalEquity], style: "subtotal" },
      { cells: ["", "Total liabilities & equity", bs.totalLiabilities + bs.totalEquity], style: "total" },
    ],
    notes: [balanced ? "Check: assets = liabilities + equity." : `Out of balance by ${bs.residual.toFixed(2)} (assets − liabilities − equity).`],
  }
}

// ---------------------------------------------------------------------------
// Comparatives and trend
// ---------------------------------------------------------------------------

function comparisonColumns(currentLabel: string, priorLabel: string): ReportColumn[] {
  return [
    ...ACCOUNT_COLUMNS,
    { header: currentLabel, kind: "amount" },
    { header: priorLabel, kind: "amount" },
    { header: "Variance", kind: "amount" },
    { header: "Variance %", kind: "percent" },
  ]
}

function comparisonRow(r: ComparisonRow, style?: ReportRow["style"]): ReportRow {
  return { cells: [r.code ?? "", r.name, r.current, r.prior, r.variance.amount, r.variance.percent], style }
}

export function profitAndLossComparisonDocument(
  cmp: ProfitAndLossComparison,
  period: { from: string; to: string },
  labels: { current: string; prior: string },
  scope: Scope = {},
): StatementDocument {
  return {
    title: "Profit & Loss Statement — Comparative",
    subtitle: `${labels.current} compared with ${labels.prior}`,
    period: { kind: "range", ...period },
    branchName: scope.branchName,
    columns: comparisonColumns(labels.current, labels.prior),
    rows: [
      sectionRow("Revenue", 6),
      ...cmp.revenue.map((r) => comparisonRow(r)),
      comparisonRow(cmp.totalRevenue, "subtotal"),
      sectionRow("Expenses", 6),
      ...cmp.expense.map((r) => comparisonRow(r)),
      comparisonRow(cmp.totalExpense, "subtotal"),
      comparisonRow(cmp.netIncome, "total"),
    ],
    notes: ["Variance = current − comparison; variance % is relative to the comparison figure."],
  }
}

export function balanceSheetComparisonDocument(
  cmp: BalanceSheetComparison,
  asOf: string,
  labels: { current: string; prior: string },
  scope: Scope = {},
): StatementDocument {
  return {
    title: "Balance Sheet — Comparative",
    subtitle: `${labels.current} compared with ${labels.prior}`,
    period: { kind: "asOf", date: asOf },
    branchName: scope.branchName,
    columns: comparisonColumns(labels.current, labels.prior),
    rows: [
      sectionRow("Assets", 6),
      ...cmp.assets.map((r) => comparisonRow(r)),
      comparisonRow(cmp.totalAssets, "total"),
      sectionRow("Liabilities", 6),
      ...cmp.liabilities.map((r) => comparisonRow(r)),
      comparisonRow(cmp.totalLiabilities, "subtotal"),
      sectionRow("Equity", 6),
      ...cmp.equity.map((r) => comparisonRow(r)),
      comparisonRow(cmp.totalEquity, "subtotal"),
      comparisonRow(cmp.totalLiabilitiesAndEquity, "total"),
    ],
  }
}

export function profitAndLossTrendDocument(
  trend: ProfitAndLossTrend,
  monthLabels: string[],
  period: { from: string; to: string },
  fiscalYearLabel: string,
  scope: Scope = {},
): StatementDocument {
  const width = 2 + monthLabels.length + 1
  const columns: ReportColumn[] = [
    { header: "Code", width: 8 },
    { header: "Particulars", width: 30 },
    ...monthLabels.map((m) => ({ header: m, kind: "amount" as const })),
    { header: "Total", kind: "amount" },
  ]
  const row = (r: TrendRow, style?: ReportRow["style"]): ReportRow => ({ cells: [r.code ?? "", r.name, ...r.amounts, r.total], style })
  return {
    title: "Profit & Loss — Monthly Trend",
    subtitle: `Fiscal year ${fiscalYearLabel}`,
    period: { kind: "range", ...period },
    branchName: scope.branchName,
    columns,
    rows: [
      sectionRow("Revenue", width),
      ...trend.revenue.map((r) => row(r)),
      row(trend.totalRevenue, "subtotal"),
      sectionRow("Expenses", width),
      ...trend.expense.map((r) => row(r)),
      row(trend.totalExpense, "subtotal"),
      row(trend.netIncome, "total"),
    ],
  }
}

// ---------------------------------------------------------------------------
// Cash flow statement
// ---------------------------------------------------------------------------

export function cashFlowDocument(cf: CashFlowStatement, scope: Scope = {}): StatementDocument {
  const columns: ReportColumn[] = [{ header: "Particulars", width: 56 }, { header: "Amount (Rs)", kind: "amount" }]
  const line = (l: CashFlowLine): ReportRow => ({ cells: [`    ${l.label}`, l.amount] })
  const section = (title: string): ReportRow => ({ cells: [title, null], style: "section" })
  return {
    title: "Cash Flow Statement",
    subtitle: "Indirect method",
    period: { kind: "range", from: cf.period_from, to: cf.period_to },
    branchName: scope.branchName,
    columns,
    rows: [
      section("A. Cash flows from operating activities"),
      { cells: ["    Net profit / (loss) for the period", cf.net_profit] },
      ...(cf.adjustments.length ? [{ cells: ["  Adjustments for:", null], style: "muted" } as ReportRow, ...cf.adjustments.map(line)] : []),
      { cells: ["  Changes in working capital:", null], style: "muted" },
      ...cf.working_capital.map(line),
      { cells: ["Net cash from operating activities", cf.net_cash_operating], style: "subtotal" },
      section("B. Cash flows from investing activities"),
      ...cf.investing.map(line),
      { cells: ["Net cash from investing activities", cf.net_cash_investing], style: "subtotal" },
      section("C. Cash flows from financing activities"),
      ...cf.financing.map(line),
      { cells: ["Net cash from financing activities", cf.net_cash_financing], style: "subtotal" },
      { cells: ["Net increase / (decrease) in cash and cash equivalents (A + B + C)", cf.net_change], style: "total" },
      { cells: ["Cash and cash equivalents at the beginning of the period", cf.opening_cash] },
      { cells: ["Cash and cash equivalents at the end of the period", cf.closing_cash], style: "total" },
    ],
    notes: [
      cf.is_reconciled
        ? "Check: opening cash + net change = closing cash per the ledger (cash and bank accounts, 10xx)."
        : `Check FAILED: closing cash per the ledger differs from opening + net change by ${cf.difference.toFixed(2)}.`,
      "Net profit excludes year-end closing entries; opening-balance vouchers in the period are part of the opening cash.",
    ],
  }
}

// ---------------------------------------------------------------------------
// Trial balance, general ledger, aging
// ---------------------------------------------------------------------------

const TB_KEYS: (keyof TrialBalanceColumns)[] = ["openingDr", "openingCr", "periodDr", "periodCr", "closingDr", "closingCr"]

export function trialBalanceDocument(
  view: TrialBalanceView,
  grouped: boolean,
  period: { from: string; to: string },
  scope: Scope & { note?: string | null } = {},
): StatementDocument {
  const columns: ReportColumn[] = [
    { header: "Code", width: 8 },
    { header: "Account", width: 32 },
    { header: "Opening Dr", kind: "amount" },
    { header: "Opening Cr", kind: "amount" },
    { header: "Period Dr", kind: "amount" },
    { header: "Period Cr", kind: "amount" },
    { header: "Closing Dr", kind: "amount" },
    { header: "Closing Cr", kind: "amount" },
  ]
  const figures = (c: TrialBalanceColumns) => TB_KEYS.map((k) => c[k])
  const accountRow = (r: TrialBalanceViewRow): ReportRow => ({ cells: [r.code, r.name, ...figures(r)] })
  const rows: ReportRow[] = []
  if (grouped) {
    for (const g of view.groups) {
      rows.push({ cells: ["", ACCOUNT_TYPE_GROUP_LABEL[g.type] ?? g.label, ...Array<null>(6).fill(null)], style: "section" })
      rows.push(...g.rows.map(accountRow))
      rows.push({ cells: ["", `Total ${g.label.toLowerCase()}`, ...figures(g.totals)], style: "subtotal" })
    }
  } else {
    rows.push(...view.rows.map(accountRow))
  }
  rows.push({ cells: ["", "Total", ...figures(view.totals)], style: "total" })
  const b = view.balance
  return {
    title: "Trial Balance",
    period: { kind: "range", ...period },
    branchName: scope.branchName,
    columns,
    rows,
    notes: [
      ...(scope.note ? [scope.note] : []),
      b.all
        ? "Opening, period and closing totals balance (debits = credits)."
        : `OUT OF BALANCE — opening ${b.openingDifference.toFixed(2)}, period ${b.movementDifference.toFixed(2)}, closing ${b.closingDifference.toFixed(2)} (Dr − Cr).`,
    ],
  }
}

export interface LedgerLineInput {
  voucher_date: string
  voucher_no: string
  description: string | null
  debit_amount: number
  credit_amount: number
  running_balance: number
}

export function generalLedgerDocument(
  account: { code: string; name: string },
  lines: LedgerLineInput[],
  balances: { opening: number; closing: number },
  period: { from: string; to: string },
  scope: Scope = {},
): StatementDocument {
  const debit = lines.reduce((s, l) => s + Number(l.debit_amount || 0), 0)
  const credit = lines.reduce((s, l) => s + Number(l.credit_amount || 0), 0)
  return {
    title: "General Ledger",
    subtitle: `${account.code} · ${account.name}`,
    period: { kind: "range", ...period },
    branchName: scope.branchName,
    columns: [
      { header: "Date (BS)", width: 12 },
      { header: "Date (AD)", width: 12 },
      { header: "Voucher", width: 14 },
      { header: "Narration", width: 40 },
      { header: "Debit", kind: "amount" },
      { header: "Credit", kind: "amount" },
      { header: "Balance", kind: "amount" },
    ],
    rows: [
      { cells: ["", "", "", "Opening balance", null, null, balances.opening], style: "muted" },
      ...lines.map((l) => ({
        cells: [formatBsYmd(l.voucher_date), l.voucher_date, l.voucher_no, l.description ?? "", l.debit_amount, l.credit_amount, l.running_balance],
      })),
      { cells: ["", "", "", "Total / closing balance", debit, credit, balances.closing], style: "total" },
    ],
    notes: ["Balance is debit-positive: a negative (bracketed) balance is a credit balance."],
  }
}

export interface AgingInputRow {
  name: string
  balance: number
  current: number
  days_31_60: number
  days_61_90: number
  days_90_plus: number
}

export function agingDocument(kind: "receivable" | "payable", rows: AgingInputRow[], asOf: string, scope: Scope = {}): StatementDocument {
  const sum = (pick: (r: AgingInputRow) => number) => rows.reduce((s, r) => s + pick(r), 0)
  return {
    title: kind === "receivable" ? "Accounts Receivable Aging" : "Accounts Payable Aging",
    period: { kind: "asOf", date: asOf },
    branchName: scope.branchName,
    columns: [
      { header: kind === "receivable" ? "Customer" : "Supplier", width: 36 },
      { header: "Balance", kind: "amount" },
      { header: "0–30 days", kind: "amount" },
      { header: "31–60 days", kind: "amount" },
      { header: "61–90 days", kind: "amount" },
      { header: "90+ days", kind: "amount" },
    ],
    rows: [
      ...rows.map((r) => ({ cells: [r.name, r.balance, r.current, r.days_31_60, r.days_61_90, r.days_90_plus] })),
      {
        cells: ["Total", sum((r) => r.balance), sum((r) => r.current), sum((r) => r.days_31_60), sum((r) => r.days_61_90), sum((r) => r.days_90_plus)],
        style: "total",
      },
    ],
  }
}
