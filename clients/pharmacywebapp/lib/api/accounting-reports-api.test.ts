import { describe, expect, it } from "vitest"
import {
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
