/**
 * Cash-shift calls on the .NET API (SALES area): list, open, close and the branch drawer summary.
 *
 * Open resolves its branch on the server from the user's current branch, so it first checks that the
 * requested branch is the current one. Closing carries the optional closing notes.
 */

import type { BranchCashSummaryRow, CashShift } from "@/features/cash-shifts/api-client"
import { assertCurrentBranch } from "@/lib/api/bank-reconciliation-api"
import { dotnetClient } from "@/lib/api/dotnet-client"
import type { DotnetPagedResponse } from "@/lib/api/accounting-api"

/** CashShiftDto from Modules.Sales.Contracts. */
export interface DotnetCashShiftDto {
  id: string
  openedAtUtc: string
  openedBy: string
  openingFloat: number
  closedAtUtc: string | null
  closedBy: string | null
  closingCashCounted: number | null
  status: string
  notes: string | null
  /** Notes entered at close (max 1000). */
  closingNotes?: string | null
  /** Branch the till belongs to (one open shift per branch). Absent on older API builds. */
  branchId?: string | null
  /** Expected drawer cash frozen at close; null while open or on shifts closed before it was stored. */
  closingExpectedCash?: number | null
}

/** CashShiftSummaryDto from Modules.Sales.Contracts. */
export interface DotnetCashShiftSummaryDto {
  cashShiftId: string
  openedAtUtc: string
  closedAtUtc: string | null
  status: string
  openingFloat: number
  cashSalesTotal: number
  nonCashSalesTotal: number
  salesCount: number
  /** Cash paid out for returns/refunds during the shift (already subtracted from expectedCash). Absent on older servers. */
  cashRefundsTotal?: number
  /** Cash customers paid on account during the shift (already added to expectedCash). Absent on older servers. */
  cashReceiptsTotal?: number
  /** Sold on customers' accounts during the shift (not in the drawer). Absent on older servers. */
  creditSalesTotal?: number
  /** Net cash from the doctors' desk: consultation fees in cash, less fees given back and doctors paid in cash (already
   * in expectedCash). Absent on older servers. */
  consultationCashTotal?: number
  expectedCash: number
  actualCashCounted: number | null
  variance: number | null
}

export interface CashShiftListFilter {
  branch_id?: string
  status?: string
}

/**
 * Maps CashShiftDto to the legacy CashShift row. Fields the list endpoint does not return are null. The
 * shift's own branch wins; `branchId` (the request's filter) is only a fallback for older API builds.
 */
export function toCashShift(dto: DotnetCashShiftDto, branchId?: string | null): CashShift {
  return {
    id: dto.id,
    tenant_id: "",
    branch_id: dto.branchId ?? branchId ?? "",
    status: dto.status,
    opened_at: dto.openedAtUtc,
    closed_at: dto.closedAtUtc ?? null,
    opened_by_user_id: null,
    closed_by_user_id: null,
    opened_by_name: dto.openedBy || null,
    closed_by_name: dto.closedBy ?? null,
    opening_float_cash: dto.openingFloat,
    expected_cash_system: dto.closingExpectedCash ?? null,
    counted_cash_closing: dto.closingCashCounted ?? null,
    cash_variance:
      dto.closingExpectedCash != null && dto.closingCashCounted != null
        ? Math.round((dto.closingCashCounted - dto.closingExpectedCash) * 100) / 100
        : null,
    notes_opening: dto.notes ?? null,
    notes_closing: dto.closingNotes ?? null,
  }
}

/** Adds the reconciliation figures from CashShiftSummaryDto (expected cash and variance). */
export function applyCashShiftSummary(shift: CashShift, summary: DotnetCashShiftSummaryDto): CashShift {
  return {
    ...shift,
    expected_cash_system: summary.expectedCash,
    cash_refunds_total: summary.cashRefundsTotal ?? 0,
    cash_receipts_total: summary.cashReceiptsTotal ?? 0,
    consultation_cash_total: summary.consultationCashTotal ?? 0,
    cash_variance: summary.variance ?? null,
  }
}

/** Builds the query string for GET /sales/cash-shifts. */
export function buildCashShiftListPath(filter: CashShiftListFilter, pageNumber: number, pageSize = 100): string {
  const p = new URLSearchParams()
  if (filter.branch_id) p.set("branchId", filter.branch_id)
  if (filter.status) p.set("status", filter.status)
  p.set("pageNumber", String(pageNumber))
  p.set("pageSize", String(pageSize))
  return `/sales/cash-shifts?${p.toString()}`
}

/** Builds the CloseCashShiftCommand body. closingNotes is sent only when the operator entered some. */
export function buildCloseCashShiftBody(
  countedCashClosing: number,
  closingNotes?: string | null,
): { closingCashCounted: number; closingNotes?: string } {
  const notes = closingNotes?.trim()
  return notes ? { closingCashCounted: countedCashClosing, closingNotes: notes } : { closingCashCounted: countedCashClosing }
}

/** Lists cash shifts across all pages, matching the legacy unpaged response. */
export async function listCashShiftsOnDotnet(filter: CashShiftListFilter = {}): Promise<CashShift[]> {
  const rows: CashShift[] = []
  for (let pageNumber = 1; ; pageNumber += 1) {
    const page = await dotnetClient.get<DotnetPagedResponse<DotnetCashShiftDto>>(
      buildCashShiftListPath(filter, pageNumber),
    )
    rows.push(...page.items.map((dto) => toCashShift(dto, filter.branch_id)))
    if (pageNumber >= page.totalPages || page.items.length === 0) break
  }
  return rows
}

/**
 * Closes a shift. The close command returns only the id, so the detail and summary are read back.
 * Both reads are best effort: the close has already committed, so a failed read must not surface as
 * a failed close (the caller would then retry a close that already happened).
 */
export async function closeCashShiftOnDotnet(
  shiftId: string,
  countedCashClosing: number,
  closingNotes?: string | null,
): Promise<CashShift> {
  const id = encodeURIComponent(shiftId)
  await dotnetClient.post<string>(`/sales/cash-shifts/${id}/close`, buildCloseCashShiftBody(countedCashClosing, closingNotes))

  let shift: CashShift
  try {
    shift = toCashShift(await dotnetClient.get<DotnetCashShiftDto>(`/sales/cash-shifts/${id}`))
  } catch {
    shift = {
      id: shiftId,
      tenant_id: "",
      branch_id: "",
      status: "closed",
      opened_at: "",
      closed_at: null,
      opened_by_user_id: null,
      closed_by_user_id: null,
      opening_float_cash: 0,
      expected_cash_system: null,
      counted_cash_closing: countedCashClosing,
      cash_variance: null,
      notes_opening: null,
      notes_closing: null,
    }
  }
  try {
    const summary = await dotnetClient.get<DotnetCashShiftSummaryDto>(`/sales/cash-shifts/${id}/summary`)
    return applyCashShiftSummary(shift, summary)
  } catch {
    return shift
  }
}

/** The shift's sales and drawer reconciliation (the Z-report figures). Totals are frozen once the shift closed. */
export async function getCashShiftSummaryOnDotnet(shiftId: string): Promise<DotnetCashShiftSummaryDto> {
  return dotnetClient.get<DotnetCashShiftSummaryDto>(`/sales/cash-shifts/${encodeURIComponent(shiftId)}/summary`)
}

/** BranchCashSummaryDto from Modules.Sales.Contracts. */
export interface DotnetBranchCashSummaryDto {
  branchId: string
  branchName: string
  openShiftId: string
  openingFloat: number
  cashSalesSinceOpen: number
  /** Cash paid out for returns/refunds since the shift opened (already subtracted). Absent on older servers. */
  cashRefundsSinceOpen?: number
  /** Cash customers paid on account since the shift opened (already added). Absent on older servers. */
  cashReceiptsSinceOpen?: number
  /** Net cash from the doctors' desk since the shift opened (already added). Absent on older servers. */
  consultationCashSinceOpen?: number
  expectedInDrawer: number
}

/** Maps BranchCashSummaryDto to the legacy branch cash summary row. */
export function toBranchCashSummaryRow(dto: DotnetBranchCashSummaryDto): BranchCashSummaryRow {
  return {
    branch_id: dto.branchId,
    branch_name: dto.branchName,
    open_shift_id: dto.openShiftId,
    opening_float: dto.openingFloat,
    cash_sales_since_open: dto.cashSalesSinceOpen,
    cash_refunds_since_open: dto.cashRefundsSinceOpen ?? 0,
    cash_receipts_since_open: dto.cashReceiptsSinceOpen ?? 0,
    consultation_cash_since_open: dto.consultationCashSinceOpen ?? 0,
    expected_in_drawer: dto.expectedInDrawer,
  }
}

/** Expected drawer cash for every branch with an open shift. */
export async function getBranchCashSummaryOnDotnet(): Promise<BranchCashSummaryRow[]> {
  const rows = await dotnetClient.get<DotnetBranchCashSummaryDto[]>("/sales/cash-shifts/branch-summary")
  return rows.map(toBranchCashSummaryRow)
}

/** Builds the StartCashShiftCommand body. */
export function buildOpenCashShiftBody(openingFloatCash: number, notesOpening?: string | null): {
  openingFloat: number
  notes: string | null
} {
  return { openingFloat: openingFloatCash, notes: notesOpening?.trim() ? notesOpening.trim() : null }
}

/**
 * Opens a till at the caller's current branch. The command returns only the id, so the shift is read back.
 * If that read fails the open has already committed, so the caller gets the shift as the request described it.
 */
export async function openCashShiftOnDotnet(input: {
  branch_id: string
  opening_float_cash: number
  notes_opening?: string | null
}): Promise<CashShift> {
  await assertCurrentBranch(input.branch_id)
  const id = String(await dotnetClient.post<string>("/sales/cash-shifts", buildOpenCashShiftBody(input.opening_float_cash, input.notes_opening)))
  try {
    return toCashShift(await dotnetClient.get<DotnetCashShiftDto>(`/sales/cash-shifts/${encodeURIComponent(id)}`), input.branch_id)
  } catch {
    return {
      id,
      tenant_id: "",
      branch_id: input.branch_id,
      status: "open",
      opened_at: new Date().toISOString(),
      closed_at: null,
      opened_by_user_id: null,
      closed_by_user_id: null,
      opening_float_cash: input.opening_float_cash,
      expected_cash_system: null,
      counted_cash_closing: null,
      cash_variance: null,
      notes_opening: input.notes_opening ?? null,
      notes_closing: null,
    }
  }
}
