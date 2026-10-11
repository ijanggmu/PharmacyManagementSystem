/**
 * Trial balance with opening balances: pure maths from the period trial balance API data.
 *
 * Presentation (standard for a period trial balance):
 *  - Opening and Closing are NET balances shown on one side (Dr when the account's balance is a debit,
 *    Cr otherwise), so Σ opening Dr = Σ opening Cr and Σ closing Dr = Σ closing Cr when the books balance.
 *  - Period debit / credit are GROSS movements, so Σ period Dr = Σ period Cr.
 *  - Closing = opening + period debit − period credit.
 *
 * Opening-balance vouchers dated INSIDE the period (e.g. go-live on the first day of the period being
 * viewed) are, by default, folded into Opening ("treat as opening") — that's what an accountant expects
 * to see as opening balances. With the toggle off they stay in the movement columns and the UI labels
 * them. Opening-balance vouchers dated before the period start are always part of Opening (they are
 * ordinary history by then). Closing is identical either way.
 */

import type { PeriodTrialBalanceAccount } from "@/lib/api/accounting-reports-api"

export const ACCOUNT_TYPE_ORDER = ["asset", "liability", "equity", "revenue", "expense"] as const

export const ACCOUNT_TYPE_GROUP_LABEL: Record<string, string> = {
  asset: "Assets",
  liability: "Liabilities",
  equity: "Equity",
  revenue: "Revenue",
  expense: "Expenses",
}

export interface TrialBalanceColumns {
  openingDr: number
  openingCr: number
  periodDr: number
  periodCr: number
  closingDr: number
  closingCr: number
}

export interface TrialBalanceViewRow extends TrialBalanceColumns {
  accountId: string
  code: string
  name: string
  accountType: string
  /** Opening-balance voucher amounts inside the period (net Dr − Cr); non-zero only when the period contains one. */
  openingVoucherNet: number
}

export interface TrialBalanceViewGroup {
  type: string
  label: string
  rows: TrialBalanceViewRow[]
  totals: TrialBalanceColumns
}

export interface TrialBalanceBalance {
  opening: boolean
  movement: boolean
  closing: boolean
  /** All three pairs balance. */
  all: boolean
  /** Dr − Cr per pair. */
  openingDifference: number
  movementDifference: number
  closingDifference: number
}

export interface TrialBalanceView {
  rows: TrialBalanceViewRow[]
  groups: TrialBalanceViewGroup[]
  totals: TrialBalanceColumns
  balance: TrialBalanceBalance
  /** True when any account has opening-balance voucher amounts inside the period. */
  hasOpeningVoucherInPeriod: boolean
}

export interface TrialBalanceViewOptions {
  /** Fold opening-balance vouchers dated inside the period into Opening (default true). */
  openingVoucherAsOpening?: boolean
  /** Drop accounts whose six columns are all zero (default false). */
  hideZero?: boolean
  /** Case-insensitive code/name filter. Totals and balance checks always cover every account. */
  search?: string
}

/** Work in paisa so sums never drift. */
const toCents = (n: number) => Math.round((Number.isFinite(n) ? n : 0) * 100)
const fromCents = (c: number) => c / 100

function splitNet(netCents: number): { dr: number; cr: number } {
  return netCents >= 0 ? { dr: fromCents(netCents), cr: 0 } : { dr: 0, cr: fromCents(-netCents) }
}

/** One account's six presented columns. */
export function trialBalanceRow(account: PeriodTrialBalanceAccount, openingVoucherAsOpening = true): TrialBalanceViewRow {
  const obDr = toCents(account.openingVoucherDebit)
  const obCr = toCents(account.openingVoucherCredit)
  const fold = openingVoucherAsOpening ? 1 : 0
  const openingNet = toCents(account.openingDebit) - toCents(account.openingCredit) + fold * (obDr - obCr)
  const periodDr = toCents(account.periodDebit) - fold * obDr
  const periodCr = toCents(account.periodCredit) - fold * obCr
  const closingNet = openingNet + periodDr - periodCr
  const opening = splitNet(openingNet)
  const closing = splitNet(closingNet)
  return {
    accountId: account.accountId,
    code: account.code,
    name: account.name,
    accountType: account.accountType,
    openingDr: opening.dr,
    openingCr: opening.cr,
    periodDr: fromCents(periodDr),
    periodCr: fromCents(periodCr),
    closingDr: closing.dr,
    closingCr: closing.cr,
    openingVoucherNet: fromCents(obDr - obCr),
  }
}

export function sumColumns(rows: readonly TrialBalanceColumns[]): TrialBalanceColumns {
  const c = rows.reduce(
    (acc, r) => {
      acc.openingDr += toCents(r.openingDr)
      acc.openingCr += toCents(r.openingCr)
      acc.periodDr += toCents(r.periodDr)
      acc.periodCr += toCents(r.periodCr)
      acc.closingDr += toCents(r.closingDr)
      acc.closingCr += toCents(r.closingCr)
      return acc
    },
    { openingDr: 0, openingCr: 0, periodDr: 0, periodCr: 0, closingDr: 0, closingCr: 0 }
  )
  return {
    openingDr: fromCents(c.openingDr),
    openingCr: fromCents(c.openingCr),
    periodDr: fromCents(c.periodDr),
    periodCr: fromCents(c.periodCr),
    closingDr: fromCents(c.closingDr),
    closingCr: fromCents(c.closingCr),
  }
}

export function balanceOf(totals: TrialBalanceColumns): TrialBalanceBalance {
  const openingDifference = fromCents(toCents(totals.openingDr) - toCents(totals.openingCr))
  const movementDifference = fromCents(toCents(totals.periodDr) - toCents(totals.periodCr))
  const closingDifference = fromCents(toCents(totals.closingDr) - toCents(totals.closingCr))
  const opening = openingDifference === 0
  const movement = movementDifference === 0
  const closing = closingDifference === 0
  return { opening, movement, closing, all: opening && movement && closing, openingDifference, movementDifference, closingDifference }
}

const isZeroRow = (r: TrialBalanceColumns) =>
  [r.openingDr, r.openingCr, r.periodDr, r.periodCr, r.closingDr, r.closingCr].every((v) => toCents(v) === 0)

function compareCodes(a: string, b: string): number {
  return a.localeCompare(b, undefined, { numeric: true })
}

/**
 * Builds the presented trial balance. `rows`/`groups` honour hideZero and search; `totals` and `balance`
 * always cover every account so a filter can never make an unbalanced ledger look balanced.
 */
export function buildTrialBalanceView(
  accounts: readonly PeriodTrialBalanceAccount[],
  options: TrialBalanceViewOptions = {}
): TrialBalanceView {
  const asOpening = options.openingVoucherAsOpening ?? true
  const all = accounts.map((a) => trialBalanceRow(a, asOpening)).sort((a, b) => compareCodes(a.code, b.code))
  const totals = sumColumns(all)
  const term = (options.search ?? "").trim().toLowerCase()
  const rows = all
    .filter((r) => !options.hideZero || !isZeroRow(r))
    .filter((r) => !term || r.code.toLowerCase().includes(term) || r.name.toLowerCase().includes(term))

  const known = new Set<string>(ACCOUNT_TYPE_ORDER)
  const types = [...ACCOUNT_TYPE_ORDER, ...Array.from(new Set(rows.map((r) => r.accountType))).filter((t) => !known.has(t))]
  const groups = types
    .map((type) => {
      const members = rows.filter((r) => r.accountType === type)
      return { type, label: ACCOUNT_TYPE_GROUP_LABEL[type] ?? type, rows: members, totals: sumColumns(members) }
    })
    .filter((g) => g.rows.length > 0)

  return {
    rows,
    groups,
    totals,
    balance: balanceOf(totals),
    hasOpeningVoucherInPeriod: accounts.some((a) => toCents(a.openingVoucherDebit) !== 0 || toCents(a.openingVoucherCredit) !== 0),
  }
}

/** CSV rows (header + accounts + optional group subtotals + grand total) for export. */
export function trialBalanceCsv(view: TrialBalanceView, grouped: boolean): { headers: string[]; rows: string[][] } {
  const headers = ["Code", "Account", "Type", "Opening Dr", "Opening Cr", "Period debit", "Period credit", "Closing Dr", "Closing Cr"]
  const money = (n: number) => n.toFixed(2)
  const cols = (c: TrialBalanceColumns) => [c.openingDr, c.openingCr, c.periodDr, c.periodCr, c.closingDr, c.closingCr].map(money)
  const accountRow = (r: TrialBalanceViewRow) => [r.code, r.name, ACCOUNT_TYPE_GROUP_LABEL[r.accountType] ?? r.accountType, ...cols(r)]
  const out: string[][] = []
  if (grouped) {
    for (const g of view.groups) {
      out.push(...g.rows.map(accountRow))
      out.push(["", `Total ${g.label.toLowerCase()}`, g.label, ...cols(g.totals)])
    }
  } else {
    out.push(...view.rows.map(accountRow))
  }
  out.push(["TOTAL", "All accounts", "", ...cols(view.totals)])
  return { headers, rows: out }
}
