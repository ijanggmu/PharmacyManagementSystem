/**
 * Pure helpers for the Opening balances setup (no React, no I/O) so the rules the UI shows (sections,
 * totals, the Owner's Equity difference, the before/after diff) are unit-tested once.
 *
 * Money is summed in paisa (integer minor units) so 0.1 + 0.2 never shows a 0.01 "difference".
 * The server re-validates everything and posts the difference to Owner's Equity (code 3000).
 */

import { isSubledgerOpeningAccount } from "./control-accounts"

export type BalanceSide = "debit" | "credit"

export type OpeningSectionId = "cash-bank" | "receivables" | "inventory" | "other-assets" | "payables" | "loans" | "equity"

export interface OpeningSectionDef {
  id: OpeningSectionId
  title: string
  /** Plain-words explanation shown under the section title. */
  hint: string
  /** The usual side for accounts in this section. */
  naturalSide: BalanceSide
}

/** Order the setup shows: what you have, then what you owe, then what the owner put in. */
export const OPENING_SECTIONS: readonly OpeningSectionDef[] = [
  { id: "cash-bank", title: "Cash & bank", hint: "Cash in the till and money in your bank accounts on the go-live date.", naturalSide: "debit" },
  { id: "receivables", title: "Receivables", hint: "VAT you can still claim back and other amounts owed to you. What customers owed goes on each customer's opening balance (Customers), not here.", naturalSide: "debit" },
  { id: "inventory", title: "Inventory", hint: "Medicines in stock are entered as opening stock (Medicines, or the data import), which values them at cost; don't enter stock here too.", naturalSide: "debit" },
  { id: "other-assets", title: "Other assets", hint: "Anything else the pharmacy owns, such as furniture, equipment or deposits.", naturalSide: "debit" },
  { id: "payables", title: "Payables", hint: "VAT you still had to pay. What you owed suppliers goes on each supplier's opening balance (Suppliers), not here.", naturalSide: "credit" },
  { id: "loans", title: "Loans & other liabilities", hint: "Bank loans, overdrafts and any other money the pharmacy owed.", naturalSide: "credit" },
  { id: "equity", title: "Equity", hint: "Money the owner put into the business. Leave this blank if unsure; the difference goes to Owner's Equity automatically.", naturalSide: "credit" },
]

/** Plain-words meaning of each side, used next to every amount. */
export const SIDE_LABEL: Record<BalanceSide, { short: string; plain: string }> = {
  debit: { short: "Dr", plain: "money you have" },
  credit: { short: "Cr", plain: "money you owe" },
}

/** Minimal account shape the helpers need (matches AccountingAccount from the accounting api-client). */
export interface OpeningAccount {
  id: string
  code: string
  name: string
  account_type: string
  is_active: boolean
  has_children: boolean
  is_root_head: boolean
  /** Seeded system account; with the code, identifies the control accounts. */
  is_system?: boolean
}

const BALANCE_SHEET_TYPES = new Set(["asset", "liability", "equity"])

/**
 * Accounts that can take an opening balance: active ledger (leaf) accounts under Assets, Liabilities or Equity,
 * except Accounts Receivable, Accounts Payable and Inventory — their openings come from per-customer and
 * per-supplier opening balances and opening stock, so a GL amount would count them twice (the server refuses it).
 * `keepIds` keeps such an account when an existing opening already carries it (set before that rule), so an
 * edit can keep or clear it.
 */
export function isOpeningAccount(a: OpeningAccount, keepIds: ReadonlySet<string> = new Set()): boolean {
  if (!a.is_active || a.has_children || a.is_root_head || !BALANCE_SHEET_TYPES.has(a.account_type.toLowerCase())) return false
  return !isSubledgerOpeningAccount({ code: a.code, is_system: a.is_system ?? false }) || keepIds.has(a.id)
}

/**
 * Section for an account, from its head and code prefix. Sub-account codes extend their parent's code
 * (100001 under 1000), so the seeded system codes classify their children too:
 * 10xx cash & bank, 11xx receivables and input VAT, 12xx inventory, 20xx/21xx payables and VAT payable.
 */
export function sectionFor(a: Pick<OpeningAccount, "code" | "account_type">): OpeningSectionId {
  const type = a.account_type.toLowerCase()
  const code = a.code.trim()
  if (type === "equity") return "equity"
  if (type === "liability") return code.startsWith("20") || code.startsWith("21") ? "payables" : "loans"
  if (code.startsWith("10")) return "cash-bank"
  if (code.startsWith("11")) return "receivables"
  if (code.startsWith("12")) return "inventory"
  return "other-assets"
}

export interface OpeningSectionGroup<T extends OpeningAccount> {
  section: OpeningSectionDef
  accounts: T[]
}

/** Opening-eligible accounts grouped by section in display order, each sorted by code. Empty sections are kept
 *  (the UI shows a hint) so the layout is the same for every tenant. */
export function groupAccounts<T extends OpeningAccount>(
  accounts: readonly T[],
  keepIds: ReadonlySet<string> = new Set(),
): OpeningSectionGroup<T>[] {
  const eligible = accounts.filter((a) => isOpeningAccount(a, keepIds))
  return OPENING_SECTIONS.map((section) => ({
    section,
    accounts: eligible
      .filter((a) => sectionFor(a) === section.id)
      .sort((x, y) => x.code.localeCompare(y.code, "en", { numeric: true })),
  }))
}

export function naturalSideFor(a: Pick<OpeningAccount, "code" | "account_type">): BalanceSide {
  return OPENING_SECTIONS.find((s) => s.id === sectionFor(a))?.naturalSide ?? "debit"
}

// ---------------------------------------------------------------------------------------------
// Amount entry
// ---------------------------------------------------------------------------------------------

/** One row being edited: the raw text the user typed and the side it sits on. */
export interface DraftRow {
  amount: string
  side: BalanceSide
}

export type OpeningDraft = Record<string, DraftRow>

/** Parses "1,23,456.50" / " 1200 " to paisa. Empty → 0. Returns null when the text is not a valid amount. */
export function parseAmountToPaisa(input: string): number | null {
  const cleaned = input.replace(/[,\s]/g, "")
  if (cleaned === "") return 0
  if (!/^\d+(\.\d{0,2})?$/.test(cleaned)) return null
  const [whole, fraction = ""] = cleaned.split(".")
  const paisa = Number(whole) * 100 + Number((fraction + "00").slice(0, 2))
  return Number.isSafeInteger(paisa) ? paisa : null
}

/** Inline validation message for an amount field, or null when it is fine. */
export function amountError(input: string): string | null {
  const cleaned = input.replace(/[,\s]/g, "")
  if (cleaned === "") return null
  if (cleaned.startsWith("-")) return "Use a positive amount; switch the side instead."
  if (/^\d+\.\d{3,}$/.test(cleaned)) return "At most 2 decimal places."
  if (parseAmountToPaisa(input) === null) return "Enter a number, e.g. 12,500.00"
  return null
}

/** An entered line ready to send: exactly one side is greater than zero. Amounts in rupees. */
export interface OpeningLineInput {
  accountId: string
  debitAmount: number
  creditAmount: number
}

/** Draft → API lines. Blank and zero rows are skipped; invalid rows are reported, never silently dropped. */
export function draftToLines(draft: OpeningDraft): { lines: OpeningLineInput[]; invalid: string[] } {
  const lines: OpeningLineInput[] = []
  const invalid: string[] = []
  for (const [accountId, row] of Object.entries(draft)) {
    const paisa = parseAmountToPaisa(row.amount)
    if (paisa === null || amountError(row.amount)) {
      invalid.push(accountId)
      continue
    }
    if (paisa === 0) continue
    const amount = paisa / 100
    lines.push(row.side === "debit" ? { accountId, debitAmount: amount, creditAmount: 0 } : { accountId, debitAmount: 0, creditAmount: amount })
  }
  return { lines, invalid }
}

export interface OpeningTotals {
  debit: number
  credit: number
  /** debit − credit */
  difference: number
  balanced: boolean
  /** The Owner's Equity line the server will post to balance the voucher; null when already balanced. */
  equityAdjustment: { side: BalanceSide; amount: number } | null
}

/** Totals, difference and the Owner's Equity adjustment, computed in paisa. */
export function computeTotals(lines: readonly Pick<OpeningLineInput, "debitAmount" | "creditAmount">[]): OpeningTotals {
  let debit = 0
  let credit = 0
  for (const l of lines) {
    debit += Math.round(l.debitAmount * 100)
    credit += Math.round(l.creditAmount * 100)
  }
  const diff = debit - credit
  return {
    debit: debit / 100,
    credit: credit / 100,
    difference: diff / 100,
    balanced: diff === 0,
    // Debits exceed credits → equity is credited (the owner's stake); the other way round → debited.
    equityAdjustment: diff === 0 ? null : diff > 0 ? { side: "credit", amount: diff / 100 } : { side: "debit", amount: -diff / 100 },
  }
}

/** Server state lines → draft rows (for Edit). */
export function linesToDraft(lines: readonly { accountId: string; debitAmount: number; creditAmount: number }[]): OpeningDraft {
  const draft: OpeningDraft = {}
  for (const l of lines) {
    const debit = l.debitAmount > 0
    draft[l.accountId] = { amount: formatAmountInput(debit ? l.debitAmount : l.creditAmount), side: debit ? "debit" : "credit" }
  }
  return draft
}

// ---------------------------------------------------------------------------------------------
// Formatting
// ---------------------------------------------------------------------------------------------

/**
 * Nepali/South-Asian digit grouping: last three digits, then pairs — 1,23,45,678.00. Deterministic
 * (no locale data), always two decimals, minus sign for negatives.
 */
export function formatNepaliAmount(value: number, fractionDigits = 2): string {
  const safe = Number.isFinite(value) ? value : 0
  const negative = safe < 0
  const fixed = Math.abs(safe).toFixed(fractionDigits)
  const [whole, fraction] = fixed.split(".")
  let grouped = whole
  if (whole.length > 3) {
    const head = whole.slice(0, -3)
    const tail = whole.slice(-3)
    grouped = `${head.replace(/\B(?=(\d{2})+(?!\d))/g, ",")},${tail}`
  }
  const text = fraction ? `${grouped}.${fraction}` : grouped
  return negative && Number(fixed) !== 0 ? `-${text}` : text
}

/** Amount as shown inside an input after blur: grouped, two decimals; blank for zero. */
export function formatAmountInput(value: number): string {
  return value ? formatNepaliAmount(value) : ""
}

// ---------------------------------------------------------------------------------------------
// Review + diff
// ---------------------------------------------------------------------------------------------

export interface LabelledLine {
  accountId: string
  accountCode: string
  accountName: string
  debitAmount: number
  creditAmount: number
}

export interface OpeningDiffRow {
  accountId: string
  accountCode: string
  accountName: string
  before: { side: BalanceSide; amount: number } | null
  after: { side: BalanceSide; amount: number } | null
  kind: "added" | "removed" | "changed"
}

function sided(l: Pick<LabelledLine, "debitAmount" | "creditAmount"> | undefined) {
  if (!l) return null
  if (l.debitAmount > 0) return { side: "debit" as const, amount: l.debitAmount }
  if (l.creditAmount > 0) return { side: "credit" as const, amount: l.creditAmount }
  return null
}

/** Accounts whose balance changes between `before` and `after` (code order). Unchanged accounts are omitted. */
export function buildDiff(before: readonly LabelledLine[], after: readonly LabelledLine[]): OpeningDiffRow[] {
  const b = new Map(before.map((l) => [l.accountId, l]))
  const a = new Map(after.map((l) => [l.accountId, l]))
  const ids = new Set([...b.keys(), ...a.keys()])
  const rows: OpeningDiffRow[] = []
  for (const id of ids) {
    const prev = sided(b.get(id))
    const next = sided(a.get(id))
    if (prev?.side === next?.side && Math.round((prev?.amount ?? 0) * 100) === Math.round((next?.amount ?? 0) * 100)) continue
    const label = a.get(id) ?? b.get(id)!
    rows.push({
      accountId: id,
      accountCode: label.accountCode,
      accountName: label.accountName,
      before: prev,
      after: next,
      kind: !prev ? "added" : !next ? "removed" : "changed",
    })
  }
  return rows.sort((x, y) => x.accountCode.localeCompare(y.accountCode, "en", { numeric: true }))
}

/** History change rows (Dr/Cr before and after) → the same shape as `buildDiff`, for the timeline. */
export function changesToDiff(
  changes: readonly {
    accountId: string
    accountCode: string
    accountName: string
    beforeDebit: number
    beforeCredit: number
    afterDebit: number
    afterCredit: number
  }[],
): OpeningDiffRow[] {
  return buildDiff(
    changes.map((c) => ({ accountId: c.accountId, accountCode: c.accountCode, accountName: c.accountName, debitAmount: c.beforeDebit, creditAmount: c.beforeCredit })),
    changes.map((c) => ({ accountId: c.accountId, accountCode: c.accountCode, accountName: c.accountName, debitAmount: c.afterDebit, creditAmount: c.afterCredit })),
  )
}

// ---------------------------------------------------------------------------------------------
// Permissions
// ---------------------------------------------------------------------------------------------

/** Backend AccountingPermissions.OpeningBalances: View reuses Vouchers.View; Manage is its own action. */
export const OPENING_BALANCE_PERMISSIONS = {
  view: "Permissions.Accounting.Vouchers.View",
  manage: "Permissions.Accounting.Vouchers.ManageOpeningBalances",
} as const

export function openingBalanceAccess(granted: readonly string[], isRoot = false): { canView: boolean; canManage: boolean } {
  const canManage = isRoot || granted.includes(OPENING_BALANCE_PERMISSIONS.manage)
  return { canView: canManage || granted.includes(OPENING_BALANCE_PERMISSIONS.view), canManage }
}

/** Opening dates can't be in the future; returns an inline message or null. */
export function openingDateError(ymd: string, todayYmd: string): string | null {
  if (!ymd) return "Choose the go-live date."
  if (ymd > todayYmd) return "The go-live date can't be in the future."
  return null
}
