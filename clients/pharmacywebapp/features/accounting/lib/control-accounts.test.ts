import { describe, expect, it } from "vitest"
import { isControlAccount, isSubledgerOpeningAccount, journalPickableAccounts } from "./control-accounts"
import { groupAccounts, isOpeningAccount, type OpeningAccount } from "./opening-balances"

const acct = (code: string, is_system = true) => ({ id: `id-${code}`, code, is_system })

describe("control accounts", () => {
  it("treats the system AR, AP, Inventory, Input VAT and VAT Payable accounts as control accounts", () => {
    for (const code of ["1100", "2000", "1200", "1150", "2100"]) expect(isControlAccount(acct(code))).toBe(true)
    for (const code of ["1000", "1010", "4000", "5100", "3000"]) expect(isControlAccount(acct(code))).toBe(false)
    expect(isControlAccount(acct("1100", false))).toBe(false)
  })

  it("hides control accounts from the journal picker but keeps one already on a line", () => {
    const accounts = [acct("1010"), acct("1100"), acct("4000"), acct("2100")]
    expect(journalPickableAccounts(accounts).map((a) => a.code)).toEqual(["1010", "4000"])
    expect(journalPickableAccounts(accounts, new Set(["id-1100"])).map((a) => a.code)).toEqual(["1010", "1100", "4000"])
  })

  it("only AR, AP and Inventory take their opening from a subledger", () => {
    expect(["1100", "2000", "1200"].every((c) => isSubledgerOpeningAccount(acct(c)))).toBe(true)
    expect(["1150", "2100", "1000"].some((c) => isSubledgerOpeningAccount(acct(c)))).toBe(false)
  })
})

describe("GL opening balance accounts", () => {
  const opening = (code: string, type: string, is_system = true): OpeningAccount => ({
    id: `id-${code}`,
    code,
    name: `Account ${code}`,
    account_type: type,
    is_active: true,
    has_children: false,
    is_root_head: false,
    is_system,
  })

  it("leaves out AR, AP and Inventory unless the current opening already carries them", () => {
    const accounts = [opening("1000", "asset"), opening("1100", "asset"), opening("1200", "asset"), opening("2000", "liability"), opening("2100", "liability")]
    const codes = (keep?: Set<string>) => groupAccounts(accounts, keep).flatMap((g) => g.accounts.map((a) => a.code))

    expect(codes()).toEqual(["1000", "2100"])
    expect(codes(new Set(["id-1200"]))).toEqual(["1000", "1200", "2100"])
    expect(isOpeningAccount(opening("1100", "asset", false))).toBe(true)
  })
})
