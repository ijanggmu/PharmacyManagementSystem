import { describe, expect, it } from "vitest"
import {
  buildCashBankAccounts,
  cashBankKind,
  isCashBankAccount,
  sumCashBankFigures,
  periodTrialBalancePath,
  sumDebitsAndCredits,
  toPeriodBalances,
  toPeriodTrialBalanceData,
  type DotnetPeriodTrialBalanceDto,
} from "@/lib/api/accounting-reports-api"

const dto: DotnetPeriodTrialBalanceDto = {
  fromUtc: "2026-09-01T00:00:00Z",
  toUtc: "2026-09-30T23:59:59.999Z",
  branchId: null,
  lines: [
    {
      accountId: "a1",
      accountCode: "1000",
      accountName: "Cash",
      accountType: "Asset",
      openingDebit: 1200.004,
      openingCredit: 200,
      periodDebit: 250,
      periodCredit: 40,
      openingVoucherDebit: 0,
      openingVoucherCredit: 0,
    },
    {
      accountId: "a2",
      accountCode: "4000",
      accountName: "Sales",
      accountType: "Revenue",
      openingDebit: 0,
      openingCredit: 1000,
      periodDebit: 0,
      periodCredit: 210,
      openingVoucherDebit: 0,
      openingVoucherCredit: 0,
    },
  ],
  openingVouchersInPeriod: [{ voucherId: "v1", voucherNo: "OB-000001", voucherDateUtc: "2026-09-01T00:00:00Z", voucherType: "opening_balance" }],
}

describe("period trial balance client", () => {
  it("builds the request with an inclusive end day and the branch only when set", () => {
    const sp = new URLSearchParams(periodTrialBalancePath("2026-09-01", "2026-09-30", "b1").split("?")[1])
    expect(sp.get("fromUtc")).toBe("2026-08-31T18:15:00.000Z")
    expect(sp.get("toUtc")).toBe("2026-09-30T18:14:59.999Z")
    expect(sp.get("branchId")).toBe("b1")
    expect(periodTrialBalancePath("2026-09-01", "2026-09-30")).not.toContain("branchId")
    expect(() => periodTrialBalancePath("01/09/2026", "2026-09-30")).toThrow()
  })

  it("maps the DTO: lower-case types, rounded amounts, opening vouchers as dates", () => {
    const data = toPeriodTrialBalanceData(dto, "2026-09-01", "2026-09-30")
    expect(data.accounts[0]).toMatchObject({ code: "1000", accountType: "asset", openingDebit: 1200 })
    expect(data.openingVouchersInPeriod).toEqual([{ id: "v1", voucherNo: "OB-000001", date: "2026-09-01", voucherType: "opening_balance" }])
  })

  it("derives opening, activity and closing rows for the other period reports", () => {
    const { opening, activity, closing } = toPeriodBalances(toPeriodTrialBalanceData(dto, "2026-09-01", "2026-09-30"))
    expect(opening[0]).toMatchObject({ debit: 1200, credit: 200 })
    expect(activity[1]).toMatchObject({ code: "4000", debit: 0, credit: 210 })
    expect(closing[0]).toMatchObject({ debit: 1450, credit: 240 })
    expect(sumDebitsAndCredits(activity)).toEqual({ debit: 250, credit: 250 })
  })
})

describe("cash & bank accounts", () => {
  const row = (accountId: string, code: string, name: string, debit: number, credit: number, accountType = "asset") => ({
    accountId,
    code,
    name,
    accountType,
    debit,
    credit,
  })

  it("treats every asset 10xx account as cash or bank", () => {
    expect(isCashBankAccount("1000", "asset")).toBe(true)
    expect(isCashBankAccount("101001", "Asset")).toBe(true)
    expect(isCashBankAccount("1100", "asset")).toBe(false)
    expect(isCashBankAccount("1000", "liability")).toBe(false)
  })

  it("classifies bank accounts by the 1010 block or a bank name", () => {
    expect(cashBankKind("1000", "Cash")).toBe("cash")
    expect(cashBankKind("100001", "Till 2")).toBe("cash")
    expect(cashBankKind("1010", "Bank")).toBe("bank")
    expect(cashBankKind("101001", "NIC Asia")).toBe("bank")
    expect(cashBankKind("1020", "Nabil Bank current")).toBe("bank")
  })

  it("builds figures for each cash/bank account and sums them by kind", () => {
    const opening = [
      row("c", "1000", "Cash", 500, 100),
      row("b", "1010", "Bank", 0, 0),
      row("t", "100001", "Till 2", 50, 0),
      row("n", "101001", "NIC Asia", 1000, 0),
      row("ar", "1100", "Accounts Receivable", 900, 0),
      row("g", "1030", "Unused group", 0, 0),
    ]
    const activity = [
      row("c", "1000", "Cash", 200, 50),
      row("t", "100001", "Till 2", 10, 5),
      row("n", "101001", "NIC Asia", 0, 300),
      row("p", "100002", "Petty cash", 20, 0),
    ]
    const accounts = buildCashBankAccounts(opening, activity)
    expect(accounts.map((a) => a.code)).toEqual(["1000", "100001", "100002", "1010", "101001"])
    expect(accounts.find((a) => a.code === "1000")).toMatchObject({ kind: "cash", opening: 400, receipts: 200, payments: 50, closing: 550 })
    expect(accounts.find((a) => a.code === "100002")).toMatchObject({ opening: 0, receipts: 20, closing: 20 })
    expect(accounts.find((a) => a.code === "101001")).toMatchObject({ kind: "bank", opening: 1000, payments: 300, closing: 700 })
    expect(sumCashBankFigures(accounts, "cash")).toEqual({ opening: 450, receipts: 230, payments: 55, closing: 625 })
    expect(sumCashBankFigures(accounts, "bank")).toEqual({ opening: 1000, receipts: 0, payments: 300, closing: 700 })
  })
})
