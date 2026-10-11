/**
 * Bank reconciliation and bank deposit calls on the .NET API (ACCOUNTING area).
 *
 * A legacy "bank reconciliation" is a bank statement import. The .NET side has the same flow under
 * /accounting/banking/statement-imports. Branch scope is resolved by the server from the user's current
 * branch, so writes that name a branch are checked against /branches/context first.
 */

import { dotnetClient } from "@/lib/api/dotnet-client"
import { assertDateOnly, endOfDayUtc, startOfDayUtc } from "@/lib/api/accounting-reports-api"
import type {
  BankStatementImport,
  BankStatementLine,
  CreateStatementInput,
  LedgerCandidate,
  ReconciliationView,
} from "@/features/accounting/api-client-bank-reconciliation"
import type { BankDepositRow } from "@/features/bank-deposits/api-client"

/** PagedResponse<T> as serialized by the .NET API. */
interface DotnetPaged<T> {
  items: T[]
  pageNumber: number
  pageSize: number
  totalCount: number
  totalPages: number
}

interface DotnetBankStatementImportDto {
  id: string
  accountId: string
  statementLabel: string | null
  periodStartUtc: string
  periodEndUtc: string
  openingBalance: number | null
  closingBalance: number | null
  status: string
  createdBy: string
  createdAtUtc: string
  reconciledBy: string | null
  reconciledAtUtc: string | null
  branchId: string | null
}

interface DotnetBankStatementLineDto {
  id: string
  lineNo: number
  txnDateUtc: string
  description: string | null
  reference: string | null
  debitAmount: number
  creditAmount: number
  status: string
  matchedVoucherLineId: string | null
  matchedAtUtc: string | null
  matchedBy: string | null
  note: string | null
}

interface DotnetLedgerCandidateDto {
  voucherLineId: string
  voucherId: string
  voucherNo: string
  voucherDateUtc: string
  description: string | null
  debitAmount: number
  creditAmount: number
  matched: boolean
}

interface DotnetBankReconciliationSummaryDto {
  statementDebits: number
  statementCredits: number
  statementNet: number
  ledgerDebits: number
  ledgerCredits: number
  ledgerNet: number
  difference: number
  unmatchedStatementLines: number
  unmatchedLedgerLines: number
}

interface DotnetBankStatementImportDetailDto extends DotnetBankStatementImportDto {
  lines: DotnetBankStatementLineDto[]
  ledger: DotnetLedgerCandidateDto[]
  summary: DotnetBankReconciliationSummaryDto
}

interface DotnetBankDepositDto {
  id: string
  depositDateUtc: string
  amount: number
  description: string | null
  recordedBy: string
  createdAtUtc: string
  branchId: string
}

interface DotnetBranchContextDto {
  branches: Array<{ id: string; name: string; code: string; isActive: boolean }>
  currentBranchId: string | null
}

export function errorMessage(e: unknown, fallback = "Request failed"): string {
  return e instanceof Error ? e.message : fallback
}

function lowerStatus(status: string): string {
  return status.toLowerCase()
}

/** Maps a statement import (summary or detail) to the legacy BankStatementImport row. */
export function toStatementImport(dto: DotnetBankStatementImportDto): BankStatementImport {
  return {
    id: dto.id,
    account_id: dto.accountId,
    branch_id: dto.branchId ?? null,
    statement_label: dto.statementLabel ?? null,
    period_start: dto.periodStartUtc.slice(0, 10),
    period_end: dto.periodEndUtc.slice(0, 10),
    opening_balance: dto.openingBalance ?? null,
    closing_balance: dto.closingBalance ?? null,
    status: lowerStatus(dto.status) === "reconciled" ? "reconciled" : "open",
    created_at: dto.createdAtUtc,
    reconciled_at: dto.reconciledAtUtc ?? null,
  }
}

export function toStatementLine(dto: DotnetBankStatementLineDto): BankStatementLine {
  const status = lowerStatus(dto.status)
  return {
    id: dto.id,
    line_no: dto.lineNo,
    txn_date: dto.txnDateUtc.slice(0, 10),
    description: dto.description ?? null,
    reference: dto.reference ?? null,
    debit_amount: dto.debitAmount,
    credit_amount: dto.creditAmount,
    status: status === "matched" || status === "ignored" ? status : "unmatched",
    matched_voucher_line_id: dto.matchedVoucherLineId ?? null,
    note: dto.note ?? null,
  }
}

export function toLedgerCandidate(dto: DotnetLedgerCandidateDto): LedgerCandidate {
  return {
    voucher_line_id: dto.voucherLineId,
    voucher_id: dto.voucherId,
    voucher_no: dto.voucherNo,
    voucher_date: dto.voucherDateUtc.slice(0, 10),
    description: dto.description ?? null,
    debit_amount: dto.debitAmount,
    credit_amount: dto.creditAmount,
    matched: dto.matched,
  }
}

export function toReconciliationView(dto: DotnetBankStatementImportDetailDto): ReconciliationView {
  const s = dto.summary
  return {
    import: toStatementImport(dto),
    lines: dto.lines.map(toStatementLine),
    ledger: dto.ledger.map(toLedgerCandidate),
    summary: {
      statement_debits: s.statementDebits,
      statement_credits: s.statementCredits,
      statement_net: s.statementNet,
      ledger_debits: s.ledgerDebits,
      ledger_credits: s.ledgerCredits,
      ledger_net: s.ledgerNet,
      difference: s.difference,
      unmatched_statement_lines: s.unmatchedStatementLines,
      unmatched_ledger_lines: s.unmatchedLedgerLines,
    },
  }
}

/** Builds the CreateBankStatementImportCommand body. Period end is inclusive of its whole day. */
export function buildCreateStatementBody(input: CreateStatementInput): {
  accountId: string
  statementLabel: string | null
  periodStartUtc: string
  periodEndUtc: string
  openingBalance: number | null
  closingBalance: number | null
  lines: { txnDateUtc: string; description: string | null; reference: string | null; debitAmount: number; creditAmount: number }[]
} {
  assertDateOnly(input.period_start, "period_start")
  assertDateOnly(input.period_end, "period_end")
  return {
    accountId: input.account_id,
    statementLabel: input.statement_label ?? null,
    periodStartUtc: startOfDayUtc(input.period_start),
    periodEndUtc: endOfDayUtc(input.period_end),
    openingBalance: input.opening_balance ?? null,
    closingBalance: input.closing_balance ?? null,
    lines: input.lines.map((l) => {
      assertDateOnly(l.txn_date, "txn_date")
      return {
        txnDateUtc: startOfDayUtc(l.txn_date),
        description: l.description ?? null,
        reference: l.reference ?? null,
        debitAmount: l.debit ?? 0,
        creditAmount: l.credit ?? 0,
      }
    }),
  }
}

/**
 * Throws unless `branchId` is the caller's current branch. The .NET write resolves the branch from the
 * current-branch selection (no X-Branch-Id header is sent), so a mismatch must not post silently elsewhere.
 */
export async function assertCurrentBranch(branchId: string): Promise<void> {
  const ctx = await dotnetClient.get<DotnetBranchContextDto>("/branches/context")
  const target = branchId.toLowerCase()
  const current = ctx.currentBranchId?.toLowerCase() ?? null
  if (current === target) return
  // With no saved selection, a single-branch tenant resolves to its only branch.
  if (current === null && ctx.branches.length === 1 && ctx.branches[0].id.toLowerCase() === target) return
  throw new Error("This branch isn't the one you're working in. Switch to it from the branch menu at the top, then try again.")
}

export async function listStatementImports(
  accountId?: string,
  limit = 50,
): Promise<{ data: BankStatementImport[]; error: string | null }> {
  const result = await searchStatementImports(accountId, 1, limit)
  return { data: result.items, error: result.error }
}

export interface StatementImportsPage {
  items: BankStatementImport[]
  pageNumber: number
  pageSize: number
  totalCount: number
  totalPages: number
  error: string | null
}

/** Paged variant of `listStatementImports`, used wherever a page control is shown over the statements list. */
export async function searchStatementImports(
  accountId?: string,
  page = 1,
  limit = 20,
): Promise<StatementImportsPage> {
  try {
    const p = new URLSearchParams({
      pageNumber: String(Math.max(page, 1)),
      pageSize: String(Math.min(Math.max(limit, 1), 200)),
    })
    if (accountId) p.set("accountId", accountId)
    const result = await dotnetClient.get<DotnetPaged<DotnetBankStatementImportDto>>(`/accounting/banking/statement-imports?${p.toString()}`)
    return {
      items: result.items.map(toStatementImport),
      pageNumber: result.pageNumber,
      pageSize: result.pageSize,
      totalCount: result.totalCount,
      totalPages: result.totalPages,
      error: null,
    }
  } catch (e) {
    return { items: [], pageNumber: 1, pageSize: limit, totalCount: 0, totalPages: 1, error: errorMessage(e) }
  }
}

export async function getStatementImport(id: string): Promise<{ data: ReconciliationView | null; error: string | null }> {
  try {
    const dto = await dotnetClient.get<DotnetBankStatementImportDetailDto>(`/accounting/banking/statement-imports/${encodeURIComponent(id)}`)
    return { data: toReconciliationView(dto), error: null }
  } catch (e) {
    return { data: null, error: errorMessage(e) }
  }
}

export async function createStatementImport(input: CreateStatementInput): Promise<{ data: BankStatementImport | null; error: string | null }> {
  try {
    if (input.branch_id) await assertCurrentBranch(input.branch_id)
    const id = String(await dotnetClient.post<string>("/accounting/banking/statement-imports", buildCreateStatementBody(input)))
    const dto = await dotnetClient.get<DotnetBankStatementImportDetailDto>(`/accounting/banking/statement-imports/${encodeURIComponent(id)}`)
    return { data: toStatementImport(dto), error: null }
  } catch (e) {
    return { data: null, error: errorMessage(e) }
  }
}

export async function autoMatchStatementImport(id: string): Promise<{ matched: number; error: string | null }> {
  try {
    const result = await dotnetClient.post<{ matchedCount: number }>(
      `/accounting/banking/statement-imports/${encodeURIComponent(id)}/auto-match`,
      {},
    )
    return { matched: result.matchedCount, error: null }
  } catch (e) {
    return { matched: 0, error: errorMessage(e) }
  }
}

export async function matchStatementLine(lineId: string, voucherLineId: string): Promise<{ error: string | null }> {
  try {
    await dotnetClient.post(`/accounting/banking/statement-imports/lines/${encodeURIComponent(lineId)}/match`, { voucherLineId })
    return { error: null }
  } catch (e) {
    return { error: errorMessage(e) }
  }
}

export async function unmatchStatementLine(lineId: string): Promise<{ error: string | null }> {
  try {
    await dotnetClient.post(`/accounting/banking/statement-imports/lines/${encodeURIComponent(lineId)}/unmatch`, {})
    return { error: null }
  } catch (e) {
    return { error: errorMessage(e) }
  }
}

export async function ignoreStatementLine(lineId: string, note?: string | null): Promise<{ error: string | null }> {
  try {
    await dotnetClient.post(`/accounting/banking/statement-imports/lines/${encodeURIComponent(lineId)}/ignore`, { note: note ?? null })
    return { error: null }
  } catch (e) {
    return { error: errorMessage(e) }
  }
}

export async function completeStatementImport(id: string): Promise<{ error: string | null }> {
  try {
    await dotnetClient.post(`/accounting/banking/statement-imports/${encodeURIComponent(id)}/complete`, {})
    return { error: null }
  } catch (e) {
    return { error: errorMessage(e) }
  }
}

// ---------------------------------------------------------------------------
// Bank deposits
// ---------------------------------------------------------------------------

export function toBankDepositRow(dto: DotnetBankDepositDto): BankDepositRow {
  return {
    id: dto.id,
    branch_id: dto.branchId,
    deposit_date: dto.depositDateUtc.slice(0, 10),
    amount: dto.amount,
    reference_note: dto.description ?? null,
    // The .NET deposit records neither a posting voucher id nor a cash-shift link.
    voucher_id: null,
    cash_shift_id: null,
    created_at: dto.createdAtUtc,
  }
}

export interface BankDepositsPage {
  items: BankDepositRow[]
  pageNumber: number
  pageSize: number
  totalCount: number
  totalPages: number
}

export async function listBankDeposits(params: {
  branch_id?: string
  from?: string
  to?: string
  limit?: number
} = {}): Promise<BankDepositRow[]> {
  const result = await searchBankDeposits(params)
  return result.items
}

/** Same search as `listBankDeposits`, but returns the full paging envelope so callers can add a page control. */
export async function searchBankDeposits(params: {
  branch_id?: string
  from?: string
  to?: string
  page?: number
  limit?: number
} = {}): Promise<BankDepositsPage> {
  const p = new URLSearchParams({
    pageNumber: String(Math.max(params.page ?? 1, 1)),
    pageSize: String(Math.min(Math.max(params.limit ?? 50, 1), 200)),
  })
  if (params.from) p.set("dateFromUtc", startOfDayUtc(params.from))
  if (params.to) p.set("dateToUtc", endOfDayUtc(params.to))
  if (params.branch_id) p.set("branchId", params.branch_id)
  const page = await dotnetClient.get<DotnetPaged<DotnetBankDepositDto>>(`/accounting/banking/deposits?${p.toString()}`)
  return {
    items: page.items.map(toBankDepositRow),
    pageNumber: page.pageNumber,
    pageSize: page.pageSize,
    totalCount: page.totalCount,
    totalPages: page.totalPages,
  }
}

export async function recordBankDeposit(body: {
  branch_id: string
  amount: number
  deposit_date: string
  reference_note?: string | null
  cash_shift_id?: string | null
}): Promise<{ deposit_id: string }> {
  if (body.cash_shift_id) {
    throw new Error("Linking a bank deposit to a cash shift is not available on the .NET API yet")
  }
  await assertCurrentBranch(body.branch_id)
  const id = await dotnetClient.post<string>("/accounting/banking/deposits", {
    depositDateUtc: startOfDayUtc(body.deposit_date),
    amount: body.amount,
    description: body.reference_note ?? null,
  })
  return { deposit_id: String(id) }
}
