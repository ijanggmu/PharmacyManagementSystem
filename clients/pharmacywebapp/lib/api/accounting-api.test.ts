import { describe, expect, it } from "vitest"
import {
  buildCreateManualVoucherBody,
  buildExpenseListPath,
  buildRecordExpenseBody,
  buildReverseVoucherBody,
  buildSetPostingLockBody,
  buildUpdateExpenseBody,
  buildUpdateVoucherBody,
  buildVoucherListPath,
  collectAllPages,
  isVoucherStatusFilter,
  normalizeReceiptReference,
  normalizeVoucherPage,
  toExpense,
  toPostingLock,
  toVoucherDetail,
  toVoucherRow,
  toVoucherStatus,
  VOUCHER_STATUS_FILTERS,
  type DotnetAccountingVoucherDto,
  type DotnetExpenseDto,
} from "@/lib/api/accounting-api"
import type { CreateExpenseInput, UpdateExpenseInput } from "@/features/expenses/api-client"

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

  it("maps the date range to Nepal-day UTC instants, with the end date inclusive of the whole day", () => {
    const path = buildExpenseListPath({ from: "2026-03-01", to: "2026-03-31" })
    const params = new URLSearchParams(path.split("?")[1])
    expect(params.get("dateFromUtc")).toBe("2026-02-28T18:15:00.000Z")
    expect(params.get("dateToUtc")).toBe("2026-03-31T18:14:59.999Z")
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

describe("normalizeReceiptReference", () => {
  it("trims, turns blank into null and rejects over-long references", () => {
    expect(normalizeReceiptReference("  RCPT-9 ")).toBe("RCPT-9")
    expect(normalizeReceiptReference("   ")).toBeNull()
    expect(normalizeReceiptReference(undefined)).toBeNull()
    expect(() => normalizeReceiptReference("x".repeat(129))).toThrow(/128/)
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
      receiptReference: null,
    })
  })

  it("sends the receipt reference, trimmed", () => {
    expect(buildRecordExpenseBody({ ...input, receipt_reference: " RCPT-9 " }).receiptReference).toBe("RCPT-9")
  })

  it("sends a null description when none was given", () => {
    expect(buildRecordExpenseBody({ ...input, description: undefined }).description).toBeNull()
  })

  it("throws on a malformed expense date", () => {
    expect(() => buildRecordExpenseBody({ ...input, expense_date: "2026-3-4" })).toThrow(/expense_date/)
  })

  it("throws when the payment method is missing", () => {
    expect(() => buildRecordExpenseBody({ ...input, payment_method: null })).toThrow(/how the expense was paid/)
  })
})

const updateInput: UpdateExpenseInput = {
  category: "utilities",
  description: "Power bill",
  amount: 4200.5,
  payment_method: "cash",
  receipt_reference: null,
}

describe("buildUpdateExpenseBody", () => {
  it("builds UpdateExpenseCommand without a date field", () => {
    expect(buildUpdateExpenseBody(updateInput)).toEqual({
      category: "utilities",
      amount: 4200.5,
      paymentMethod: "cash",
      description: "Power bill",
      receiptReference: null,
    })
    expect(buildUpdateExpenseBody({ ...updateInput, receipt_reference: "B-7" }).receiptReference).toBe("B-7")
  })

  it("sends a null description when none was given", () => {
    expect(buildUpdateExpenseBody({ ...updateInput, description: undefined }).description).toBeNull()
  })

  it("rejects a missing payment method", () => {
    expect(() => buildUpdateExpenseBody({ ...updateInput, payment_method: null })).toThrow(/how the expense was paid/)
  })
})

describe("posting lock", () => {
  it("maps PostingLockDto to the legacy lock_date shape", () => {
    expect(toPostingLock({ lockDate: "2026-02-28", updatedAtUtc: "2026-03-01T00:00:00Z", updatedBy: "x" })).toEqual({
      lock_date: "2026-02-28",
      history: [],
    })
    expect(toPostingLock({ lockDate: null, updatedAtUtc: null, updatedBy: null })).toEqual({ lock_date: null, history: [] })
  })

  it("maps the posting-lock change history, newest first as sent", () => {
    const mapped = toPostingLock({
      lockDate: null,
      updatedAtUtc: "2026-04-02T05:00:00Z",
      updatedBy: "ram",
      history: [
        { fromLockDate: "2026-03-31", toLockDate: null, changedBy: "ram", changedAtUtc: "2026-04-02T05:00:00Z" },
        { fromLockDate: null, toLockDate: "2026-03-31", changedBy: "sita", changedAtUtc: "2026-04-01T05:00:00Z" },
      ],
    })
    expect(mapped.history).toEqual([
      { from_lock_date: "2026-03-31", to_lock_date: null, changed_by: "ram", changed_at: "2026-04-02T05:00:00Z" },
      { from_lock_date: null, to_lock_date: "2026-03-31", changed_by: "sita", changed_at: "2026-04-01T05:00:00Z" },
    ])
  })

  it("builds the SetPostingLockCommand body for a date and for clearing the lock", () => {
    expect(buildSetPostingLockBody("2026-02-28")).toEqual({ lockDate: "2026-02-28" })
    expect(buildSetPostingLockBody(null)).toEqual({ lockDate: null })
  })

  it("rejects a malformed lock date", () => {
    expect(() => buildSetPostingLockBody("28/02/2026")).toThrow(/lock_date/)
  })
})

describe("voucher list paging and query", () => {
  it("normalizes page and pageSize to what the API accepts", () => {
    expect(normalizeVoucherPage(3, 20)).toEqual({ pageNumber: 3, pageSize: 20 })
    expect(normalizeVoucherPage(undefined, undefined)).toEqual({ pageNumber: 1, pageSize: 20 })
    expect(normalizeVoucherPage(0, 0)).toEqual({ pageNumber: 1, pageSize: 1 })
    expect(normalizeVoucherPage(-4, 999)).toEqual({ pageNumber: 1, pageSize: 200 })
    expect(normalizeVoucherPage(2.7, 25.9)).toEqual({ pageNumber: 2, pageSize: 25 })
    expect(normalizeVoucherPage(Number.NaN, Number.NaN)).toEqual({ pageNumber: 1, pageSize: 20 })
  })

  it("knows every status filter the register offers, including reversed/voided/reversal", () => {
    expect([...VOUCHER_STATUS_FILTERS]).toEqual(["posted", "draft", "void", "reversed", "voided", "reversal"])
    expect(isVoucherStatusFilter("reversed")).toBe(true)
    expect(isVoucherStatusFilter("pending")).toBe(false)
  })

  it("builds the SearchVouchers query with every filter, inclusive dates and native paging", () => {
    const path = buildVoucherListPath({
      dateFrom: "2026-03-01",
      dateTo: "2026-03-31",
      status: "reversed",
      voucherType: "journal",
      source: "manual",
      search: "  RV-0  ",
      branchId: "b1",
      page: 4,
      pageSize: 50,
    })
    const sp = new URLSearchParams(path.split("?")[1])
    expect(path.startsWith("/accounting/vouchers?")).toBe(true)
    expect(sp.get("dateFromUtc")).toBe("2026-02-28T18:15:00.000Z")
    expect(sp.get("dateToUtc")).toBe("2026-03-31T18:14:59.999Z")
    expect(sp.get("status")).toBe("reversed")
    expect(sp.get("voucherType")).toBe("journal")
    expect(sp.get("source")).toBe("manual")
    expect(sp.get("search")).toBe("RV-0")
    expect(sp.get("branchId")).toBe("b1")
    expect(sp.get("pageNumber")).toBe("4")
    expect(sp.get("pageSize")).toBe("50")
  })

  it("omits empty filters and defaults to page 1", () => {
    const sp = new URLSearchParams(buildVoucherListPath({ search: "   " }).split("?")[1])
    expect(sp.has("search")).toBe(false)
    expect(sp.has("status")).toBe(false)
    expect(sp.get("pageNumber")).toBe("1")
  })

  it("rejects unknown status/source values and malformed dates rather than sending them", () => {
    expect(() => buildVoucherListPath({ status: "pending" })).toThrow(/status/)
    expect(() => buildVoucherListPath({ source: "imported" })).toThrow(/source/)
    expect(() => buildVoucherListPath({ dateFrom: "01/03/2026" })).toThrow(/dateFrom/)
  })
})

describe("collectAllPages", () => {
  it("walks every page until totalPages", async () => {
    const seen: number[] = []
    const all = await collectAllPages(async (n) => {
      seen.push(n)
      return { items: [`p${n}a`, `p${n}b`], totalPages: 3 }
    })
    expect(seen).toEqual([1, 2, 3])
    expect(all).toEqual(["p1a", "p1b", "p2a", "p2b", "p3a", "p3b"])
  })

  it("stops on an empty page and handles an empty result", async () => {
    expect(await collectAllPages(async () => ({ items: [] as string[], totalPages: 0 }))).toEqual([])
    const all = await collectAllPages(async (n) => ({ items: n === 1 ? ["x"] : [], totalPages: 9 }))
    expect(all).toEqual(["x"])
  })

  it("throws instead of returning a partial set past maxPages", async () => {
    await expect(collectAllPages(async () => ({ items: ["x"], totalPages: 99 }), 2)).rejects.toThrow(/Too many pages/)
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
      posted_at: "2026-03-14T06:05:00Z",
      posted_by: "manager@example.com",
      created_at: "2026-03-14T06:00:00Z",
      void_reason: null,
      branch_id: null,
      reverses_voucher_id: null,
      reverses_voucher_no: null,
      reversed_by_voucher_id: null,
      reversed_by_voucher_no: null,
    })
  })

  it("maps the reversal links both ways", () => {
    const reversal = toVoucherRow({ ...voucherDto, voucherNo: "RV-000009", reversesVoucherId: "orig", reversesVoucherNo: "SV-000001" })
    expect(reversal.reverses_voucher_id).toBe("orig")
    expect(reversal.reverses_voucher_no).toBe("SV-000001")
    const original = toVoucherRow({ ...voucherDto, status: "Void", reversedByVoucherId: "rv", reversedByVoucherNo: "RV-000009" })
    expect(original.status).toBe("void")
    expect(original.reversed_by_voucher_id).toBe("rv")
    expect(original.reversed_by_voucher_no).toBe("RV-000009")
  })

  it("uses the server totals when the list endpoint sends no lines, and lowercases the source", () => {
    const row = toVoucherRow({ ...voucherDto, source: "Manual", lines: [], totalDebit: 74.1, totalCredit: 74.1, lineCount: 4 })
    expect(row.total_debit).toBe(74.1)
    expect(row.total_credit).toBe(74.1)
    expect(row.line_count).toBe(4)
    expect(row.source).toBe("manual")
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

  it("builds UpdateVoucherCommand the same way as CreateManualVoucherCommand", () => {
    const draft = {
      voucher_date: "2026-03-14",
      narration: "Adjust",
      lines: [
        { account_id: "a1", description: "Dr", debit_amount: 250.5, credit_amount: 0 },
        { account_id: "a2", debit_amount: 0, credit_amount: 250.5 },
      ],
    }
    expect(buildUpdateVoucherBody(draft)).toEqual(buildCreateManualVoucherBody(draft))
  })
})
