import { describe, expect, it } from "vitest"
import type { AccountingAccount } from "@/features/accounting/api-client"
import {
  PAYMENT_ACCOUNT_METHODS,
  buildPaymentAccountsUpdate,
  cashBankAccounts,
  defaultDepositAccountId,
  depositTargetAccounts,
  draftFromRows,
  isCashBankAccount,
  paymentAccountMethodLabel,
  paymentAccountOptions,
  resolvedPaymentAccount,
  toPaymentMethodAccountRow,
  type PaymentMethodAccountRow,
} from "./payment-accounts"

function account(id: string, code: string, patch: Partial<AccountingAccount> = {}): AccountingAccount {
  return {
    id,
    code,
    name: `Account ${code}`,
    account_type: "asset",
    is_system: false,
    is_active: true,
    parent_id: "assets",
    has_children: false,
    has_postings: false,
    is_root_head: false,
    ...patch,
  }
}

const chart: AccountingAccount[] = [
  account("assets", "1", { is_root_head: true, parent_id: null, is_system: true }),
  account("bank", "1010", { is_system: true, name: "Bank" }),
  account("cash", "1000", { is_system: true, name: "Cash" }),
  account("nabil", "1020", { name: "Nabil Bank" }),
  account("old", "1030", { is_active: false }),
  account("group", "1040", { has_children: true }),
  account("ar", "1100", { is_system: true }),
  account("ins", "1190", { is_system: true, name: "Insurance Receivable" }),
  account("vat", "2100", { account_type: "liability" }),
]

function row(method: string, accountId: string | null, code: string | null, isDefault: boolean, defaultCode = "1010"): PaymentMethodAccountRow {
  return {
    method,
    account_id: accountId,
    account_code: code,
    account_name: code ? `Account ${code}` : null,
    is_default: isDefault,
    default_account_code: defaultCode,
  }
}

describe("toPaymentMethodAccountRow", () => {
  it("maps the API DTO", () => {
    expect(
      toPaymentMethodAccountRow({
        method: "esewa",
        accountId: "nabil",
        accountCode: "1020",
        accountName: "Nabil Bank",
        isDefault: false,
        defaultAccountCode: "1010",
      })
    ).toEqual({
      method: "esewa",
      account_id: "nabil",
      account_code: "1020",
      account_name: "Nabil Bank",
      is_default: false,
      default_account_code: "1010",
    })
  })
})

describe("account choices", () => {
  it("treats only 10xx assets as cash/bank", () => {
    expect(isCashBankAccount({ code: "1020", account_type: "asset" })).toBe(true)
    expect(isCashBankAccount({ code: "1100", account_type: "asset" })).toBe(false)
    expect(isCashBankAccount({ code: "1000", account_type: "liability" })).toBe(false)
  })

  it("lists active leaf cash/bank accounts by code", () => {
    expect(cashBankAccounts(chart).map((a) => a.code)).toEqual(["1000", "1010", "1020"])
  })

  it("lets insurance use any active leaf asset, other methods only cash/bank", () => {
    expect(paymentAccountOptions(chart, "esewa").map((a) => a.code)).toEqual(["1000", "1010", "1020"])
    expect(paymentAccountOptions(chart, "insurance").map((a) => a.code)).toEqual(["1000", "1010", "1020", "1100", "1190"])
  })

  it("labels every method", () => {
    expect(PAYMENT_ACCOUNT_METHODS.map((m) => m.value)).toEqual(["cash", "card", "bank", "cheque", "esewa", "khalti", "fonepay", "insurance", "other"])
    expect(paymentAccountMethodLabel("esewa")).toBe("eSewa")
    expect(paymentAccountMethodLabel("unknown")).toBe("unknown")
  })
})

describe("buildPaymentAccountsUpdate", () => {
  const rows = [
    row("cash", "cash", "1000", true, "1000"),
    row("esewa", "nabil", "1020", false),
    row("card", "bank", "1010", true),
  ]

  it("sends nothing when nothing changed", () => {
    expect(buildPaymentAccountsUpdate(rows, draftFromRows(rows), chart)).toEqual([])
  })

  it("sends a changed method's new account", () => {
    expect(buildPaymentAccountsUpdate(rows, { ...draftFromRows(rows), card: "nabil" }, chart)).toEqual([{ method: "card", accountId: "nabil" }])
  })

  it("resets a mapped method to null when its default account is chosen again", () => {
    expect(buildPaymentAccountsUpdate(rows, { ...draftFromRows(rows), esewa: "bank" }, chart)).toEqual([{ method: "esewa", accountId: null }])
  })
})

describe("resolvedPaymentAccount", () => {
  it("uses the tenant mapping when loaded", () => {
    expect(resolvedPaymentAccount("esewa", [row("esewa", "nabil", "1020", false)])).toEqual({ code: "1020", name: "Account 1020" })
  })

  it("falls back to the built-in defaults", () => {
    expect(resolvedPaymentAccount("cash", undefined)).toEqual({ code: "1000", name: "Cash" })
    expect(resolvedPaymentAccount("khalti", [])).toEqual({ code: "1010", name: "Bank" })
    expect(resolvedPaymentAccount("insurance", undefined).code).toBe("1190")
  })
})

describe("deposit target", () => {
  it("excludes the cash drawer and starts at the bank mapping", () => {
    const rows = [row("cash", "cash", "1000", true, "1000"), row("bank", "nabil", "1020", false)]
    const targets = depositTargetAccounts(chart, rows)
    expect(targets.map((a) => a.code)).toEqual(["1010", "1020"])
    expect(defaultDepositAccountId(targets, rows)).toBe("nabil")
  })

  it("defaults to Bank 1010 before the mapping loads", () => {
    const targets = depositTargetAccounts(chart, undefined)
    expect(targets.map((a) => a.code)).toEqual(["1010", "1020"])
    expect(defaultDepositAccountId(targets, undefined)).toBe("bank")
  })
})
