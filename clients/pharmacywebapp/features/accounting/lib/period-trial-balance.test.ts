import { describe, expect, it } from "vitest"
import type { PeriodTrialBalanceAccount } from "@/lib/api/accounting-reports-api"
import { balanceOf, buildTrialBalanceView, trialBalanceCsv, trialBalanceRow } from "./period-trial-balance"

function acct(code: string, type: string, o: Partial<PeriodTrialBalanceAccount> = {}): PeriodTrialBalanceAccount {
  return {
    accountId: `id-${code}`,
    code,
    name: `Account ${code}`,
    accountType: type,
    openingDebit: 0,
    openingCredit: 0,
    periodDebit: 0,
    periodCredit: 0,
    openingVoucherDebit: 0,
    openingVoucherCredit: 0,
    ...o,
  }
}

/** Opening: cash 1000 Dr / capital 1000 Cr. Period: sale 250 (cash Dr / sales Cr), expense 40 (rent Dr / cash Cr). */
const books: PeriodTrialBalanceAccount[] = [
  acct("4000", "revenue", { periodCredit: 250 }),
  acct("1000", "asset", { openingDebit: 1200, openingCredit: 200, periodDebit: 250, periodCredit: 40 }),
  acct("3000", "equity", { openingCredit: 1000 }),
  acct("5100", "expense", { periodDebit: 40 }),
  acct("1010", "asset"),
]

describe("trialBalanceRow", () => {
  it("nets opening and closing onto one side and keeps the movement gross", () => {
    const cash = trialBalanceRow(books[1])
    expect(cash).toMatchObject({ openingDr: 1000, openingCr: 0, periodDr: 250, periodCr: 40, closingDr: 1210, closingCr: 0 })
    const capital = trialBalanceRow(books[2])
    expect(capital).toMatchObject({ openingDr: 0, openingCr: 1000, closingDr: 0, closingCr: 1000 })
  })

  it("puts a credit closing balance on the Cr side", () => {
    const r = trialBalanceRow(acct("2000", "liability", { openingDebit: 50, periodCredit: 80 }))
    expect(r).toMatchObject({ openingDr: 50, closingDr: 0, closingCr: 30 })
  })

  it("folds an in-period opening-balance voucher into opening by default, and keeps closing identical", () => {
    const a = acct("1000", "asset", { periodDebit: 1075, openingVoucherDebit: 1000 })
    const asOpening = trialBalanceRow(a, true)
    const asMovement = trialBalanceRow(a, false)
    expect(asOpening).toMatchObject({ openingDr: 1000, periodDr: 75, closingDr: 1075, openingVoucherNet: 1000 })
    expect(asMovement).toMatchObject({ openingDr: 0, periodDr: 1075, closingDr: 1075 })
  })

  it("does not drift on fractional paisa", () => {
    const r = trialBalanceRow(acct("1000", "asset", { periodDebit: 0.1, periodCredit: 0.2, openingDebit: 0.3 }))
    expect(r.closingDr).toBe(0.2)
  })
})

describe("buildTrialBalanceView", () => {
  it("balances opening, movement and closing for balanced books", () => {
    const view = buildTrialBalanceView(books)
    expect(view.totals).toEqual({ openingDr: 1000, openingCr: 1000, periodDr: 290, periodCr: 290, closingDr: 1250, closingCr: 1250 })
    expect(view.balance.all).toBe(true)
  })

  it("flags each unbalanced pair with its difference", () => {
    const broken = [...books, acct("9999", "expense", { periodDebit: 5 })]
    const view = buildTrialBalanceView(broken)
    expect(view.balance.opening).toBe(true)
    expect(view.balance.movement).toBe(false)
    expect(view.balance.closing).toBe(false)
    expect(view.balance.all).toBe(false)
    expect(view.balance.movementDifference).toBe(5)
    expect(view.balance.closingDifference).toBe(5)
  })

  it("sorts by code, groups by type in chart order with subtotals", () => {
    const view = buildTrialBalanceView(books)
    expect(view.rows.map((r) => r.code)).toEqual(["1000", "1010", "3000", "4000", "5100"])
    expect(view.groups.map((g) => g.type)).toEqual(["asset", "equity", "revenue", "expense"])
    expect(view.groups[0].totals.closingDr).toBe(1210)
    expect(view.groups[2].totals).toMatchObject({ periodCr: 250, closingCr: 250 })
  })

  it("hides zero rows and searches, but totals still cover every account", () => {
    const view = buildTrialBalanceView([...books, acct("9999", "expense", { periodDebit: 5 })], { hideZero: true, search: "account 1" })
    expect(view.rows.map((r) => r.code)).toEqual(["1000"])
    expect(view.totals.periodDr).toBe(295)
    expect(view.balance.movement).toBe(false)
  })

  it("reports whether an opening-balance voucher falls inside the period", () => {
    expect(buildTrialBalanceView(books).hasOpeningVoucherInPeriod).toBe(false)
    const withOb = [acct("1000", "asset", { periodDebit: 500, openingVoucherDebit: 500 }), acct("3000", "equity", { periodCredit: 500, openingVoucherCredit: 500 })]
    const view = buildTrialBalanceView(withOb)
    expect(view.hasOpeningVoucherInPeriod).toBe(true)
    expect(view.totals).toMatchObject({ openingDr: 500, openingCr: 500, periodDr: 0, periodCr: 0 })
    expect(buildTrialBalanceView(withOb, { openingVoucherAsOpening: false }).totals).toMatchObject({ openingDr: 0, periodDr: 500, periodCr: 500 })
  })
})

describe("balanceOf / trialBalanceCsv", () => {
  it("treats sub-paisa noise as balanced", () => {
    expect(balanceOf({ openingDr: 0.1 + 0.2, openingCr: 0.3, periodDr: 0, periodCr: 0, closingDr: 0, closingCr: 0 }).all).toBe(true)
  })

  it("exports accounts, group subtotals and the grand total", () => {
    const view = buildTrialBalanceView(books, { hideZero: true })
    const flat = trialBalanceCsv(view, false)
    expect(flat.headers).toHaveLength(9)
    expect(flat.rows).toHaveLength(5)
    expect(flat.rows.at(-1)).toEqual(["TOTAL", "All accounts", "", "1000.00", "1000.00", "290.00", "290.00", "1250.00", "1250.00"])
    const grouped = trialBalanceCsv(view, true)
    expect(grouped.rows).toContainEqual(["", "Total assets", "Assets", "1000.00", "0.00", "250.00", "40.00", "1210.00", "0.00"])
  })
})
