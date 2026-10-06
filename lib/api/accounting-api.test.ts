import { describe, expect, it } from "vitest"
import {
  buildCreateManualVoucherBody,
  buildExpenseListPath,
  buildRecordExpenseBody,
  buildReverseVoucherBody,
  buildSetPostingLockBody,
  buildVoucherListPath,
  canListVouchersOnDotnet,
  canRecordExpenseOnDotnet,
  toExpense,
  toPostingLock,
  toVoucherDetail,
  toVoucherRow,
  toVoucherStatus,
  voucherPageFor,
  type DotnetAccountingVoucherDto,
  type DotnetExpenseDto,
} from "@/lib/api/accounting-api"
import type { CreateExpenseInput } from "@/features/expenses/api-client"

const dto: DotnetExpenseDto = {
  id: "22222222-2222-2222-2222-222222222222",
  expenseDateUtc: "2026-03-14T00:00:00Z",
  category: "rent",
  amount: 15000,
  paymentMethod: "bank",
  description: "March rent",
  recordedBy: "manager@example.com",
  createdAtUtc: "2026-03-14T06:30:00Z",
  branchId: null,
}

const input: CreateExpenseInput = {
  category: "utilities",
  description: "Power bill",
  amount: 4200.5,
  expense_date: "2026-03-14",
  payment_method: "cash",
  receipt_reference: null,
}

describe("buildExpenseListPath", () => {
  it("builds the bare path when no filters are given", () => {
    expect(buildExpenseListPath()).toBe("/accounting/expenses")
  })

  it("maps the date range to UTC instants, with the end date inclusive of the whole day", () => {
    const path = buildExpenseListPath({ from: "2026-03-01", to: "2026-03-31" })
    const params = new URLSearchParams(path.split("?")[1])
    expect(params.get("dateFromUtc")).toBe("2026-03-01T00:00:00Z")
    expect(params.get("dateToUtc")).toBe("2026-03-31T23:59:59.999Z")
  })

  it("maps page and limit to pageNumber and pageSize and omits the 'all' category", () => {
    const params = new URLSearchParams(buildExpenseListPath({ category: "all", page: 2, limit: 25 }).split("?")[1])
    expect(params.has("category")).toBe(false)
    expect(params.get("pageNumber")).toBe("2")
    expect(params.get("pageSize")).toBe("25")
  })

  it("passes a specific category through", () => {
    expect(buildExpenseListPath({ category: "rent" })).toContain("category=rent")
  })

  it("rejects a malformed date rather than sending it", () => {
    expect(() => buildExpenseListPath({ from: "01/03/2026" })).toThrow(/yyyy-mm-dd/)
  })
})

describe("toExpense", () => {
  it("maps an ExpenseDto to the legacy row, taking the date part of the UTC instant", () => {
    expect(toExpense(dto)).toEqual({
      id: dto.id,
      tenant_id: "",
      branch_id: null,
      category: "rent",
      description: "March rent",
      amount: 15000,
      expense_date: "2026-03-14",
      payment_method: "bank",
      receipt_reference: null,
      created_by: "manager@example.com",
      created_at: "2026-03-14T06:30:00Z",
    })
  })

  it("returns a null payment method for an unknown value and a null created_by for an empty recorder", () => {
    const row = toExpense({ ...dto, paymentMethod: "crypto", recordedBy: "" })
    expect(row.payment_method).toBeNull()
    expect(row.created_by).toBeNull()
  })

  it("keeps the branch id when the .NET row carries one", () => {
    expect(toExpense({ ...dto, branchId: "33333333-3333-3333-3333-333333333333" }).branch_id).toBe(
      "33333333-3333-3333-3333-333333333333",
    )
  })
})

describe("canRecordExpenseOnDotnet", () => {
  it("accepts an input with a payment method and no receipt reference", () => {
    expect(canRecordExpenseOnDotnet(input)).toBe(true)
  })

  it("keeps inputs with a receipt reference on the legacy path, since the .NET command drops it", () => {
    expect(canRecordExpenseOnDotnet({ ...input, receipt_reference: "RCPT-9" })).toBe(false)
  })

  it("keeps inputs without a payment method on the legacy path, since the .NET command requires one", () => {
    expect(canRecordExpenseOnDotnet({ ...input, payment_method: null })).toBe(false)
  })
})

describe("buildRecordExpenseBody", () => {
  it("builds the RecordExpenseCommand body with the date as midnight UTC and the amount unchanged", () => {
    expect(buildRecordExpenseBody(input)).toEqual({
      expenseDateUtc: "2026-03-14T00:00:00Z",
      category: "utilities",
      amount: 4200.5,
      paymentMethod: "cash",
      description: "Power bill",
    })
  })

  it("sends a null description when none was given", () => {
    expect(buildRecordExpenseBody({ ...input, description: undefined }).description).toBeNull()
  })

  it("throws on a malformed expense date", () => {
    expect(() => buildRecordExpenseBody({ ...input, expense_date: "2026-3-4" })).toThrow(/expense_date/)
  })

  it("throws when the payment method is missing", () => {
    expect(() => buildRecordExpenseBody({ ...input, payment_method: null })).toThrow(/payment_method/)
  })
})

describe("posting lock", () => {
  it("maps PostingLockDto to the legacy lock_date shape", () => {
    expect(toPostingLock({ lockDate: "2026-02-28", updatedAtUtc: "2026-03-01T00:00:00Z", updatedBy: "x" })).toEqual({
      lock_date: "2026-02-28",
    })
    expect(toPostingLock({ lockDate: null, updatedAtUtc: null, updatedBy: null })).toEqual({ lock_date: null })
  })

  it("builds the SetPostingLockCommand body for a date and for clearing the lock", () => {
    expect(buildSetPostingLockBody("2026-02-28")).toEqual({ lockDate: "2026-02-28" })
    expect(buildSetPostingLockBody(null)).toEqual({ lockDate: null })
  })

  it("rejects a malformed lock date", () => {
    expect(() => buildSetPostingLockBody("28/02/2026")).toThrow(/lock_date/)
  })
})

describe("voucher list mapping", () => {
  it("maps the legacy page window to pageNumber and pageSize, and the 0-based offset to a 1-based page", () => {
    expect(voucherPageFor(100, 0)).toEqual({ pageNumber: 1, pageSize: 100 })
    expect(voucherPageFor(20, 40)).toEqual({ pageNumber: 3, pageSize: 20 })
    expect(voucherPageFor(undefined, undefined)).toEqual({ pageNumber: 1, pageSize: 50 })
  })

  it("refuses an offset that is not a whole number of pages, so the caller stays on the legacy path", () => {
    expect(voucherPageFor(20, 15)).toBeNull()
    expect(voucherPageFor(0, 0)).toBeNull()
    expect(canListVouchersOnDotnet({ limit: 20, offset: 15 })).toBe(false)
  })

  it("accepts the legacy statuses and refuses any other status filter", () => {
    expect(canListVouchersOnDotnet({ status: "posted", limit: 100, offset: 0 })).toBe(true)
    expect(canListVouchersOnDotnet({ status: "pending", limit: 100, offset: 0 })).toBe(false)
  })

  it("builds the SearchVouchers query with inclusive UTC date bounds and the status in .NET casing", () => {
    const path = buildVoucherListPath({
      dateFrom: "2026-03-01",
      dateTo: "2026-03-31",
      status: "posted",
      voucherType: "journal",
      branchId: "b1",
      limit: 100,
      offset: 0,
    })
    const sp = new URLSearchParams(path.split("?")[1])
    expect(path.startsWith("/accounting/vouchers?")).toBe(true)
    expect(sp.get("dateFromUtc")).toBe("2026-03-01T00:00:00Z")
    expect(sp.get("dateToUtc")).toBe("2026-03-31T23:59:59.999Z")
    expect(sp.get("status")).toBe("Posted")
    expect(sp.get("voucherType")).toBe("journal")
    expect(sp.get("branchId")).toBe("b1")
    expect(sp.get("pageNumber")).toBe("1")
    expect(sp.get("pageSize")).toBe("100")
  })

  it("rejects a malformed voucher date rather than sending it", () => {
    expect(() => buildVoucherListPath({ dateFrom: "01/03/2026", limit: 10, offset: 0 })).toThrow(/dateFrom/)
  })
})

describe("voucher row mapping", () => {
  const voucherDto: DotnetAccountingVoucherDto = {
    id: "77777777-7777-7777-7777-777777777777",
    voucherNo: "JV-0042",
    voucherDateUtc: "2026-03-14T00:00:00Z",
    voucherType: "journal",
    source: "manual",
    referenceType: null,
    referenceId: null,
    status: "Posted",
    narration: "Owner drawings",
    createdAtUtc: "2026-03-14T06:00:00Z",
    postedAtUtc: "2026-03-14T06:05:00Z",
    postedBy: "manager@example.com",
    voidReason: null,
    lines: [
      { lineNo: 1, accountId: "a1", accountCode: "3100", accountName: "Capital", description: null, debitAmount: 500, creditAmount: 0 },
      { lineNo: 2, accountId: "a2", accountCode: "1000", accountName: "Cash", description: "Cash out", debitAmount: 0, creditAmount: 500 },
    ],
  }

  it("maps status names to the legacy lower-case values and rejects an unknown one", () => {
    expect(toVoucherStatus("Draft")).toBe("draft")
    expect(toVoucherStatus("Posted")).toBe("posted")
    expect(toVoucherStatus("Void")).toBe("void")
    expect(() => toVoucherStatus("Pending")).toThrow(/Unknown voucher status/)
  })

  it("maps the voucher header and derives totals and line count from its lines", () => {
    expect(toVoucherRow(voucherDto)).toEqual({
      id: voucherDto.id,
      voucher_no: "JV-0042",
      voucher_date: "2026-03-14",
      voucher_type: "journal",
      source: "manual",
      status: "posted",
      narration: "Owner drawings",
      reference_type: null,
      reference_id: null,
      total_debit: 500,
      total_credit: 500,
      line_count: 2,
    })
  })

  it("maps the detail to { voucher, lines } with the legacy account join and a derived line id", () => {
    const detail = toVoucherDetail(voucherDto)
    expect(detail.voucher.voucher_no).toBe("JV-0042")
    expect(detail.lines[1]).toEqual({
      id: `${voucherDto.id}:2`,
      line_no: 2,
      account_id: "a2",
      description: "Cash out",
      debit_amount: 0,
      credit_amount: 500,
      accounting_accounts: { code: "1000", name: "Cash" },
    })
  })

  it("leaves accounting_accounts null when the line has no account code", () => {
    const detail = toVoucherDetail({ ...voucherDto, lines: [{ ...voucherDto.lines[0], accountCode: null, accountName: null }] })
    expect(detail.lines[0].accounting_accounts).toBeNull()
  })
})

describe("voucher command bodies", () => {
  it("builds CreateManualVoucherCommand with the date as midnight UTC and the amounts unchanged", () => {
    expect(
      buildCreateManualVoucherBody({
        voucher_date: "2026-03-14",
        narration: "Adjust",
        lines: [
          { account_id: "a1", description: "Dr", debit_amount: 250.5, credit_amount: 0 },
          { account_id: "a2", debit_amount: 0, credit_amount: 250.5 },
        ],
      }),
    ).toEqual({
      voucherDateUtc: "2026-03-14T00:00:00Z",
      narration: "Adjust",
      lines: [
        { accountId: "a1", description: "Dr", debitAmount: 250.5, creditAmount: 0 },
        { accountId: "a2", description: null, debitAmount: 0, creditAmount: 250.5 },
      ],
    })
  })

  it("sends a null narration when none was given", () => {
    expect(buildCreateManualVoucherBody({ voucher_date: "2026-03-14", lines: [] }).narration).toBeNull()
  })

  it("rejects a malformed voucher date", () => {
    expect(() => buildCreateManualVoucherBody({ voucher_date: "2026-3-4", lines: [] })).toThrow(/voucher_date/)
  })

  it("sends an empty body for a reversal with no date, and a midnight UTC instant when a date is given", () => {
    expect(buildReverseVoucherBody()).toEqual({})
    expect(buildReverseVoucherBody("2026-03-31")).toEqual({ reversalDateUtc: "2026-03-31T00:00:00Z" })
    expect(() => buildReverseVoucherBody("31-03-2026")).toThrow(/reversal_date/)
  })
})
