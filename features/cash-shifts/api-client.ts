import { apiGet, apiPost, getCSRFToken } from "@/lib/api/client-helpers"

export interface CashShift {
  id: string
  tenant_id: string
  branch_id: string
  status: string
  opened_at: string
  closed_at: string | null
  opened_by_user_id: string | null
  closed_by_user_id: string | null
  opening_float_cash: number
  expected_cash_system: number | null
  counted_cash_closing: number | null
  cash_variance: number | null
  notes_opening: string | null
  notes_closing: string | null
}

export interface BranchCashSummaryRow {
  branch_id: string
  branch_name: string
  open_shift_id: string | null
  opening_float: number
  cash_sales_since_open: number
  expected_in_drawer: number
}

function toNum(v: unknown): number {
  const n = Number(v)
  return Number.isFinite(n) ? n : 0
}

function mapShift(row: Record<string, unknown>): CashShift {
  return {
    id: String(row.id),
    tenant_id: String(row.tenant_id),
    branch_id: String(row.branch_id),
    status: String(row.status),
    opened_at: String(row.opened_at),
    closed_at: row.closed_at == null ? null : String(row.closed_at),
    opened_by_user_id: row.opened_by_user_id == null ? null : String(row.opened_by_user_id),
    closed_by_user_id: row.closed_by_user_id == null ? null : String(row.closed_by_user_id),
    opening_float_cash: toNum(row.opening_float_cash),
    expected_cash_system: row.expected_cash_system == null ? null : toNum(row.expected_cash_system),
    counted_cash_closing: row.counted_cash_closing == null ? null : toNum(row.counted_cash_closing),
    cash_variance: row.cash_variance == null ? null : toNum(row.cash_variance),
    notes_opening: row.notes_opening == null ? null : String(row.notes_opening),
    notes_closing: row.notes_closing == null ? null : String(row.notes_closing),
  }
}

export const cashShiftsApi = {
  list: async (q?: { branch_id?: string; status?: string }): Promise<CashShift[]> => {
    const p = new URLSearchParams()
    if (q?.branch_id) p.set("branch_id", q.branch_id)
    if (q?.status) p.set("status", q.status)
    const qs = p.toString()
    const raw = await apiGet<Record<string, unknown>[]>(`/api/cash-shifts${qs ? `?${qs}` : ""}`)
    return (raw ?? []).map((r) => mapShift(r))
  },

  open: async (input: {
    branch_id: string
    opening_float_cash: number
    notes_opening?: string | null
  }): Promise<CashShift> => {
    const token = await getCSRFToken()
    const raw = await apiPost<Record<string, unknown>>(
      "/api/cash-shifts",
      {
        branch_id: input.branch_id,
        opening_float_cash: input.opening_float_cash,
        notes_opening: input.notes_opening ?? undefined,
      },
      token
    )
    return mapShift(raw)
  },

  close: async (
    shiftId: string,
    input: { counted_cash_closing: number; notes_closing?: string | null }
  ): Promise<CashShift> => {
    const token = await getCSRFToken()
    const raw = await apiPost<Record<string, unknown>>(
      `/api/cash-shifts/${encodeURIComponent(shiftId)}/close`,
      {
        counted_cash_closing: input.counted_cash_closing,
        notes_closing: input.notes_closing ?? undefined,
      },
      token
    )
    return mapShift(raw)
  },

  branchSummary: async (): Promise<BranchCashSummaryRow[]> => {
    const raw = await apiGet<BranchCashSummaryRow[]>("/api/cash-shifts/summary")
    return raw ?? []
  },
}
