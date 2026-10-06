/**
 * Cash-shift calls with a .NET equivalent (SALES area): list and close.
 *
 * Not migrated: open (the .NET StartCashShift command takes no branch, and the BFF forwards no branch
 * context, so a multi-branch tenant could open the till on the wrong branch), branch summary (no .NET
 * equivalent).
 */

import type { CashShift } from "@/features/cash-shifts/api-client"
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
  expectedCash: number
  actualCashCounted: number | null
  variance: number | null
}

export interface CashShiftListFilter {
  branch_id?: string
  status?: string
}

/** Maps CashShiftDto to the legacy CashShift row. Fields the list endpoint does not return are null. */
export function toCashShift(dto: DotnetCashShiftDto, branchId?: string | null): CashShift {
  return {
    id: dto.id,
    tenant_id: "",
    branch_id: branchId ?? "",
    status: dto.status,
    opened_at: dto.openedAtUtc,
    closed_at: dto.closedAtUtc ?? null,
    opened_by_user_id: null,
    closed_by_user_id: null,
    opening_float_cash: dto.openingFloat,
    expected_cash_system: null,
    counted_cash_closing: dto.closingCashCounted ?? null,
    cash_variance: null,
    notes_opening: dto.notes ?? null,
    notes_closing: null,
  }
}

/** Adds the reconciliation figures from CashShiftSummaryDto (expected cash and variance). */
export function applyCashShiftSummary(shift: CashShift, summary: DotnetCashShiftSummaryDto): CashShift {
  return {
    ...shift,
    expected_cash_system: summary.expectedCash,
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

/** Builds the CloseCashShiftCommand body. */
export function buildCloseCashShiftBody(countedCashClosing: number): { closingCashCounted: number } {
  return { closingCashCounted: countedCashClosing }
}

/**
 * True when the legacy close input can be represented by CloseCashShiftCommand. The command has no
 * closing-notes field, so a close that carries notes stays on the legacy path rather than dropping them.
 */
export function canCloseCashShiftOnDotnet(input: { notes_closing?: string | null }): boolean {
  return !input.notes_closing
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
export async function closeCashShiftOnDotnet(shiftId: string, countedCashClosing: number): Promise<CashShift> {
  const id = encodeURIComponent(shiftId)
  await dotnetClient.post<string>(`/sales/cash-shifts/${id}/close`, buildCloseCashShiftBody(countedCashClosing))

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
