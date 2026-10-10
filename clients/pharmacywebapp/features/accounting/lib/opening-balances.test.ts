import { describe, expect, it } from "vitest"
import {
  amountError,
  buildDiff,
  changesToDiff,
  computeTotals,
  draftToLines,
  formatNepaliAmount,
  groupAccounts,
  isOpeningAccount,
  linesToDraft,
  naturalSideFor,
  openingBalanceAccess,
  openingDateError,
  parseAmountToPaisa,
  sectionFor,
  type OpeningAccount,
} from "./opening-balances"

const acct = (code: string, type: string, extra: Partial<OpeningAccount> = {}): OpeningAccount => ({
  id: `id-${code}`,
  code,
  name: `Account ${code}`,
  account_type: type,
  is_active: true,
  has_children: false,
  is_root_head: false,
  ...extra,
})

describe("sectionFor / groupAccounts", () => {
  it.each([
    ["1000", "asset", "cash-bank"],
    ["1010", "asset", "cash-bank"],
    ["101001", "asset", "cash-bank"],
    ["1100", "asset", "receivables"],
    ["1150", "asset", "receivables"],
    ["1200", "asset", "inventory"],
    ["1300", "asset", "other-assets"],
    ["2000", "liability", "payables"],
    ["2100", "liability", "payables"],
    ["2200", "liability", "loans"],
    ["3000", "equity", "equity"],
  ])("%s (%s) -> %s", (code, type, section) => {
    expect(sectionFor({ code, account_type: type })).toBe(section)
  })

  it("keeps only active leaf balance-sheet accounts, in section then code order", () => {
    const groups = groupAccounts([
      acct("1200", "asset"),
      acct("1010", "asset"),
      acct("1000", "asset"),
      acct("4000", "revenue"),
      acct("1300", "asset", { has_children: true }),
      acct("1", "asset", { is_root_head: true }),
      acct("2200", "liability", { is_active: false }),
      acct("2000", "Liability"),
    ])
    expect(groups.map((g) => g.section.id)).toEqual(["cash-bank", "receivables", "inventory", "other-assets", "payables", "loans", "equity"])
    expect(groups[0].accounts.map((a) => a.code)).toEqual(["1000", "1010"])
    expect(groups[2].accounts.map((a) => a.code)).toEqual(["1200"])
    expect(groups[4].accounts.map((a) => a.code)).toEqual(["2000"])
    expect(groups.flatMap((g) => g.accounts).some((a) => a.code === "4000")).toBe(false)
  })

  it("defaults assets to debit and liabilities/equity to credit", () => {
    expect(naturalSideFor({ code: "1000", account_type: "asset" })).toBe("debit")
    expect(naturalSideFor({ code: "2000", account_type: "liability" })).toBe("credit")
    expect(naturalSideFor({ code: "3000", account_type: "equity" })).toBe("credit")
    expect(isOpeningAccount(acct("5000", "expense"))).toBe(false)
  })
})

describe("amount parsing", () => {
  it("parses grouped figures to paisa", () => {
    expect(parseAmountToPaisa("1,23,456.5")).toBe(12345650)
    expect(parseAmountToPaisa(" 1200 ")).toBe(120000)
    expect(parseAmountToPaisa("")).toBe(0)
    expect(parseAmountToPaisa("0.1")).toBe(10)
  })

  it("rejects text, negatives and 3+ decimals with a plain message", () => {
    expect(parseAmountToPaisa("abc")).toBeNull()
    expect(amountError("abc")).toMatch(/number/)
    expect(amountError("-5")).toMatch(/positive/)
    expect(amountError("1.005")).toMatch(/2 decimal/)
    expect(amountError("1,000.50")).toBeNull()
  })
})

describe("draftToLines + computeTotals", () => {
  it("skips blank rows, reports invalid ones and puts amounts on the chosen side", () => {
    const { lines, invalid } = draftToLines({
      cash: { amount: "5,000", side: "debit" },
      stock: { amount: "20000.25", side: "debit" },
      ap: { amount: "8000", side: "credit" },
      blank: { amount: "", side: "debit" },
      bad: { amount: "12x", side: "debit" },
    })
    expect(invalid).toEqual(["bad"])
    expect(lines).toEqual([
      { accountId: "cash", debitAmount: 5000, creditAmount: 0 },
      { accountId: "stock", debitAmount: 20000.25, creditAmount: 0 },
      { accountId: "ap", debitAmount: 0, creditAmount: 8000 },
    ])
  })

  it("credits Owner's Equity with the difference when debits exceed credits", () => {
    const t = computeTotals([
      { debitAmount: 5000, creditAmount: 0 },
      { debitAmount: 20000.25, creditAmount: 0 },
      { debitAmount: 0, creditAmount: 8000 },
    ])
    expect(t).toEqual({ debit: 25000.25, credit: 8000, difference: 17000.25, balanced: false, equityAdjustment: { side: "credit", amount: 17000.25 } })
  })

  it("debits equity when credits exceed debits, and is balanced without float noise", () => {
    expect(computeTotals([{ debitAmount: 100, creditAmount: 0 }, { debitAmount: 0, creditAmount: 350.5 }]).equityAdjustment).toEqual({
      side: "debit",
      amount: 250.5,
    })
    const t = computeTotals([
      { debitAmount: 0.1, creditAmount: 0 },
      { debitAmount: 0.2, creditAmount: 0 },
      { debitAmount: 0, creditAmount: 0.3 },
    ])
    expect(t.balanced).toBe(true)
    expect(t.equityAdjustment).toBeNull()
  })

  it("round-trips server lines into a draft", () => {
    const draft = linesToDraft([
      { accountId: "a", debitAmount: 1234567.5, creditAmount: 0 },
      { accountId: "b", debitAmount: 0, creditAmount: 10 },
    ])
    expect(draft).toEqual({ a: { amount: "12,34,567.50", side: "debit" }, b: { amount: "10.00", side: "credit" } })
    expect(draftToLines(draft).lines).toEqual([
      { accountId: "a", debitAmount: 1234567.5, creditAmount: 0 },
      { accountId: "b", debitAmount: 0, creditAmount: 10 },
    ])
  })
})

describe("formatNepaliAmount", () => {
  it.each([
    [0, "0.00"],
    [999, "999.00"],
    [1000, "1,000.00"],
    [123456, "1,23,456.00"],
    [12345678.9, "1,23,45,678.90"],
    [-1500.5, "-1,500.50"],
  ])("%d -> %s", (n, text) => {
    expect(formatNepaliAmount(n)).toBe(text)
  })
})

describe("buildDiff / changesToDiff", () => {
  const line = (id: string, code: string, dr: number, cr: number) => ({ accountId: id, accountCode: code, accountName: code, debitAmount: dr, creditAmount: cr })

  it("lists added, removed and changed accounts in code order and skips unchanged", () => {
    const rows = buildDiff(
      [line("cash", "1000", 500, 0), line("stock", "1200", 900, 0), line("ap", "2000", 0, 100)],
      [line("cash", "1000", 500, 0), line("stock", "1200", 950, 0), line("loan", "2200", 0, 40)],
    )
    expect(rows.map((r) => [r.accountCode, r.kind])).toEqual([
      ["1200", "changed"],
      ["2000", "removed"],
      ["2200", "added"],
    ])
    expect(rows[0].before).toEqual({ side: "debit", amount: 900 })
    expect(rows[0].after).toEqual({ side: "debit", amount: 950 })
  })

  it("treats a side switch as a change", () => {
    expect(buildDiff([line("bank", "1010", 50, 0)], [line("bank", "1010", 0, 50)])[0].kind).toBe("changed")
  })

  it("maps history change rows", () => {
    const rows = changesToDiff([
      { accountId: "a", accountCode: "1000", accountName: "Cash", beforeDebit: 0, beforeCredit: 0, afterDebit: 10, afterCredit: 0 },
    ])
    expect(rows).toEqual([
      { accountId: "a", accountCode: "1000", accountName: "Cash", before: null, after: { side: "debit", amount: 10 }, kind: "added" },
    ])
  })
})

describe("access + date", () => {
  it("needs the Manage permission to change, Vouchers.View to see", () => {
    expect(openingBalanceAccess(["Permissions.Accounting.Vouchers.View"])).toEqual({ canView: true, canManage: false })
    expect(openingBalanceAccess(["Permissions.Accounting.Vouchers.ManageOpeningBalances"])).toEqual({ canView: true, canManage: true })
    expect(openingBalanceAccess([])).toEqual({ canView: false, canManage: false })
    expect(openingBalanceAccess([], true)).toEqual({ canView: true, canManage: true })
  })

  it("rejects missing and future go-live dates", () => {
    expect(openingDateError("", "2026-10-09")).toMatch(/Choose/)
    expect(openingDateError("2026-10-10", "2026-10-09")).toMatch(/future/)
    expect(openingDateError("2026-07-16", "2026-10-09")).toBeNull()
  })
})
