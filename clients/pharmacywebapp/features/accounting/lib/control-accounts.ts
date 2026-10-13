/**
 * Control accounts: system accounts whose balance is mirrored by a subledger (customer dues, supplier dues,
 * stock, VAT, the fixed asset register). Mirrors `AccountingControlAccounts` in Modules.Accounting.Contracts — the server refuses manual
 * journals on them and GL opening balances on AR/AP/Inventory; the UI hides them so the user isn't led there.
 */

export const CONTROL_ACCOUNT_CODES = {
  accountsReceivable: "1100",
  inputVat: "1150",
  inventory: "1200",
  accountsPayable: "2000",
  vatPayable: "2100",
  fixedAssets: "1550",
  accumulatedDepreciation: "1590",
} as const

/** Control account code → where to record the entry instead. */
export const CONTROL_ACCOUNT_RECORD_INSTEAD: Readonly<Record<string, string>> = {
  [CONTROL_ACCOUNT_CODES.accountsReceivable]: "customer receipts, sales or a customer's opening balance",
  [CONTROL_ACCOUNT_CODES.accountsPayable]: "supplier payments, purchases or a supplier's opening balance",
  [CONTROL_ACCOUNT_CODES.inventory]: "purchases, stock adjustments or opening stock",
  [CONTROL_ACCOUNT_CODES.inputVat]: "purchases and the VAT payment",
  [CONTROL_ACCOUNT_CODES.vatPayable]: "sales and the VAT payment",
  [CONTROL_ACCOUNT_CODES.fixedAssets]: "the fixed asset register (add or dispose of an asset)",
  [CONTROL_ACCOUNT_CODES.accumulatedDepreciation]: "depreciation runs and asset disposals in the fixed asset register",
}

/** Control accounts whose opening comes from per-customer/per-supplier openings, opening stock or opening fixed assets. */
const SUBLEDGER_OPENING_CODES: ReadonlySet<string> = new Set([
  CONTROL_ACCOUNT_CODES.accountsReceivable,
  CONTROL_ACCOUNT_CODES.accountsPayable,
  CONTROL_ACCOUNT_CODES.inventory,
  CONTROL_ACCOUNT_CODES.fixedAssets,
  CONTROL_ACCOUNT_CODES.accumulatedDepreciation,
])

interface ControlAccountLike {
  code: string
  is_system: boolean
}

/** True for a control account (manual journals can't post to it). */
export function isControlAccount(a: ControlAccountLike): boolean {
  return a.is_system && Object.prototype.hasOwnProperty.call(CONTROL_ACCOUNT_RECORD_INSTEAD, a.code.trim())
}

/** True for a control account whose opening balance is entered through its subledger, not the GL opening screen. */
export function isSubledgerOpeningAccount(a: ControlAccountLike): boolean {
  return a.is_system && SUBLEDGER_OPENING_CODES.has(a.code.trim())
}

/**
 * Accounts a manual journal line may pick: everything except control accounts. `keepIds` keeps a control
 * account already on a line (an old draft) visible so the line still shows what it holds; the server
 * refuses it on save and posting.
 */
export function journalPickableAccounts<T extends ControlAccountLike & { id: string }>(
  accounts: readonly T[],
  keepIds: ReadonlySet<string> = new Set(),
): T[] {
  return accounts.filter((a) => !isControlAccount(a) || keepIds.has(a.id))
}
