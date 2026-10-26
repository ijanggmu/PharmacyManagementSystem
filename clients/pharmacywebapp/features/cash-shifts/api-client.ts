import {
  closeCashShiftOnDotnet,
  getBranchCashSummaryOnDotnet,
  getCashShiftSummaryOnDotnet,
  listCashShiftsOnDotnet,
  openCashShiftOnDotnet,
} from "@/lib/api/cash-shifts-api"

export interface CashShift {
  id: string
  tenant_id: string
  branch_id: string
  status: string
  opened_at: string
  closed_at: string | null
  opened_by_user_id: string | null
  closed_by_user_id: string | null
  /** Who opened / closed the drawer, as the server recorded it (printed on the Z-report). */
  opened_by_name?: string | null
  closed_by_name?: string | null
  opening_float_cash: number
  expected_cash_system: number | null
  /** Cash paid out for returns/refunds in the shift window (already subtracted from expected cash). */
  cash_refunds_total?: number
  /** Cash customers paid against their accounts in the shift window (already added to expected cash). */
  cash_receipts_total?: number
  /** Net cash from the doctors' desk in the shift window (already in expected cash; negative when doctors were paid
   * more in cash than fees came in). */
  consultation_cash_total?: number
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
  /** Cash paid out for returns/refunds since the shift opened (already subtracted from expected_in_drawer). */
  cash_refunds_since_open?: number
  /** Cash customers paid on account since the shift opened (already added to expected_in_drawer). */
  cash_receipts_since_open?: number
  /** Net cash from the doctors' desk since the shift opened (already in expected_in_drawer). */
  consultation_cash_since_open?: number
  expected_in_drawer: number
}

export const cashShiftsApi = {
  list: async (q?: { branch_id?: string; status?: string }): Promise<CashShift[]> => listCashShiftsOnDotnet(q),

  open: async (input: {
    branch_id: string
    opening_float_cash: number
    notes_opening?: string | null
  }): Promise<CashShift> => {
    return openCashShiftOnDotnet(input)
  },

  close: async (
    shiftId: string,
    input: { counted_cash_closing: number; notes_closing?: string | null }
  ): Promise<CashShift> => {
    return closeCashShiftOnDotnet(shiftId, input.counted_cash_closing, input.notes_closing)
  },

  branchSummary: async (): Promise<BranchCashSummaryRow[]> => getBranchCashSummaryOnDotnet(),

  summary: (shiftId: string) => getCashShiftSummaryOnDotnet(shiftId),
}
