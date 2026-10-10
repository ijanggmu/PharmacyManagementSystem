import type { DotnetPagedResponse } from "@/lib/api/accounting-api"
import { dotnetClient } from "@/lib/api/dotnet-client"
import type { OpeningLineInput } from "@/features/accounting/lib/opening-balances"

/** OpeningBalanceLineDto from Modules.Accounting.Contracts. */
export interface OpeningBalanceLine {
  accountId: string
  accountCode: string
  accountName: string
  accountType: string
  debitAmount: number
  creditAmount: number
}

/** OpeningBalanceStateDto: the active opening balances of one branch. */
export interface OpeningBalanceState {
  branchId: string
  isSet: boolean
  /** "yyyy-MM-dd" */
  openingDate: string | null
  voucherId: string | null
  voucherNo: string | null
  totalDebit: number
  totalCredit: number
  equityAdjustmentDebit: number
  equityAdjustmentCredit: number
  equityAccountId: string | null
  equityAccountCode: string
  equityAccountName: string | null
  lines: OpeningBalanceLine[]
  /** Echo back as expectedVersion on Edit/Reset. */
  version: number
  lastChangedAtUtc: string | null
  lastChangedBy: string | null
  postingLockDate: string | null
  /** Posted vouchers from the older onboarding import wizard, already in the ledger. */
  legacyOpeningVoucherCount: number
}

export interface OpeningBalanceChange {
  accountId: string
  accountCode: string
  accountName: string
  beforeDebit: number
  beforeCredit: number
  afterDebit: number
  afterCredit: number
}

export type OpeningBalanceAction = "Set" | "Edit" | "Reset"

export interface OpeningBalanceHistoryEntry {
  id: string
  sequence: number
  action: OpeningBalanceAction
  branchId: string
  openingDate: string | null
  previousOpeningDate: string | null
  postedVoucherId: string | null
  postedVoucherNo: string | null
  reversedVoucherId: string | null
  reversedVoucherNo: string | null
  reversalVoucherId: string | null
  reversalVoucherNo: string | null
  totalDebit: number
  totalCredit: number
  equityAdjustmentDebit: number
  equityAdjustmentCredit: number
  reason: string | null
  performedByUserId: string
  performedByName: string
  performedAtUtc: string
  changes: OpeningBalanceChange[]
}

export interface OpeningBalanceMutationResult {
  historyEntryId: string
  action: OpeningBalanceAction
  version: number
  postedVoucherId: string | null
  reversedVoucherId: string | null
  reversalVoucherId: string | null
}

export interface SetOpeningBalancesInput {
  /** Client-generated; reuse it when retrying the same submission so it posts once. */
  requestId: string
  branchId: string
  openingDate: string
  lines: OpeningLineInput[]
  reason?: string | null
}

export interface EditOpeningBalancesInput extends SetOpeningBalancesInput {
  expectedVersion: number
  reason: string
}

export interface ResetOpeningBalancesInput {
  requestId: string
  branchId: string
  expectedVersion: number
  reason: string
}

const base = "/accounting/opening-balances"

export const openingBalancesApi = {
  get: (branchId: string) => dotnetClient.get<OpeningBalanceState>(`${base}?branchId=${encodeURIComponent(branchId)}`),

  history: (params: { branchId: string; pageNumber: number; pageSize: number }) =>
    dotnetClient.get<DotnetPagedResponse<OpeningBalanceHistoryEntry>>(
      `${base}/history?branchId=${encodeURIComponent(params.branchId)}&pageNumber=${params.pageNumber}&pageSize=${params.pageSize}`,
    ),

  set: (input: SetOpeningBalancesInput) => dotnetClient.post<OpeningBalanceMutationResult>(base, input, input.requestId),

  edit: (input: EditOpeningBalancesInput) => dotnetClient.post<OpeningBalanceMutationResult>(`${base}/edit`, input, input.requestId),

  reset: (input: ResetOpeningBalancesInput) => dotnetClient.post<OpeningBalanceMutationResult>(`${base}/reset`, input, input.requestId),
}
