import { dotnetClient } from "@/lib/api/dotnet-client"
import { businessDateInstantUtc, nepalDayEndInclusiveUtc, nepalDayStartUtc, nepalYmdOf } from "@/lib/utils/nepal-time"
import type { ChequeDirection, ChequeFilters, ChequeRow, ChequeStatus } from "@/features/accounting/lib/cheques"

/** ChequeStatusChangeDto. */
interface DotnetChequeStatusChangeDto {
  id: string
  fromStatus: string | null
  toStatus: string
  effectiveDateUtc: string
  changedAtUtc: string
  changedBy: string
  note: string | null
  voucherId: string | null
}

/** ChequeDto. */
export interface DotnetChequeDto {
  id: string
  direction: string
  status: string
  partyId: string
  partyName: string
  bankName: string | null
  chequeNumber: string
  chequeDateUtc: string
  amount: number
  paymentReferenceType: string
  paymentReferenceId: string
  paymentDateUtc: string
  postedToBank: boolean
  bankAccountId: string | null
  depositedDateUtc: string | null
  clearedDateUtc: string | null
  branchId: string | null
  notes: string | null
  createdAtUtc: string
  history?: DotnetChequeStatusChangeDto[] | null
}

interface DotnetPaged<T> {
  items: T[]
  pageNumber: number
  pageSize: number
  totalCount: number
  totalPages: number
}

const day = (utc: string): string => nepalYmdOf(new Date(utc))

/** Maps a register row; every date is the Nepal business day it falls on. Pure (exported for tests). */
export function toChequeRow(dto: DotnetChequeDto): ChequeRow {
  return {
    id: dto.id,
    direction: dto.direction as ChequeDirection,
    status: dto.status as ChequeStatus,
    party_id: dto.partyId,
    party_name: dto.partyName,
    bank_name: dto.bankName,
    cheque_number: dto.chequeNumber,
    cheque_date: day(dto.chequeDateUtc),
    amount: Number(dto.amount),
    payment_reference_type: dto.paymentReferenceType,
    payment_reference_id: dto.paymentReferenceId,
    payment_date: day(dto.paymentDateUtc),
    posted_to_bank: dto.postedToBank,
    bank_account_id: dto.bankAccountId,
    deposited_date: dto.depositedDateUtc ? day(dto.depositedDateUtc) : null,
    cleared_date: dto.clearedDateUtc ? day(dto.clearedDateUtc) : null,
    branch_id: dto.branchId,
    notes: dto.notes,
    history: dto.history
      ? dto.history.map((h) => ({
          id: h.id,
          from_status: (h.fromStatus as ChequeStatus | null) ?? null,
          to_status: h.toStatus as ChequeStatus,
          date: day(h.effectiveDateUtc),
          changed_at: h.changedAtUtc,
          changed_by: h.changedBy,
          note: h.note,
          voucher_id: h.voucherId,
        }))
      : null,
  }
}

/** Query string for GET /accounting/banking/cheques. Pure (exported for tests). */
export function chequeSearchPath(f: ChequeFilters, branchId?: string | null): string {
  const p = new URLSearchParams({ pageNumber: String(f.page), pageSize: String(f.pageSize) })
  if (f.status) p.set("status", f.status)
  if (f.direction) p.set("direction", f.direction)
  if (f.from) p.set("chequeDateFromUtc", nepalDayStartUtc(f.from))
  if (f.to) p.set("chequeDateToUtc", nepalDayEndInclusiveUtc(f.to))
  if (f.dueOnly) p.set("dueOnly", "true")
  if (f.search.trim()) p.set("search", f.search.trim())
  if (branchId) p.set("branchId", branchId)
  return `/accounting/banking/cheques?${p.toString()}`
}

export interface ChequePage {
  rows: ChequeRow[]
  total: number
  totalPages: number
}

export const chequesApi = {
  search: async (filters: ChequeFilters, branchId?: string | null): Promise<ChequePage> => {
    const page = await dotnetClient.get<DotnetPaged<DotnetChequeDto>>(chequeSearchPath(filters, branchId))
    return { rows: page.items.map(toChequeRow), total: page.totalCount, totalPages: page.totalPages }
  },

  get: async (id: string): Promise<ChequeRow> =>
    toChequeRow(await dotnetClient.get<DotnetChequeDto>(`/accounting/banking/cheques/${encodeURIComponent(id)}`)),

  /** Received: deposited (no posting). Issued: presented by the supplier. */
  deposit: async (
    id: string,
    body: { date: string; bank_account_id?: string | null; note?: string | null },
    idempotencyKey: string,
  ): Promise<ChequeRow> =>
    toChequeRow(
      await dotnetClient.post<DotnetChequeDto>(
        `/accounting/banking/cheques/${encodeURIComponent(id)}/deposit`,
        { depositDateUtc: businessDateInstantUtc(body.date), bankAccountId: body.bank_account_id || null, note: body.note?.trim() || null },
        idempotencyKey,
      ),
    ),

  /** Cleared: a post-dated cheque posts its contra voucher dated `date` (refused in a locked period). */
  clear: async (
    id: string,
    body: { date: string; bank_account_id?: string | null; note?: string | null },
    idempotencyKey: string,
  ): Promise<ChequeRow> =>
    toChequeRow(
      await dotnetClient.post<DotnetChequeDto>(
        `/accounting/banking/cheques/${encodeURIComponent(id)}/clear`,
        { clearedDateUtc: businessDateInstantUtc(body.date), bankAccountId: body.bank_account_id || null, note: body.note?.trim() || null },
        idempotencyKey,
      ),
    ),

  /** Bounced: voids the payment the cheque settled (needs the void-payment permission too). */
  bounce: async (id: string, reason: string, idempotencyKey: string): Promise<ChequeRow> =>
    toChequeRow(
      await dotnetClient.post<DotnetChequeDto>(
        `/accounting/banking/cheques/${encodeURIComponent(id)}/bounce`,
        { reason: reason.trim() },
        idempotencyKey,
      ),
    ),

  /** Cancelled before it reached the bank: voids the payment the cheque settled. */
  cancel: async (id: string, reason: string, idempotencyKey: string): Promise<ChequeRow> =>
    toChequeRow(
      await dotnetClient.post<DotnetChequeDto>(
        `/accounting/banking/cheques/${encodeURIComponent(id)}/cancel`,
        { reason: reason.trim() },
        idempotencyKey,
      ),
    ),
}
