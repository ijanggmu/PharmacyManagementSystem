import { apiGet, apiPost, getCSRFToken } from "@/lib/api/client-helpers"

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
  list: (params?: { branch_id?: string; from?: string; to?: string; limit?: number }) => {
    const sp = new URLSearchParams()
    if (params?.branch_id) sp.set("branch_id", params.branch_id)
    if (params?.from) sp.set("from", params.from)
    if (params?.to) sp.set("to", params.to)
    if (params?.limit != null) sp.set("limit", String(params.limit))
    const q = sp.toString()
    return apiGet<BankDepositRow[]>(`/api/accounting/bank-deposits${q ? `?${q}` : ""}`)
  },

  record: async (body: {
    branch_id: string
    amount: number
    deposit_date: string
    reference_note?: string | null
    cash_shift_id?: string | null
  }) => {
    const token = await getCSRFToken()
    return apiPost<{ deposit_id: string }>("/api/accounting/bank-deposits", body, token)
  },
}
