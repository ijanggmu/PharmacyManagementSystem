import { dotnetAccountingApi, type DotnetPagedResponse, type VoucherListParams } from "@/lib/api/accounting-api"
import {
  getApAging,
  getApGlReconciliation,
  getArAging,
  getArGlReconciliation,
  getBalanceSheet,
  getCashMovement,
  getGeneralLedger,
  getGeneralLedgerPage,
  getInventoryGlReconciliation,
  getPeriodTrialBalance,
  getProfitAndLoss,
  getTrialBalance,
  getTrialBalanceGrouped,
  getVatReturn,
  recordVatPayment,
} from "@/lib/api/accounting-reports-api"
import { assertCurrentBranch } from "@/lib/api/bank-reconciliation-api"
import { dotnetClient } from "@/lib/api/dotnet-client"

export interface AccountingAccount {
  id: string
  code: string
  name: string
  account_type: string
  is_system: boolean
  is_active: boolean
  /** Parent group in the chart tree; null only for the five root heads. */
  parent_id: string | null
  /** Group account: rolls up its sub-accounts and never takes voucher lines. */
  has_children: boolean
  /** Some voucher line (draft or posted) references it, so it can't become a group. */
  has_postings: boolean
  /** One of the five system root heads (Assets … Expenses). */
  is_root_head: boolean
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
  posted_at?: string | null
  posted_by?: string | null
  created_at?: string
  void_reason?: string | null
  branch_id?: string | null
  /** On a reversing voucher: the voucher it reverses. */
  reverses_voucher_id?: string | null
  reverses_voucher_no?: string | null
  /** On a reversed original: the voucher that reverses it. */
  reversed_by_voucher_id?: string | null
  reversed_by_voucher_no?: string | null
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

/** AccountingAccountDto from Modules.Accounting.Contracts. */
interface DotnetAccountingAccountDto {
  id: string
  code: string
  name: string
  accountType: string
  isSystem: boolean
  isActive: boolean
  parentId?: string | null
  hasChildren?: boolean
  hasPostings?: boolean
  isRootHead?: boolean
}

export function toAccountingAccount(dto: DotnetAccountingAccountDto): AccountingAccount {
  return {
    id: dto.id,
    code: dto.code,
    name: dto.name,
    account_type: dto.accountType.toLowerCase(),
    is_system: dto.isSystem,
    is_active: dto.isActive,
    parent_id: dto.parentId ?? null,
    has_children: dto.hasChildren ?? false,
    has_postings: dto.hasPostings ?? false,
    is_root_head: dto.isRootHead ?? false,
  }
}

/** Lists every account across pages, matching the legacy unpaged response. */
async function listAllAccounts(): Promise<AccountingAccount[]> {
  const rows: AccountingAccount[] = []
  for (let pageNumber = 1; ; pageNumber += 1) {
    const page = await dotnetClient.get<DotnetPagedResponse<DotnetAccountingAccountDto>>(
      `/accounting/accounts?pageNumber=${pageNumber}&pageSize=500`,
    )
    rows.push(...page.items.map(toAccountingAccount))
    if (pageNumber >= page.totalPages || page.items.length === 0) break
  }
  return rows
}

export const accountingApi = {
  getAccounts: (): Promise<AccountingAccount[]> => listAllAccounts(),

  /** Creates an account under a parent; the server generates its code from the parent and returns the new id. */
  createAccount: async (body: { parentId: string; name: string }): Promise<string> =>
    String(await dotnetClient.post<string>("/accounting/accounts", { parentId: body.parentId, name: body.name })),

  /** The code a new account under this parent would get right now (a preview, not reserved). */
  getNextAccountCode: (parentId: string) =>
    dotnetClient.get<string>(`/accounting/accounts/next-code?parentId=${encodeURIComponent(parentId)}`),

  /** Renames an account. Its code follows its place in the tree and changes only when it moves. */
  renameAccount: (id: string, name: string) =>
    dotnetClient.put<string>(`/accounting/accounts/${encodeURIComponent(id)}`, { accountId: id, name }),

  /** Accounts are never deleted (posted lines reference them), only deactivated. */
  deactivateAccount: (id: string) => dotnetClient.post<string>(`/accounting/accounts/${encodeURIComponent(id)}/deactivate`, {}),

  activateAccount: (id: string) => dotnetClient.post<string>(`/accounting/accounts/${encodeURIComponent(id)}/activate`, {}),

  /**
   * Moves accounts (with their sub-accounts) under another parent in one all-or-nothing change.
   * Non-system accounts get codes regenerated from the new parent. Resolves to how many moved.
   */
  moveAccounts: (accountIds: readonly string[], targetParentId: string) =>
    dotnetClient.post<number>("/accounting/accounts/move", { accountIds: [...accountIds], targetParentId }),

  /** One page of the voucher register; every filter (incl. search and source) is applied by the API. */
  listVouchers: (params: VoucherListParams) => dotnetAccountingApi.listVouchers(params),

  /** Every voucher matching the filters, across all pages (for CSV export). */
  listAllVouchers: (params: Omit<VoucherListParams, "page" | "pageSize">) => dotnetAccountingApi.listAllVouchers(params),

  getVoucher: (id: string) => dotnetAccountingApi.getVoucher(id),

  createManualDraft: (body: {
    voucher_date: string
    narration?: string | null
    lines: { account_id: string; description?: string | null; debit_amount: number; credit_amount: number }[]
  }, idempotencyKey?: string) => dotnetAccountingApi.createManualDraft(body, idempotencyKey),

  /** Edits a DRAFT manual journal voucher (date, narration, lines). 409s if it's already posted/void. */
  editVoucher: (
    id: string,
    body: {
      voucher_date: string
      narration?: string | null
      lines: { account_id: string; description?: string | null; debit_amount: number; credit_amount: number }[]
    },
  ) => dotnetAccountingApi.updateVoucher(id, body),

  /** Deletes a DRAFT manual journal voucher outright. 409s if it's already posted/void. */
  deleteVoucher: (id: string) => dotnetAccountingApi.deleteVoucher(id),

  postVoucher: (id: string) => dotnetAccountingApi.postVoucher(id),

  /** VoidVoucherCommand requires a reason. The legacy call sent none, so a default is used when omitted. */
  voidVoucher: async (id: string, reason?: string | null): Promise<{ id: string; status: string }> => {
    await dotnetClient.post<string>(`/accounting/vouchers/${encodeURIComponent(id)}/void`, {
      reason: reason?.trim() ? reason.trim() : "Voided from the accounting register",
    })
    return { id, status: "void" }
  },

  generalLedger: (accountId: string, from: string, to: string, branchId?: string | null) =>
    getGeneralLedger(accountId, from, to, branchId),

  generalLedgerPage: (
    accountId: string,
    from: string,
    to: string,
    branchId?: string | null,
    pageNumber?: number,
    pageSize?: number,
  ) => getGeneralLedgerPage(accountId, from, to, branchId, pageNumber, pageSize),

  trialBalance: (from: string, to: string, branchId?: string | null) => getTrialBalance(from, to, branchId),

  /** Opening / movement / closing per account for the period, in one API call. */
  periodTrialBalance: (from: string, to: string, branchId?: string | null) => getPeriodTrialBalance(from, to, branchId),

  profitAndLoss: (from: string, to: string, branchId?: string | null) => getProfitAndLoss(from, to, branchId),

  balanceSheet: (asOf: string, branchId?: string | null) => getBalanceSheet(asOf, branchId),

  apAging: (asOf: string, branchId?: string | null) => getApAging(asOf, branchId),

  arAging: (asOf: string, branchId?: string | null) => getArAging(asOf, branchId),

  cashMovement: (from: string, to: string, branchId?: string | null) => getCashMovement(from, to, branchId),

  reverseVoucher: (id: string, reversal_date?: string) => dotnetAccountingApi.reverseVoucher(id, reversal_date),

  trialBalanceGrouped: (from: string, to: string, branchId?: string | null) => getTrialBalanceGrouped(from, to, branchId),

  vatReturn: (from: string, to: string, branchId?: string | null) => getVatReturn(from, to, branchId),

  /**
   * Records a VAT payment for `branch_id`, which must be the branch the API scopes this session to (the
   * voucher is booked there); a stale selection is refused before anything is posted. Pass one
   * idempotency key per submit.
   */
  recordVatPayment: async (body: Parameters<typeof recordVatPayment>[0] & { branch_id: string }, idempotencyKey: string) => {
    await assertCurrentBranch(body.branch_id)
    return recordVatPayment(body, idempotencyKey)
  },

  arGlReconciliation: (asOf: string, branchId?: string | null) => getArGlReconciliation(asOf, branchId),

  apGlReconciliation: (asOf: string, branchId?: string | null) => getApGlReconciliation(asOf, branchId),

  inventoryGlReconciliation: (asOf: string, branchId?: string | null) => getInventoryGlReconciliation(asOf, branchId),

  getPostingLock: () => dotnetAccountingApi.getPostingLock(),

  setPostingLock: (lockDate: string | null) => dotnetAccountingApi.setPostingLock(lockDate),

  listFiscalYears: () => dotnetAccountingApi.listFiscalYears(),

  closeFiscalYear: (fiscalYear: number) => dotnetAccountingApi.closeFiscalYear(fiscalYear),

  reopenFiscalYear: (fiscalYear: number) => dotnetAccountingApi.reopenFiscalYear(fiscalYear),
}
