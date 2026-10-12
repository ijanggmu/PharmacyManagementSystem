import { listBankDeposits, recordBankDeposit, searchBankDeposits, type BankDepositsPage } from "@/lib/api/bank-reconciliation-api"

export interface BankDepositRow {
  id: string
  branch_id: string
  deposit_date: string
  amount: number | string
  reference_note: string | null
  voucher_id: string | null
  cash_shift_id: string | null
  created_at: string
}

export const bankDepositsApi = {
  list: (params?: { branch_id?: string; from?: string; to?: string; limit?: number }): Promise<BankDepositRow[]> =>
    listBankDeposits(params),

  /** Paged variant of `list`, used wherever a page control is shown over the deposits list. */
  search: (params?: {
    branch_id?: string
    from?: string
    to?: string
    page?: number
    limit?: number
  }): Promise<BankDepositsPage> => searchBankDeposits(params),

  record: (body: {
    branch_id: string
    amount: number
    deposit_date: string
    reference_note?: string | null
    cash_shift_id?: string | null
  }, idempotencyKey?: string): Promise<{ deposit_id: string }> => recordBankDeposit(body, idempotencyKey),
}
