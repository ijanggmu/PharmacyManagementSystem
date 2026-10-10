import {
  closeCashShiftOnDotnet,
  getBranchCashSummaryOnDotnet,
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
}
