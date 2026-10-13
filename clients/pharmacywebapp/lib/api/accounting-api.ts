/**
 * Accounting calls on the .NET API (ACCOUNTING area): posting lock, operating expenses and vouchers.
 */

import { dotnetClient } from "@/lib/api/dotnet-client"
import type { CreateExpenseInput, Expense, ExpensesFilters, UpdateExpenseInput } from "@/features/expenses/api-client"
import type { AccountingVoucherRow, VoucherLineView } from "@/features/accounting/api-client"
import { nepalDayEndInclusiveUtc, nepalDayStartUtc, nepalYmdOf } from "@/lib/utils/nepal-time"

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
  /** Bill / receipt number the expense was paid against. Absent on older API builds. */
  receiptReference?: string | null
  /** Ledger account of the net cost; the fields below are absent on older API builds. */
  expenseAccountId?: string | null
  expenseAccountCode?: string | null
  expenseAccountName?: string | null
  vatAmount?: number
  supplierVatNumber?: string | null
  vendorName?: string | null
  /** Set on a pay-later expense (owed to this supplier). */
  supplierId?: string | null
  /** TDS withheld; absent on older API builds. */
  tdsCategoryCode?: string | null
  tdsCategoryName?: string | null
  tdsRatePercent?: number | null
  tdsAmount?: number
}

/** PostingLockDto from Modules.Accounting.Contracts. LockDate is a DateOnly ("yyyy-MM-dd") or null. */
export interface DotnetPostingLockDto {
  lockDate: string | null
  updatedAtUtc: string | null
  updatedBy: string | null
  /** Recent lock-date changes, newest first. Absent on older API builds. */
  history?: DotnetPostingLockChangeDto[]
}

/** PostingLockChangeDto: one lock-date change (null date = no lock). */
export interface DotnetPostingLockChangeDto {
  fromLockDate: string | null
  toLockDate: string | null
  changedBy: string
  changedAtUtc: string
}

/** One posting-lock change as the UI shows it. */
export interface PostingLockChange {
  from_lock_date: string | null
  to_lock_date: string | null
  changed_by: string
  changed_at: string
}

/** The posting lock as the UI uses it: the current date plus its recent change history (newest first). */
export interface PostingLockState {
  lock_date: string | null
  history: PostingLockChange[]
}

const DATE_ONLY = /^\d{4}-\d{2}-\d{2}$/
const EXPENSE_PAYMENT_METHODS = ["cash", "bank", "card", "other"] as const

function assertDateOnly(value: string, field: string): void {
  if (!DATE_ONLY.test(value)) throw new Error(`${field} must be a date in yyyy-mm-dd format`)
}

/** Builds the query string for GET /accounting/expenses from the legacy filter shape. */
/** SearchExpensesQuery caps pageSize at 200. */
const MAX_EXPENSE_PAGE_SIZE = 200

export function buildExpenseListPath(filters?: ExpensesFilters): string {
  const p = new URLSearchParams()
  if (filters?.from) {
    assertDateOnly(filters.from, "from")
    p.set("dateFromUtc", nepalDayStartUtc(filters.from))
  }
  if (filters?.to) {
    assertDateOnly(filters.to, "to")
    // The .NET filter is inclusive on the instant, so extend to the end of the Nepal day.
    p.set("dateToUtc", nepalDayEndInclusiveUtc(filters.to))
  }
  if (filters?.category && filters.category !== "all") p.set("category", filters.category)
  if (filters?.branchId) p.set("branchId", filters.branchId)
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
    receipt_reference: dto.receiptReference ?? null,
    created_by: dto.recordedBy || null,
    created_at: dto.createdAtUtc,
    expense_account_id: dto.expenseAccountId ?? null,
    expense_account_code: dto.expenseAccountCode ?? null,
    expense_account_name: dto.expenseAccountName ?? null,
    vat_amount: dto.vatAmount ?? 0,
    supplier_vat_number: dto.supplierVatNumber ?? null,
    vendor_name: dto.vendorName ?? null,
    supplier_id: dto.supplierId ?? null,
    tds_category_code: dto.tdsCategoryCode ?? null,
    tds_category_name: dto.tdsCategoryName ?? null,
    tds_rate_percent: dto.tdsRatePercent ?? null,
    tds_amount: dto.tdsAmount ?? 0,
  }
}

const RECEIPT_REFERENCE_MAX = 128

/** Trimmed receipt reference, or null when blank. Longer than the API allows → throws. */
export function normalizeReceiptReference(value: string | null | undefined): string | null {
  const v = (value ?? "").trim()
  if (!v) return null
  if (v.length > RECEIPT_REFERENCE_MAX) throw new Error(`Receipt reference must be ${RECEIPT_REFERENCE_MAX} characters or fewer`)
  return v
}

/** Payment method sent for a pay-later expense; the API credits Accounts Payable and ignores it. */
export const EXPENSE_CREDIT_PAYMENT_METHOD = "credit"

/**
 * Paid now: the payment method picks the voucher's credit account (cash → Cash, anything else → Bank), so the
 * API requires it — a missing method is a form error, not a reason to pick one silently. Pay later (a supplier
 * is set) credits Accounts Payable instead.
 */
function resolvePaymentMethod(input: UpdateExpenseInput): string {
  if (input.supplier_id) return EXPENSE_CREDIT_PAYMENT_METHOD
  if (input.payment_method == null) throw new Error("Choose how the expense was paid (cash, bank, card or other)")
  return input.payment_method
}

function trimmedOrNull(value: string | null | undefined): string | null {
  const v = (value ?? "").trim()
  return v ? v : null
}

/** The account, VAT and settlement fields shared by RecordExpenseCommand and UpdateExpenseCommand. */
export interface ExpenseAccountingBody {
  expenseAccountId: string | null
  vatAmount: number | null
  amountIncludesVat: boolean
  supplierVatNumber: string | null
  vendorName: string | null
  supplierId: string | null
  /** TDS: the category (null = none), its rate and amount (null = worked out by the API). */
  tdsCategory: string | null
  tdsRatePercent: number | null
  tdsAmount: number | null
}

/**
 * Maps the account / VAT / pay-later inputs. An explicit VAT amount wins over "amount includes VAT"; either one
 * makes it a VAT bill, which needs the bill number and (unless owed to a supplier with one on file) the seller's
 * VAT number — checked here so the form can say so before the API does.
 */
export function buildExpenseAccountingBody(input: UpdateExpenseInput): ExpenseAccountingBody {
  const vatAmount = input.vat_amount == null ? null : Math.round(input.vat_amount * 100) / 100
  if (vatAmount != null && (vatAmount < 0 || vatAmount >= input.amount)) {
    throw new Error("VAT must be zero or more and less than the expense amount")
  }
  const includesVat = vatAmount == null && input.amount_includes_vat === true
  const supplierId = trimmedOrNull(input.supplier_id)
  const supplierVatNumber = trimmedOrNull(input.supplier_vat_number)
  if ((vatAmount != null && vatAmount > 0) || includesVat) {
    if (!trimmedOrNull(input.receipt_reference)) throw new Error("Enter the bill number of the VAT bill")
    if (!supplierVatNumber && !supplierId) throw new Error("Enter the seller's VAT / PAN number from the VAT bill")
  }
  return {
    expenseAccountId: trimmedOrNull(input.expense_account_id),
    vatAmount,
    amountIncludesVat: includesVat,
    supplierVatNumber,
    vendorName: trimmedOrNull(input.vendor_name),
    supplierId,
    ...buildExpenseTdsBody(input),
  }
}

/** TDS fields: none without a category; an amount must be positive when given. */
function buildExpenseTdsBody(input: UpdateExpenseInput): Pick<ExpenseAccountingBody, "tdsCategory" | "tdsRatePercent" | "tdsAmount"> {
  const category = trimmedOrNull(input.tds_category)
  if (!category) return { tdsCategory: null, tdsRatePercent: null, tdsAmount: null }
  const amount = input.tds_amount == null ? null : Math.round(input.tds_amount * 100) / 100
  if (amount != null && (amount < 0 || amount > input.amount)) throw new Error("TDS can't be more than the expense amount")
  return { tdsCategory: category, tdsRatePercent: input.tds_rate_percent ?? null, tdsAmount: amount }
}

/** Builds the RecordExpenseCommand body. The legacy date-only value becomes midnight UTC. */
export function buildRecordExpenseBody(input: CreateExpenseInput): {
  expenseDateUtc: string
  category: string
  amount: number
  paymentMethod: string
  description: string | null
  receiptReference: string | null
  dueDateUtc: string | null
} & ExpenseAccountingBody {
  assertDateOnly(input.expense_date, "expense_date")
  return {
    expenseDateUtc: `${input.expense_date}T00:00:00Z`,
    category: input.category,
    amount: input.amount,
    paymentMethod: resolvePaymentMethod(input),
    description: input.description ?? null,
    receiptReference: normalizeReceiptReference(input.receipt_reference),
    // A due date only applies to a pay-later bill owed to a supplier (the API refuses it otherwise).
    dueDateUtc: input.due_date && trimmedOrNull(input.supplier_id) ? `${input.due_date}T00:00:00Z` : null,
    ...buildExpenseAccountingBody(input),
  }
}

/** Builds the UpdateExpenseCommand body (no date — UpdateExpenseCommand cannot move an expense's date). */
export function buildUpdateExpenseBody(input: UpdateExpenseInput): {
  category: string
  amount: number
  paymentMethod: string
  description: string | null
  receiptReference: string | null
} & ExpenseAccountingBody {
  return {
    category: input.category,
    amount: input.amount,
    paymentMethod: resolvePaymentMethod(input),
    description: input.description ?? null,
    receiptReference: normalizeReceiptReference(input.receipt_reference),
    ...buildExpenseAccountingBody(input),
  }
}

/** The row shown right after a record/update call, which returns only the id. VAT from "amount includes VAT"
 * is worked out on the server, so it shows once the list reloads. */
function expenseRowFromInput(id: string, input: UpdateExpenseInput, expenseDate: string): Expense {
  const supplierId = trimmedOrNull(input.supplier_id)
  return {
    id,
    tenant_id: "",
    branch_id: null,
    category: input.category,
    description: input.description ?? null,
    amount: input.amount,
    expense_date: expenseDate,
    payment_method: supplierId ? null : (input.payment_method ?? null),
    receipt_reference: normalizeReceiptReference(input.receipt_reference),
    created_by: null,
    created_at: new Date().toISOString(),
    expense_account_id: trimmedOrNull(input.expense_account_id),
    expense_account_code: null,
    expense_account_name: null,
    vat_amount: input.vat_amount ?? 0,
    supplier_vat_number: trimmedOrNull(input.supplier_vat_number),
    vendor_name: trimmedOrNull(input.vendor_name),
    supplier_id: supplierId,
    tds_category_code: trimmedOrNull(input.tds_category),
    tds_category_name: null,
    tds_rate_percent: input.tds_category ? (input.tds_rate_percent ?? null) : null,
    tds_amount: input.tds_category ? (input.tds_amount ?? 0) : 0,
  }
}

/** Builds the SetPostingLockCommand body. */
export function buildSetPostingLockBody(lockDate: string | null): { lockDate: string | null } {
  if (lockDate !== null) assertDateOnly(lockDate, "lock_date")
  return { lockDate }
}

/** Maps PostingLockDto to the legacy { lock_date } shape plus the change history. */
export function toPostingLock(dto: DotnetPostingLockDto): PostingLockState {
  return {
    lock_date: dto.lockDate ?? null,
    history: (dto.history ?? []).map((h) => ({
      from_lock_date: h.fromLockDate ?? null,
      to_lock_date: h.toLockDate ?? null,
      changed_by: h.changedBy,
      changed_at: h.changedAtUtc,
    })),
  }
}

/** FiscalYearStatusDto from Modules.Accounting.Contracts. Dates are DateOnly ("yyyy-MM-dd", Nepal calendar days in AD). */
export interface DotnetFiscalYearStatusDto {
  fiscalYear: number
  label: string
  startDate: string
  endDate: string
  hasEnded: boolean
  isClosed: boolean
  closedAtUtc: string | null
  closedBy: string | null
  netProfit: number | null
  closingVoucherNos: string[]
}

/** FiscalYearCloseResultDto from Modules.Accounting.Contracts. */
export interface DotnetFiscalYearCloseResultDto {
  fiscalYear: number
  label: string
  endDate: string
  netProfit: number
  closingVoucherIds: string[]
  lockDate: string | null
  closedAtUtc: string
  closedBy: string
}

/** FiscalYearReopenResultDto from Modules.Accounting.Contracts. */
export interface DotnetFiscalYearReopenResultDto {
  fiscalYear: number
  label: string
  reversalVoucherIds: string[]
  lockDate: string | null
}

/** One fiscal year (BS start year, e.g. 2082 for 2082/83) and its year-end close status. */
export interface FiscalYearStatus {
  fiscal_year: number
  label: string
  start_date: string
  end_date: string
  has_ended: boolean
  is_closed: boolean
  closed_at: string | null
  closed_by: string | null
  net_profit: number | null
  closing_voucher_nos: string[]
}

export function toFiscalYearStatus(dto: DotnetFiscalYearStatusDto): FiscalYearStatus {
  return {
    fiscal_year: dto.fiscalYear,
    label: dto.label,
    start_date: dto.startDate,
    end_date: dto.endDate,
    has_ended: dto.hasEnded,
    is_closed: dto.isClosed,
    closed_at: dto.closedAtUtc ?? null,
    closed_by: dto.closedBy ?? null,
    net_profit: dto.netProfit ?? null,
    closing_voucher_nos: dto.closingVoucherNos ?? [],
  }
}

/** Path of a fiscal-year action; the year must be a 4-digit BS start year. */
export function fiscalYearActionPath(fiscalYear: number, action: "close" | "reopen"): string {
  if (!Number.isInteger(fiscalYear) || fiscalYear < 2000 || fiscalYear > 2200) {
    throw new Error("fiscal_year must be a BS start year such as 2082")
  }
  return `/accounting/fiscal-years/${fiscalYear}/${action}`
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
  /** Server-side totals. The list endpoint sends these with an empty `lines` array. */
  totalDebit?: number
  totalCredit?: number
  lineCount?: number
  /** Set on a reversing voucher: the voucher it reverses. */
  reversesVoucherId?: string | null
  reversesVoucherNo?: string | null
  /** Set on a reversed original: the voucher that reverses it. */
  reversedByVoucherId?: string | null
  reversedByVoucherNo?: string | null
}

const VOUCHER_STATUS_TO_LEGACY: Record<string, AccountingVoucherRow["status"]> = {
  Draft: "draft",
  Posted: "posted",
  Void: "void",
}

/** Status filters the register offers; each maps 1:1 to SearchVouchersQuery.Status on the API. */
export const VOUCHER_STATUS_FILTERS = ["posted", "draft", "void", "reversed", "voided", "reversal"] as const
export type VoucherStatusFilter = (typeof VOUCHER_STATUS_FILTERS)[number]

export const VOUCHER_SOURCE_FILTERS = ["manual", "system"] as const
export type VoucherSourceFilter = (typeof VOUCHER_SOURCE_FILTERS)[number]

/** Page sizes the register offers. The API caps pageSize at 200. */
export const VOUCHER_PAGE_SIZES = [10, 20, 50, 100] as const
export const DEFAULT_VOUCHER_PAGE_SIZE = 20
const MAX_VOUCHER_PAGE_SIZE = 200
const MAX_SEARCH_LENGTH = 128

export function isVoucherStatusFilter(value: string | null | undefined): value is VoucherStatusFilter {
  return (VOUCHER_STATUS_FILTERS as readonly string[]).includes(value ?? "")
}

export function isVoucherSourceFilter(value: string | null | undefined): value is VoucherSourceFilter {
  return (VOUCHER_SOURCE_FILTERS as readonly string[]).includes(value ?? "")
}

/** Maps the .NET voucher status to the legacy lower-case value. Unknown values throw rather than guess. */
export function toVoucherStatus(status: string): AccountingVoucherRow["status"] {
  const mapped = VOUCHER_STATUS_TO_LEGACY[status]
  if (!mapped) throw new Error(`Unknown voucher status from .NET API: ${status}`)
  return mapped
}

/** Clamps a requested page/pageSize to what the API accepts: page >= 1, 1 <= pageSize <= 200 (integers). */
export function normalizeVoucherPage(page?: number, pageSize?: number): { pageNumber: number; pageSize: number } {
  const p = page !== undefined && Number.isFinite(page) ? Math.max(1, Math.floor(page)) : 1
  const raw = pageSize !== undefined && Number.isFinite(pageSize) ? Math.floor(pageSize) : DEFAULT_VOUCHER_PAGE_SIZE
  const size = Math.min(MAX_VOUCHER_PAGE_SIZE, Math.max(1, raw))
  return { pageNumber: p, pageSize: size }
}

export interface VoucherListParams {
  dateFrom?: string
  dateTo?: string
  status?: string
  voucherType?: string
  source?: string
  /** Matched server-side against voucher no, narration and reference type. */
  search?: string
  branchId?: string | null
  /** 1-based page number. */
  page?: number
  pageSize?: number
}

/**
 * Builds the GET /accounting/vouchers query. Every filter is sent to the API so paging and totals cover
 * the filtered set. The date range is inclusive of the whole end day. Unknown status/source values throw.
 */
export function buildVoucherListPath(params: VoucherListParams): string {
  const p = new URLSearchParams()
  if (params.dateFrom) {
    assertDateOnly(params.dateFrom, "dateFrom")
    p.set("dateFromUtc", nepalDayStartUtc(params.dateFrom))
  }
  if (params.dateTo) {
    assertDateOnly(params.dateTo, "dateTo")
    p.set("dateToUtc", nepalDayEndInclusiveUtc(params.dateTo))
  }
  if (params.status) {
    if (!isVoucherStatusFilter(params.status)) throw new Error(`Unsupported voucher status filter: ${params.status}`)
    p.set("status", params.status)
  }
  if (params.voucherType) p.set("voucherType", params.voucherType)
  if (params.source) {
    if (!isVoucherSourceFilter(params.source)) throw new Error(`Unsupported voucher source filter: ${params.source}`)
    p.set("source", params.source)
  }
  const search = (params.search ?? "").trim().slice(0, MAX_SEARCH_LENGTH)
  if (search) p.set("search", search)
  if (params.branchId) p.set("branchId", params.branchId)
  const page = normalizeVoucherPage(params.page, params.pageSize)
  p.set("pageNumber", String(page.pageNumber))
  p.set("pageSize", String(page.pageSize))
  return `/accounting/vouchers?${p.toString()}`
}

/**
 * Walks every page of a paged list (page 1, 2, … until totalPages or an empty page) and concatenates the
 * items. `maxPages` guards against a runaway loop; hitting it throws rather than returning a partial set.
 */
export async function collectAllPages<T>(
  fetchPage: (pageNumber: number) => Promise<{ items: T[]; totalPages: number }>,
  maxPages = 500,
): Promise<T[]> {
  const all: T[] = []
  for (let pageNumber = 1; ; pageNumber++) {
    if (pageNumber > maxPages) throw new Error(`Too many pages to load (more than ${maxPages}); narrow the filters.`)
    const page = await fetchPage(pageNumber)
    all.push(...page.items)
    if (page.items.length === 0 || pageNumber >= page.totalPages) break
  }
  return all
}

/**
 * Maps an AccountingVoucherDto to the legacy voucher row. Totals come from the lines when they are present
 * (detail endpoint) and from the server-side totals otherwise (list endpoint, which omits lines).
 */
export function toVoucherRow(dto: DotnetAccountingVoucherDto): AccountingVoucherRow {
  const hasLines = dto.lines.length > 0
  return {
    id: dto.id,
    voucher_no: dto.voucherNo,
    // The Nepal day of the instant: system vouchers carry the real event time, which can be the previous UTC day.
    voucher_date: nepalYmdOf(new Date(dto.voucherDateUtc)),
    voucher_type: dto.voucherType,
    // The API sends the enum name ("Manual"/"System"); the UI compares lowercase.
    source: dto.source.toLowerCase(),
    status: toVoucherStatus(dto.status),
    narration: dto.narration ?? null,
    reference_type: dto.referenceType ?? null,
    reference_id: dto.referenceId ?? null,
    total_debit: hasLines ? dto.lines.reduce((sum, l) => sum + l.debitAmount, 0) : (dto.totalDebit ?? 0),
    total_credit: hasLines ? dto.lines.reduce((sum, l) => sum + l.creditAmount, 0) : (dto.totalCredit ?? 0),
    line_count: hasLines ? dto.lines.length : (dto.lineCount ?? 0),
    posted_at: dto.postedAtUtc ?? null,
    posted_by: dto.postedBy ?? null,
    created_at: dto.createdAtUtc,
    void_reason: dto.voidReason ?? null,
    branch_id: dto.branchId ?? null,
    reverses_voucher_id: dto.reversesVoucherId ?? null,
    reverses_voucher_no: dto.reversesVoucherNo ?? null,
    reversed_by_voucher_id: dto.reversedByVoucherId ?? null,
    reversed_by_voucher_no: dto.reversedByVoucherNo ?? null,
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

/** Builds the UpdateVoucherCommand body. Only a DRAFT voucher can be edited — the API returns 409 otherwise. */
export function buildUpdateVoucherBody(input: CreateManualDraftInput): {
  voucherDateUtc: string
  narration: string | null
  lines: { accountId: string; description: string | null; debitAmount: number; creditAmount: number }[]
} {
  return buildCreateManualVoucherBody(input)
}

/** Accounting calls on the .NET path. The feature clients choose between these and the legacy calls. */
export const dotnetAccountingApi = {
  async listExpenses(filters?: ExpensesFilters): Promise<{ data: Expense[]; total: number; error: null }> {
    const page = await dotnetClient.get<DotnetPagedResponse<DotnetExpenseDto>>(buildExpenseListPath(filters))
    return { data: page.items.map(toExpense), total: page.totalCount, error: null }
  },

  /** Every expense matching the filters (all pages at the API's maximum page size); page/limit are ignored. */
  async listAllExpenses(filters?: Omit<ExpensesFilters, "page" | "limit">): Promise<Expense[]> {
    const dtos = await collectAllPages((pageNumber) =>
      dotnetClient
        .get<DotnetPagedResponse<DotnetExpenseDto>>(buildExpenseListPath({ ...filters, page: pageNumber, limit: MAX_EXPENSE_PAGE_SIZE }))
        .then((page) => ({ items: page.items, totalPages: page.totalPages })),
    )
    return dtos.map(toExpense)
  },

  /** Records an expense. RecordExpense returns only the new id, so the row is built from the request. */
  async recordExpense(input: CreateExpenseInput, idempotencyKey?: string): Promise<{ data: Expense; error: null }> {
    const id = await dotnetClient.post<string>("/accounting/expenses", buildRecordExpenseBody(input), idempotencyKey)
    return { data: expenseRowFromInput(String(id), input, input.expense_date), error: null }
  },

  async deleteExpense(id: string): Promise<{ error: null }> {
    await dotnetClient.delete(`/accounting/expenses/${encodeURIComponent(id)}`)
    return { error: null }
  },

  /**
   * Updates an expense. UpdateExpenseCommand has no date field, so expense_date cannot change on
   * this path. The command returns only the id, so the row is built from the request plus the unchanged date.
   */
  async updateExpense(id: string, input: UpdateExpenseInput, currentExpenseDate: string): Promise<{ data: Expense; error: null }> {
    await dotnetClient.patch<string>(`/accounting/expenses/${encodeURIComponent(id)}`, buildUpdateExpenseBody(input))
    return { data: expenseRowFromInput(id, input, currentExpenseDate), error: null }
  },

  async getPostingLock(): Promise<PostingLockState> {
    return toPostingLock(await dotnetClient.get<DotnetPostingLockDto>("/accounting/posting-lock"))
  },

  async setPostingLock(lockDate: string | null): Promise<PostingLockState> {
    const dto = await dotnetClient.put<DotnetPostingLockDto>(
      "/accounting/posting-lock",
      buildSetPostingLockBody(lockDate),
    )
    return toPostingLock(dto)
  },

  /** Fiscal years from the first with ledger activity to the current one, newest first. */
  async listFiscalYears(): Promise<FiscalYearStatus[]> {
    const dtos = await dotnetClient.get<DotnetFiscalYearStatusDto[]>("/accounting/fiscal-years")
    return dtos.map(toFiscalYearStatus)
  },

  /** Closes a fiscal year: closing vouchers to Retained Earnings, and the posting lock moved to the year end. */
  async closeFiscalYear(fiscalYear: number): Promise<DotnetFiscalYearCloseResultDto> {
    return dotnetClient.post<DotnetFiscalYearCloseResultDto>(fiscalYearActionPath(fiscalYear, "close"), {})
  },

  /** Reopens the latest closed fiscal year by reversing its closing vouchers. The posting lock is unchanged. */
  async reopenFiscalYear(fiscalYear: number): Promise<DotnetFiscalYearReopenResultDto> {
    return dotnetClient.post<DotnetFiscalYearReopenResultDto>(fiscalYearActionPath(fiscalYear, "reopen"), {})
  },

  /** SearchVouchers. Returns the legacy { data, meta } envelope that apiGetWithMeta gives the register. */
  async listVouchers(params: VoucherListParams): Promise<{ data: AccountingVoucherRow[]; meta: { page: number; limit: number; total: number; totalPages: number } }> {
    const page = await dotnetClient.get<DotnetPagedResponse<DotnetAccountingVoucherDto>>(buildVoucherListPath(params))
    return {
      data: page.items.map(toVoucherRow),
      meta: { page: page.pageNumber, limit: page.pageSize, total: page.totalCount, totalPages: page.totalPages },
    }
  },

  /** Every voucher matching the filters (all pages, at the API's maximum page size), for exports. */
  async listAllVouchers(params: Omit<VoucherListParams, "page" | "pageSize">): Promise<AccountingVoucherRow[]> {
    const dtos = await collectAllPages((pageNumber) =>
      dotnetClient
        .get<DotnetPagedResponse<DotnetAccountingVoucherDto>>(
          buildVoucherListPath({ ...params, page: pageNumber, pageSize: MAX_VOUCHER_PAGE_SIZE }),
        )
        .then((page) => ({ items: page.items, totalPages: page.totalPages })),
    )
    return dtos.map(toVoucherRow)
  },

  async getVoucher(id: string): Promise<{ voucher: AccountingVoucherRow; lines: VoucherLineView[] }> {
    const dto = await dotnetClient.get<DotnetAccountingVoucherDto>(`/accounting/vouchers/${encodeURIComponent(id)}`)
    return toVoucherDetail(dto)
  },

  /**
   * Creates a draft. CreateManualVoucher returns only the new id, so voucher_no is read back with one GET.
   * If that read fails the draft still exists, so the create is reported as a success with an empty voucher_no.
   */
  async createManualDraft(input: CreateManualDraftInput, idempotencyKey?: string): Promise<{ id: string; voucher_no: string }> {
    const id = String(await dotnetClient.post<string>("/accounting/vouchers", buildCreateManualVoucherBody(input), idempotencyKey))
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

  /** UpdateVoucherCommand — only a DRAFT voucher can be edited; the API returns 409 for a posted/void one. */
  async updateVoucher(id: string, input: CreateManualDraftInput): Promise<{ id: string }> {
    await dotnetClient.put<string>(`/accounting/vouchers/${encodeURIComponent(id)}`, buildUpdateVoucherBody(input))
    return { id }
  },

  /** DeleteVoucherCommand — only a DRAFT voucher can be deleted; the API returns 409 for a posted/void one. */
  async deleteVoucher(id: string): Promise<{ error: null }> {
    await dotnetClient.delete(`/accounting/vouchers/${encodeURIComponent(id)}`)
    return { error: null }
  },
}
