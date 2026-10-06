/**
 * Accounting calls that have a .NET equivalent (ACCOUNTING area): posting lock and operating expenses.
 * The feature clients (features/accounting, features/expenses) pick this path when
 * backendTarget("ACCOUNTING") is "dotnet"; the legacy path is unchanged.
 *
 * Vouchers (list, detail, draft create, post, reverse) also run on .NET. Void stays legacy because the
 * .NET void command requires a reason the UI does not collect.
 *
 * Not migrated (no safe .NET equivalent yet): bank deposits (the .NET command has no branch or
 * cash-shift link), bank reconciliation (no .NET list of statement imports), trial balance and
 * grouped trial balance (.NET takes an as-of date, legacy takes a period), profit and loss, balance
 * sheet, cash movement, VAT, aging and GL reconciliation reports, the general ledger (.NET signs the
 * running balance by account type, legacy does not), expense receipt references.
 */

import { dotnetClient } from "@/lib/api/dotnet-client"
import type { CreateExpenseInput, Expense, ExpensesFilters } from "@/features/expenses/api-client"
import type { AccountingVoucherRow, VoucherLineView } from "@/features/accounting/api-client"

/** Shape of PagedResponse<T> from the .NET BuildingBlocks (camelCase JSON). */
export interface DotnetPagedResponse<T> {
  items: T[]
  pageNumber: number
  pageSize: number
  totalCount: number
  totalPages: number
}

/** ExpenseDto from Modules.Accounting.Contracts. */
export interface DotnetExpenseDto {
  id: string
  expenseDateUtc: string
  category: string
  amount: number
  paymentMethod: string
  description: string | null
  recordedBy: string
  createdAtUtc: string
  branchId?: string | null
}

/** PostingLockDto from Modules.Accounting.Contracts. LockDate is a DateOnly ("yyyy-MM-dd") or null. */
export interface DotnetPostingLockDto {
  lockDate: string | null
  updatedAtUtc: string | null
  updatedBy: string | null
}

const DATE_ONLY = /^\d{4}-\d{2}-\d{2}$/
const EXPENSE_PAYMENT_METHODS = ["cash", "bank", "card", "other"] as const

function assertDateOnly(value: string, field: string): void {
  if (!DATE_ONLY.test(value)) throw new Error(`${field} must be a date in yyyy-mm-dd format`)
}

/** Builds the query string for GET /accounting/expenses from the legacy filter shape. */
export function buildExpenseListPath(filters?: ExpensesFilters): string {
  const p = new URLSearchParams()
  if (filters?.from) {
    assertDateOnly(filters.from, "from")
    p.set("dateFromUtc", `${filters.from}T00:00:00Z`)
  }
  if (filters?.to) {
    assertDateOnly(filters.to, "to")
    // The .NET filter is inclusive on the instant, so extend to the end of the day.
    p.set("dateToUtc", `${filters.to}T23:59:59.999Z`)
  }
  if (filters?.category && filters.category !== "all") p.set("category", filters.category)
  if (filters?.page != null) p.set("pageNumber", String(filters.page))
  if (filters?.limit != null) p.set("pageSize", String(filters.limit))
  const q = p.toString()
  return `/accounting/expenses${q ? `?${q}` : ""}`
}

/** Maps an ExpenseDto to the legacy Expense row. Fields the .NET side does not store are null. */
export function toExpense(dto: DotnetExpenseDto): Expense {
  const method = (EXPENSE_PAYMENT_METHODS as readonly string[]).includes(dto.paymentMethod)
    ? (dto.paymentMethod as Expense["payment_method"])
    : null
  return {
    id: dto.id,
    tenant_id: "",
    branch_id: dto.branchId ?? null,
    category: dto.category as Expense["category"],
    description: dto.description ?? null,
    amount: dto.amount,
    expense_date: dto.expenseDateUtc.slice(0, 10),
    payment_method: method,
    receipt_reference: null,
    created_by: dto.recordedBy || null,
    created_at: dto.createdAtUtc,
  }
}

/**
 * True when the legacy create input can be represented by RecordExpenseCommand. The .NET command has no
 * receipt reference and requires a payment method, so those inputs stay on the legacy path.
 */
export function canRecordExpenseOnDotnet(input: CreateExpenseInput): boolean {
  return input.payment_method != null && !input.receipt_reference
}

/** Builds the RecordExpenseCommand body. The legacy date-only value becomes midnight UTC. */
export function buildRecordExpenseBody(input: CreateExpenseInput): {
  expenseDateUtc: string
  category: string
  amount: number
  paymentMethod: string
  description: string | null
} {
  assertDateOnly(input.expense_date, "expense_date")
  if (input.payment_method == null) throw new Error("payment_method is required for the .NET expense path")
  return {
    expenseDateUtc: `${input.expense_date}T00:00:00Z`,
    category: input.category,
    amount: input.amount,
    paymentMethod: input.payment_method,
    description: input.description ?? null,
  }
}

/** Builds the SetPostingLockCommand body. */
export function buildSetPostingLockBody(lockDate: string | null): { lockDate: string | null } {
  if (lockDate !== null) assertDateOnly(lockDate, "lock_date")
  return { lockDate }
}

/** Maps PostingLockDto to the legacy { lock_date } shape. */
export function toPostingLock(dto: DotnetPostingLockDto): { lock_date: string | null } {
  return { lock_date: dto.lockDate ?? null }
}

/** AccountingVoucherLineDto from Modules.Accounting.Contracts. */
export interface DotnetAccountingVoucherLineDto {
  lineNo: number
  accountId: string
  accountCode: string | null
  accountName: string | null
  description: string | null
  debitAmount: number
  creditAmount: number
}

/** AccountingVoucherDto from Modules.Accounting.Contracts. Status is the AccountingVoucherStatus enum name. */
export interface DotnetAccountingVoucherDto {
  id: string
  voucherNo: string
  voucherDateUtc: string
  voucherType: string
  source: string
  referenceType: string | null
  referenceId: string | null
  status: string
  narration: string | null
  createdAtUtc: string
  postedAtUtc: string | null
  postedBy: string | null
  voidReason: string | null
  lines: DotnetAccountingVoucherLineDto[]
  branchId?: string | null
}

const VOUCHER_STATUS_TO_LEGACY: Record<string, AccountingVoucherRow["status"]> = {
  Draft: "draft",
  Posted: "posted",
  Void: "void",
}

const VOUCHER_STATUS_TO_DOTNET: Record<string, string> = {
  draft: "Draft",
  posted: "Posted",
  void: "Void",
}

/** Maps the .NET voucher status to the legacy lower-case value. Unknown values throw rather than guess. */
export function toVoucherStatus(status: string): AccountingVoucherRow["status"] {
  const mapped = VOUCHER_STATUS_TO_LEGACY[status]
  if (!mapped) throw new Error(`Unknown voucher status from .NET API: ${status}`)
  return mapped
}

/**
 * Converts the legacy page/limit/offset window into .NET pageNumber/pageSize. Returns null when the
 * offset is not a whole number of pages, since .NET cannot express that window, so the caller stays legacy.
 */
export function voucherPageFor(limit?: number, offset?: number): { pageNumber: number; pageSize: number } | null {
  const pageSize = limit ?? 50
  const skip = offset ?? 0
  if (!Number.isInteger(pageSize) || pageSize <= 0 || !Number.isInteger(skip) || skip < 0) return null
  if (skip % pageSize !== 0) return null
  return { pageNumber: skip / pageSize + 1, pageSize }
}

export interface VoucherListParams {
  dateFrom?: string
  dateTo?: string
  status?: string
  voucherType?: string
  branchId?: string | null
  limit?: number
  offset?: number
}

/** True when the legacy voucher list filters can all be expressed by SearchVouchersQuery. */
export function canListVouchersOnDotnet(params: VoucherListParams): boolean {
  if (params.status && !VOUCHER_STATUS_TO_DOTNET[params.status]) return false
  return voucherPageFor(params.limit, params.offset) !== null
}

/** Builds the GET /accounting/vouchers query. The date range is inclusive of the whole end day. */
export function buildVoucherListPath(params: VoucherListParams): string {
  const p = new URLSearchParams()
  if (params.dateFrom) {
    assertDateOnly(params.dateFrom, "dateFrom")
    p.set("dateFromUtc", `${params.dateFrom}T00:00:00Z`)
  }
  if (params.dateTo) {
    assertDateOnly(params.dateTo, "dateTo")
    p.set("dateToUtc", `${params.dateTo}T23:59:59.999Z`)
  }
  if (params.status) {
    const status = VOUCHER_STATUS_TO_DOTNET[params.status]
    if (!status) throw new Error(`Unsupported voucher status filter: ${params.status}`)
    p.set("status", status)
  }
  if (params.voucherType) p.set("voucherType", params.voucherType)
  if (params.branchId) p.set("branchId", params.branchId)
  const page = voucherPageFor(params.limit, params.offset)
  if (!page) throw new Error("Voucher page window cannot be expressed as pageNumber/pageSize")
  p.set("pageNumber", String(page.pageNumber))
  p.set("pageSize", String(page.pageSize))
  return `/accounting/vouchers?${p.toString()}`
}

/** Maps an AccountingVoucherDto to the legacy voucher row, with totals and line count derived from its lines. */
export function toVoucherRow(dto: DotnetAccountingVoucherDto): AccountingVoucherRow {
  return {
    id: dto.id,
    voucher_no: dto.voucherNo,
    voucher_date: dto.voucherDateUtc.slice(0, 10),
    voucher_type: dto.voucherType,
    source: dto.source,
    status: toVoucherStatus(dto.status),
    narration: dto.narration ?? null,
    reference_type: dto.referenceType ?? null,
    reference_id: dto.referenceId ?? null,
    total_debit: dto.lines.reduce((sum, l) => sum + l.debitAmount, 0),
    total_credit: dto.lines.reduce((sum, l) => sum + l.creditAmount, 0),
    line_count: dto.lines.length,
  }
}

/**
 * Maps a voucher and its lines to the legacy { voucher, lines } detail. .NET lines have no id, so one is
 * derived from the voucher id and line number; it is only used as a row key.
 */
export function toVoucherDetail(dto: DotnetAccountingVoucherDto): { voucher: AccountingVoucherRow; lines: VoucherLineView[] } {
  return {
    voucher: toVoucherRow(dto),
    lines: dto.lines.map((line) => ({
      id: `${dto.id}:${line.lineNo}`,
      line_no: line.lineNo,
      account_id: line.accountId,
      description: line.description ?? null,
      debit_amount: line.debitAmount,
      credit_amount: line.creditAmount,
      accounting_accounts: line.accountCode ? { code: line.accountCode, name: line.accountName ?? "" } : null,
    })),
  }
}

export interface CreateManualDraftInput {
  voucher_date: string
  narration?: string | null
  lines: { account_id: string; description?: string | null; debit_amount: number; credit_amount: number }[]
}

/** Builds the CreateManualVoucherCommand body. The legacy date-only value becomes midnight UTC. */
export function buildCreateManualVoucherBody(input: CreateManualDraftInput): {
  voucherDateUtc: string
  narration: string | null
  lines: { accountId: string; description: string | null; debitAmount: number; creditAmount: number }[]
} {
  assertDateOnly(input.voucher_date, "voucher_date")
  return {
    voucherDateUtc: `${input.voucher_date}T00:00:00Z`,
    narration: input.narration ?? null,
    lines: input.lines.map((line) => ({
      accountId: line.account_id,
      description: line.description ?? null,
      debitAmount: line.debit_amount,
      creditAmount: line.credit_amount,
    })),
  }
}

/** Builds the ReverseVoucherCommand body. Without a reversal date the body is empty, as the legacy call sends. */
export function buildReverseVoucherBody(reversalDate?: string): { reversalDateUtc?: string } {
  if (!reversalDate) return {}
  assertDateOnly(reversalDate, "reversal_date")
  return { reversalDateUtc: `${reversalDate}T00:00:00Z` }
}

/** Accounting calls on the .NET path. The feature clients choose between these and the legacy calls. */
export const dotnetAccountingApi = {
  async listExpenses(filters?: ExpensesFilters): Promise<{ data: Expense[]; total: number; error: null }> {
    const page = await dotnetClient.get<DotnetPagedResponse<DotnetExpenseDto>>(buildExpenseListPath(filters))
    return { data: page.items.map(toExpense), total: page.totalCount, error: null }
  },

  /**
   * Records an expense. RecordExpense returns only the new id, so the row is built from the request.
   * Caller must check canRecordExpenseOnDotnet first.
   */
  async recordExpense(input: CreateExpenseInput): Promise<{ data: Expense; error: null }> {
    const id = await dotnetClient.post<string>("/accounting/expenses", buildRecordExpenseBody(input))
    return {
      data: {
        id: String(id),
        tenant_id: "",
        branch_id: null,
        category: input.category,
        description: input.description ?? null,
        amount: input.amount,
        expense_date: input.expense_date,
        payment_method: input.payment_method ?? null,
        receipt_reference: null,
        created_by: null,
        created_at: new Date().toISOString(),
      },
      error: null,
    }
  },

  async deleteExpense(id: string): Promise<{ error: null }> {
    await dotnetClient.delete(`/accounting/expenses/${encodeURIComponent(id)}`)
    return { error: null }
  },

  async getPostingLock(): Promise<{ lock_date: string | null }> {
    return toPostingLock(await dotnetClient.get<DotnetPostingLockDto>("/accounting/posting-lock"))
  },

  async setPostingLock(lockDate: string | null): Promise<{ lock_date: string | null }> {
    const dto = await dotnetClient.put<DotnetPostingLockDto>(
      "/accounting/posting-lock",
      buildSetPostingLockBody(lockDate),
    )
    return toPostingLock(dto)
  },

  /** SearchVouchers. Returns the legacy { data, meta } envelope that apiGetWithMeta gives the register. */
  async listVouchers(params: VoucherListParams): Promise<{ data: AccountingVoucherRow[]; meta: { page: number; limit: number; total: number; totalPages: number } }> {
    const page = await dotnetClient.get<DotnetPagedResponse<DotnetAccountingVoucherDto>>(buildVoucherListPath(params))
    return {
      data: page.items.map(toVoucherRow),
      meta: { page: page.pageNumber, limit: page.pageSize, total: page.totalCount, totalPages: page.totalPages },
    }
  },

  async getVoucher(id: string): Promise<{ voucher: AccountingVoucherRow; lines: VoucherLineView[] }> {
    const dto = await dotnetClient.get<DotnetAccountingVoucherDto>(`/accounting/vouchers/${encodeURIComponent(id)}`)
    return toVoucherDetail(dto)
  },

  /**
   * Creates a draft. CreateManualVoucher returns only the new id, so voucher_no is read back with one GET.
   * If that read fails the draft still exists, so the create is reported as a success with an empty voucher_no.
   */
  async createManualDraft(input: CreateManualDraftInput): Promise<{ id: string; voucher_no: string }> {
    const id = String(await dotnetClient.post<string>("/accounting/vouchers", buildCreateManualVoucherBody(input)))
    let voucherNo = ""
    try {
      voucherNo = (await dotnetClient.get<DotnetAccountingVoucherDto>(`/accounting/vouchers/${encodeURIComponent(id)}`)).voucherNo
    } catch {
      voucherNo = ""
    }
    return { id, voucher_no: voucherNo }
  },

  async postVoucher(id: string): Promise<{ id: string; status: string }> {
    await dotnetClient.post<string>(`/accounting/vouchers/${encodeURIComponent(id)}/post`, {})
    return { id, status: "posted" }
  },

  async reverseVoucher(id: string, reversalDate?: string): Promise<{ reversal_voucher_id: string }> {
    const reversalId = await dotnetClient.post<string>(
      `/accounting/vouchers/${encodeURIComponent(id)}/reverse`,
      buildReverseVoucherBody(reversalDate),
    )
    return { reversal_voucher_id: String(reversalId) }
  },
}
