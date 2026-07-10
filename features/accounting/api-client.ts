import { apiGet, apiGetWithMeta, apiPost, apiPut, getCSRFToken } from "@/lib/api/client-helpers"

function branchQuery(branchId?: string | null) {
  if (!branchId) return ""
  return `&branchId=${encodeURIComponent(branchId)}`
}

export interface AccountingAccount {
  id: string
  code: string
  name: string
  account_type: string
  is_system: boolean
  is_active: boolean
}

export interface AccountingVoucherRow {
  id: string
  voucher_no: string
  voucher_date: string
  voucher_type: string
  source: string
  status: string
  narration: string | null
  reference_type: string | null
  reference_id: string | null
  total_debit?: number
  total_credit?: number
  line_count?: number
}

export interface VoucherLineView {
  id: string
  line_no: number
  account_id: string
  description: string | null
  debit_amount: string | number
  credit_amount: string | number
  accounting_accounts: { code: string; name: string } | null
}

export const accountingApi = {
  getAccounts: () => apiGet<AccountingAccount[]>("/api/accounting/accounts"),
  createAccountHead: async (body: {
    code: string
    name: string
    account_type: "asset" | "liability" | "equity" | "revenue" | "expense"
  }) => {
    const token = await getCSRFToken()
    return apiPost<AccountingAccount>("/api/accounting/accounts", body, token)
  },

  listVouchers: (params: {
    dateFrom?: string
    dateTo?: string
    status?: string
    voucherType?: string
    branchId?: string | null
    limit?: number
    offset?: number
  }) => {
    const sp = new URLSearchParams()
    if (params.dateFrom) sp.set("dateFrom", params.dateFrom)
    if (params.dateTo) sp.set("dateTo", params.dateTo)
    if (params.status) sp.set("status", params.status)
    if (params.voucherType) sp.set("voucherType", params.voucherType)
    if (params.branchId) sp.set("branchId", params.branchId)
    if (params.limit != null) sp.set("limit", String(params.limit))
    if (params.offset != null) sp.set("offset", String(params.offset))
    const q = sp.toString()
    return apiGetWithMeta<AccountingVoucherRow[]>(`/api/accounting/vouchers${q ? `?${q}` : ""}`)
  },

  getVoucher: (id: string) =>
    apiGet<{ voucher: AccountingVoucherRow; lines: VoucherLineView[] }>(`/api/accounting/vouchers/${id}`),

  createManualDraft: async (body: {
    voucher_date: string
    narration?: string | null
    lines: { account_id: string; description?: string | null; debit_amount: number; credit_amount: number }[]
  }) => {
    const token = await getCSRFToken()
    return apiPost<{ id: string; voucher_no: string }>("/api/accounting/vouchers", body, token)
  },

  postVoucher: async (id: string) => {
    const token = await getCSRFToken()
    return apiPost<{ id: string; status: string }>(`/api/accounting/vouchers/${id}/post`, {}, token)
  },

  voidVoucher: async (id: string) => {
    const token = await getCSRFToken()
    return apiPost<{ id: string; status: string }>(`/api/accounting/vouchers/${id}/void`, {}, token)
  },

  generalLedger: (accountId: string, from: string, to: string, branchId?: string | null) =>
    apiGet<{ rows: unknown[]; opening_balance: number }>(
      `/api/accounting/reports/general-ledger?accountId=${encodeURIComponent(accountId)}&from=${encodeURIComponent(from)}&to=${encodeURIComponent(to)}${branchQuery(branchId)}`
    ),

  trialBalance: (from: string, to: string, branchId?: string | null) =>
    apiGet<{ rows: unknown[]; debits_equal_credits: boolean }>(
      `/api/accounting/reports/trial-balance?from=${encodeURIComponent(from)}&to=${encodeURIComponent(to)}${branchQuery(branchId)}`
    ),

  profitAndLoss: (from: string, to: string, branchId?: string | null) =>
    apiGet<{ rows: unknown[]; net_income: number; debits_equal_credits: boolean }>(
      `/api/accounting/reports/profit-loss?from=${encodeURIComponent(from)}&to=${encodeURIComponent(to)}${branchQuery(branchId)}`
    ),

  balanceSheet: (asOf: string, branchId?: string | null) =>
    apiGet<{
      assets: unknown[]
      liabilities: unknown[]
      equity: unknown[]
      total_assets: number
      total_liabilities: number
      total_equity: number
      accounting_equation_residual: number
    }>(`/api/accounting/reports/balance-sheet?asOf=${encodeURIComponent(asOf)}${branchQuery(branchId)}`),

  apAging: (asOf: string, branchId?: string | null) =>
    apiGet<{ rows: unknown[] }>(
      `/api/accounting/reports/ap-aging?asOf=${encodeURIComponent(asOf)}${branchQuery(branchId)}`
    ),

  arAging: (asOf: string, branchId?: string | null) =>
    apiGet<{ rows: unknown[] }>(
      `/api/accounting/reports/ar-aging?asOf=${encodeURIComponent(asOf)}${branchQuery(branchId)}`
    ),

  cashMovement: (from: string, to: string, branchId?: string | null) =>
    apiGet<{
      period_from: string
      period_to: string
      branch_id: string | null
      cash_opening: number
      cash_receipts: number
      cash_payments: number
      cash_closing: number
      bank_opening: number
      bank_receipts: number
      bank_payments: number
      bank_closing: number
      lines: Array<{
        voucher_date: string
        voucher_no: string
        voucher_id: string
        account_code: string
        account_name: string
        description: string | null
        debit_amount: number
        credit_amount: number
        reference_type: string | null
      }>
    }>(
      `/api/accounting/reports/cash-movement?from=${encodeURIComponent(from)}&to=${encodeURIComponent(to)}${branchQuery(branchId)}`
    ),

  reverseVoucher: async (id: string, reversal_date?: string) => {
    const token = await getCSRFToken()
    return apiPost<{ reversal_voucher_id: string }>(
      `/api/accounting/vouchers/${id}/reverse`,
      reversal_date ? { reversal_date } : {},
      token
    )
  },

  trialBalanceGrouped: (from: string, to: string, branchId?: string | null) =>
    apiGet<{
      rows: Array<{
        code: string
        name: string
        debit_total: number
        credit_total: number
        balance: number
        is_group: boolean
        children: Array<{ code: string; name: string; debit_total: number; credit_total: number; balance: number }>
      }>
      flat_rows: unknown[]
      debits_equal_credits: boolean
    }>(
      `/api/accounting/reports/trial-balance-grouped?from=${encodeURIComponent(from)}&to=${encodeURIComponent(to)}${branchQuery(branchId)}`
    ),

  vatReturn: (from: string, to: string, branchId?: string | null) =>
    apiGet<{
      period_from: string
      period_to: string
      output_vat_gl: number
      input_vat_gl: number
      net_vat_payable: number
      output_vat_operational: number
      input_vat_operational: number
      gl_vs_operational_output_diff: number
      gl_vs_operational_input_diff: number
      trial_balance_ok: boolean
    }>(
      `/api/accounting/reports/vat-return?from=${encodeURIComponent(from)}&to=${encodeURIComponent(to)}${branchQuery(branchId)}`
    ),

  arGlReconciliation: (asOf: string, branchId?: string | null) =>
    apiGet<{
      as_of: string
      subledger_ar_total: number
      gl_ar_total: number
      difference: number
      trial_balance_ok: boolean
    }>(`/api/accounting/reports/ar-gl-reconciliation?asOf=${encodeURIComponent(asOf)}${branchQuery(branchId)}`),

  apGlReconciliation: (asOf: string, branchId?: string | null) =>
    apiGet<{
      as_of: string
      subledger_ap_total: number
      gl_ap_total: number
      difference: number
      gl_ap_breakdown: Array<{ account_id: string; code: string; name: string; balance: number }>
      trial_balance_ok: boolean
    }>(`/api/accounting/reports/ap-gl-reconciliation?asOf=${encodeURIComponent(asOf)}${branchQuery(branchId)}`),

  inventoryGlReconciliation: (asOf: string, branchId?: string | null) =>
    apiGet<{
      as_of: string
      stock_valuation: number
      gl_inventory_balance: number
      difference: number
      trial_balance_ok: boolean
    }>(`/api/accounting/reports/inventory-gl-reconciliation?asOf=${encodeURIComponent(asOf)}${branchQuery(branchId)}`),

  getPostingLock: () => apiGet<{ lock_date: string | null }>("/api/accounting/posting-lock"),

  setPostingLock: async (lockDate: string | null) => {
    const token = await getCSRFToken()
    return apiPut<{ lock_date: string | null }>("/api/accounting/posting-lock", { lock_date: lockDate }, token)
  },
}
