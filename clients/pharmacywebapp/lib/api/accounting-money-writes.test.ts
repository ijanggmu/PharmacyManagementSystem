import { beforeEach, describe, expect, it, vi } from "vitest"

const { get, post } = vi.hoisted(() => ({
  get: vi.fn((..._args: unknown[]) => Promise.resolve({} as unknown)),
  post: vi.fn((..._args: unknown[]) => Promise.resolve("new-id" as unknown)),
}))

vi.mock("@/lib/api/dotnet-client", () => ({
  dotnetClient: { get, post, put: vi.fn(), delete: vi.fn(), patch: vi.fn() },
  DotnetApiError: class DotnetApiError extends Error {},
}))

import { dateOnly, recordVatPayment } from "@/lib/api/accounting-reports-api"
import { dotnetAccountingApi } from "@/lib/api/accounting-api"
import { createStatementImport, recordBankDeposit } from "@/lib/api/bank-reconciliation-api"

beforeEach(() => {
  get.mockReset()
  post.mockReset()
  post.mockResolvedValue("new-id")
  get.mockResolvedValue({ currentBranchId: "b1", branches: [{ id: "b1" }] })
})

describe("report dates are Nepal business days", () => {
  it("maps an instant before 05:45 NPT to the Nepal day, not the UTC date", () => {
    // 2026-10-11T20:00Z is 01:45 on 12 Oct in Kathmandu.
    expect(dateOnly("2026-10-11T20:00:00Z")).toBe("2026-10-12")
    expect(dateOnly("2026-10-12T06:00:00Z")).toBe("2026-10-12")
    // A business-date instant (midnight UTC) stays on its own day.
    expect(dateOnly("2026-10-12T00:00:00Z")).toBe("2026-10-12")
  })
})

describe("money writes carry the caller's Idempotency-Key", () => {
  it("VAT payment: business-date instant and the key", async () => {
    await recordVatPayment({ payment_date: "2026-10-05", amount: 1300, payment_method: "bank" }, "key-vat")

    const [path, body, key] = post.mock.calls.at(-1) as [string, Record<string, unknown>, string]
    expect(path).toBe("/accounting/vat/payments")
    expect(body.paymentDateUtc).toBe("2026-10-05T00:00:00Z")
    expect(key).toBe("key-vat")
  })

  it("expense", async () => {
    await dotnetAccountingApi.recordExpense(
      { category: "rent", amount: 100, expense_date: "2026-10-05", payment_method: "cash" },
      "key-exp"
    )
    expect(post.mock.calls.at(-1)?.[2]).toBe("key-exp")
  })

  it("manual voucher draft", async () => {
    get.mockResolvedValueOnce({ voucherNo: "MJ-000001" })
    await dotnetAccountingApi.createManualDraft(
      {
        voucher_date: "2026-10-05",
        lines: [
          { account_id: "a1", debit_amount: 10, credit_amount: 0 },
          { account_id: "a2", debit_amount: 0, credit_amount: 10 },
        ],
      },
      "key-mj"
    )
    expect(post.mock.calls.at(-1)?.[2]).toBe("key-mj")
  })

  it("bank deposit", async () => {
    await recordBankDeposit({ branch_id: "b1", amount: 500, deposit_date: "2026-10-05" }, "key-dep")
    expect(post.mock.calls.at(-1)?.[2]).toBe("key-dep")
    expect(post.mock.calls.at(-1)?.[1]).toMatchObject({ accountId: null })
  })

  it("bank deposit to a chosen account", async () => {
    await recordBankDeposit({ branch_id: "b1", amount: 500, deposit_date: "2026-10-05", account_id: "acc-nabil" }, "key-dep2")
    expect(post.mock.calls.at(-1)?.[1]).toMatchObject({ amount: 500, accountId: "acc-nabil" })
  })

  it("bank statement import", async () => {
    get.mockResolvedValueOnce({ currentBranchId: "b1", branches: [{ id: "b1" }] })
    await createStatementImport(
      {
        account_id: "bank",
        branch_id: "b1",
        statement_label: null,
        period_start: "2026-10-01",
        period_end: "2026-10-05",
        closing_balance: null,
        lines: [{ txn_date: "2026-10-02", description: "Deposit", debit: 0, credit: 500 }],
      },
      "key-stmt"
    )
    expect(post.mock.calls.at(-1)?.[2]).toBe("key-stmt")
  })
})
