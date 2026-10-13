/**
 * Payment accounts: which cash / bank / wallet account each payment method's money posts to. The API keeps one
 * mapping per tenant (GET/PUT /accounting/payment-method-accounts); a method without a mapping uses its default
 * (cash → Cash 1000, insurance → Insurance Receivable 1190, everything else → Bank 1010).
 *
 * Pure helpers only — mapping the DTO, choosing which accounts a method may use, and building the update body.
 */

import type { AccountingAccount } from "@/features/accounting/api-client"

export const PAYMENT_ACCOUNT_METHODS = [
  { value: "cash", label: "Cash" },
  { value: "card", label: "Card" },
  { value: "bank", label: "Bank transfer" },
  { value: "cheque", label: "Cheque" },
  { value: "esewa", label: "eSewa" },
  { value: "khalti", label: "Khalti" },
  { value: "fonepay", label: "Fonepay" },
  { value: "insurance", label: "Insurance claim" },
  { value: "other", label: "Other" },
] as const

export type PaymentAccountMethod = (typeof PAYMENT_ACCOUNT_METHODS)[number]["value"]

/** The code prefix of the cash & bank block (Cash 1000, Bank 1010 and every till/bank/wallet beside them). */
export const CASH_BANK_CODE_PREFIX = "10"
export const CASH_ACCOUNT_CODE = "1000"
export const BANK_ACCOUNT_CODE = "1010"

/** PaymentMethodAccountDto from Modules.Accounting.Contracts. */
export interface DotnetPaymentMethodAccountDto {
  method: string
  accountId: string | null
  accountCode: string | null
  accountName: string | null
  isDefault: boolean
  defaultAccountCode: string
}

export interface PaymentMethodAccountRow {
  method: string
  account_id: string | null
  account_code: string | null
  account_name: string | null
  /** No mapping saved — the method posts to its built-in default account. */
  is_default: boolean
  default_account_code: string
}

export function toPaymentMethodAccountRow(dto: DotnetPaymentMethodAccountDto): PaymentMethodAccountRow {
  return {
    method: dto.method,
    account_id: dto.accountId ?? null,
    account_code: dto.accountCode ?? null,
    account_name: dto.accountName ?? null,
    is_default: dto.isDefault,
    default_account_code: dto.defaultAccountCode,
  }
}

export function paymentAccountMethodLabel(method: string): string {
  return PAYMENT_ACCOUNT_METHODS.find((m) => m.value === method)?.label ?? method
}

type AccountShape = Pick<AccountingAccount, "code" | "account_type" | "is_active" | "is_root_head" | "has_children">

/** An asset account in the 10xx cash & bank block. */
export function isCashBankAccount(account: Pick<AccountingAccount, "code" | "account_type">): boolean {
  return account.account_type === "asset" && account.code.startsWith(CASH_BANK_CODE_PREFIX)
}

/** Takes voucher lines: active, and a leaf of the chart (not a head or group). */
export function isPostableLeaf(account: Pick<AccountShape, "is_active" | "is_root_head" | "has_children">): boolean {
  return account.is_active && !account.is_root_head && !account.has_children
}

const byCode = (a: { code: string }, b: { code: string }) => a.code.localeCompare(b.code, undefined, { numeric: true })

/** Active leaf cash/bank accounts, by code — what deposits, reconciliation and money methods can use. */
export function cashBankAccounts<T extends AccountShape>(accounts: readonly T[]): T[] {
  return accounts.filter((a) => isCashBankAccount(a) && isPostableLeaf(a)).sort(byCode)
}

/** Accounts a method may map to: cash/bank leaves; insurance (money owed by the insurer) any active leaf asset. */
export function paymentAccountOptions<T extends AccountShape>(accounts: readonly T[], method: string): T[] {
  if (method !== "insurance") return cashBankAccounts(accounts)
  return accounts.filter((a) => a.account_type === "asset" && isPostableLeaf(a)).sort(byCode)
}

/** Every method's current account id, as the editor's starting draft. */
export function draftFromRows(rows: readonly PaymentMethodAccountRow[]): Record<string, string | null> {
  return Object.fromEntries(rows.map((r) => [r.method, r.account_id]))
}

export interface PaymentMethodAccountInput {
  method: string
  /** null resets the method to its built-in default. */
  accountId: string | null
}

/**
 * The PUT body for what changed in the editor. Choosing a method's default account again resets it (null) so the
 * tenant keeps following the default; unchanged methods are left out.
 */
export function buildPaymentAccountsUpdate(
  rows: readonly PaymentMethodAccountRow[],
  draft: Readonly<Record<string, string | null>>,
  accounts: readonly Pick<AccountingAccount, "id" | "code">[],
): PaymentMethodAccountInput[] {
  const changes: PaymentMethodAccountInput[] = []
  for (const row of rows) {
    const next = draft[row.method] ?? null
    if (next === null || next === row.account_id) continue
    const defaultId = accounts.find((a) => a.code === row.default_account_code)?.id ?? null
    if (next === defaultId) {
      if (!row.is_default) changes.push({ method: row.method, accountId: null })
      continue
    }
    changes.push({ method: row.method, accountId: next })
  }
  return changes
}

/** Where a method's money posts, for help text: the tenant's mapping when loaded, else the built-in default. */
export function resolvedPaymentAccount(
  method: string,
  rows: readonly PaymentMethodAccountRow[] | undefined,
): { code: string; name: string } {
  const row = rows?.find((r) => r.method === method)
  if (row?.account_code && row.account_name) return { code: row.account_code, name: row.account_name }
  if (method === "cash") return { code: CASH_ACCOUNT_CODE, name: "Cash" }
  if (method === "insurance") return { code: "1190", name: "Insurance Receivable" }
  return { code: BANK_ACCOUNT_CODE, name: "Bank" }
}

/**
 * The deposit dialog's starting target: the account the "bank" method maps to when it is a valid target, else
 * Bank 1010, else the first cash/bank account that isn't Cash itself.
 */
export function defaultDepositAccountId(
  targets: readonly Pick<AccountingAccount, "id" | "code">[],
  rows: readonly PaymentMethodAccountRow[] | undefined,
): string {
  const mapped = rows?.find((r) => r.method === "bank")?.account_id
  if (mapped && targets.some((a) => a.id === mapped)) return mapped
  return (targets.find((a) => a.code === BANK_ACCOUNT_CODE) ?? targets.find((a) => a.code !== CASH_ACCOUNT_CODE))?.id ?? ""
}

/** Deposit targets: cash/bank accounts other than the cash drawer the money leaves. */
export function depositTargetAccounts<T extends AccountShape & { id: string }>(
  accounts: readonly T[],
  rows: readonly PaymentMethodAccountRow[] | undefined,
): T[] {
  const cashId = rows?.find((r) => r.method === "cash")?.account_id
  return cashBankAccounts(accounts).filter((a) => (cashId ? a.id !== cashId : a.code !== CASH_ACCOUNT_CODE))
}
