/**
 * Accounting report reads on the .NET API (ACCOUNTING area).
 *
 * Period figures (trial balance, P&L, cash movement, grouped trial balance) come from one call to the
 * period trial balance (GET /accounting/reports/trial-balance-period), which returns per account the
 * cumulative debit/credit before the period (opening) and the debit/credit inside it (movement), on the
 * same branch scope and ledger rules as the as-of trial balance. Balance sheet figures come from the
 * as-of trial balance.
 *
 * Mapping functions are pure and exported for unit tests. The legacy response shapes are the contract.
 */

import { dotnetClient } from "@/lib/api/dotnet-client"
import { nepalDayEndInclusiveUtc, nepalDayStartUtc } from "@/lib/utils/nepal-time"

/** Legacy control accounts, matching AccountingSystemAccountCodes on the .NET side. */
export const AR_CONTROL_CODE = "1100"
export const AP_CONTROL_CODE = "2000"
export const CASH_CODE = "1000"
export const BANK_CODE = "1010"

const DATE_ONLY = /^\d{4}-\d{2}-\d{2}$/

export function assertDateOnly(value: string, field: string): void {
  if (!DATE_ONLY.test(value)) throw new Error(`${field} must be a date in yyyy-mm-dd format`)
}

/** Start of the Nepal business day (00:00 NPT) as a UTC instant — the inclusive lower bound of a day range. */
export function startOfDayUtc(date: string): string {
  assertDateOnly(date, "date")
  return nepalDayStartUtc(date)
}

/**
 * Last millisecond of the Nepal business day as a UTC instant. The .NET report/list filters compare
 * `<= toUtc`, so this keeps the whole Nepal day inclusive without spilling into the next one.
 */
export function endOfDayUtc(date: string): string {
  assertDateOnly(date, "date")
  return nepalDayEndInclusiveUtc(date)
}

/** The calendar day before a yyyy-mm-dd date, in the same format. */
export function previousDay(date: string): string {
  assertDateOnly(date, "date")
  const d = new Date(`${date}T00:00:00Z`)
  d.setUTCDate(d.getUTCDate() - 1)
  return d.toISOString().slice(0, 10)
}

function round2(n: number): number {
  return Number(n.toFixed(2))
}

function dateOnly(instant: string): string {
  return instant.slice(0, 10)
}

// ---------------------------------------------------------------------------
// .NET DTOs (camelCase JSON)
// ---------------------------------------------------------------------------

/** TrialBalanceLineDto from Modules.Accounting.Contracts. */
export interface DotnetTrialBalanceLineDto {
  accountId: string
  accountCode: string
  accountName: string
  accountType: string
  totalDebit: number
  totalCredit: number
  netBalance: number
}

/** PeriodTrialBalanceLineDto from Modules.Accounting.Contracts. Gross sums of ledger voucher lines. */
export interface DotnetPeriodTrialBalanceLineDto {
  accountId: string
  accountCode: string
  accountName: string
  accountType: string
  /** Lines dated before the period start. */
  openingDebit: number
  openingCredit: number
  /** Lines dated inside the period, including opening-balance vouchers. */
  periodDebit: number
  periodCredit: number
  /** The part of period* booked by opening-balance vouchers (and their reversals) dated inside the period. */
  openingVoucherDebit: number
  openingVoucherCredit: number
}

export interface DotnetPeriodOpeningVoucherDto {
  voucherId: string
  voucherNo: string
  voucherDateUtc: string
  voucherType: string
}

/** PeriodTrialBalanceDto from Modules.Accounting.Contracts. */
export interface DotnetPeriodTrialBalanceDto {
  fromUtc: string
  toUtc: string
  branchId: string | null
  lines: DotnetPeriodTrialBalanceLineDto[]
  openingVouchersInPeriod: DotnetPeriodOpeningVoucherDto[]
}

/** GlReconciliationDto from Modules.Accounting.Contracts (AR, AP and inventory reconciliations). */
export interface DotnetGlReconciliationDto {
  subledgerName: string
  asOfUtc: string
  subledgerTotal: number
  glBalance: number
  variance: number
  /** Branch both sides were filtered to; null = all branches. */
  branchId?: string | null
  /** Moment the subledger figure describes. Later than asOfUtc when the subledger has no history (stock). */
  subledgerAsOfUtc?: string | null
}

/** True when the subledger figure is today's, not as at the requested date (stock valuation has no history). */
export function subledgerIsCurrentOnly(dto: Pick<DotnetGlReconciliationDto, "asOfUtc" | "subledgerAsOfUtc">): boolean {
  if (!dto.subledgerAsOfUtc) return false
  return new Date(dto.subledgerAsOfUtc).getTime() - new Date(dto.asOfUtc).getTime() > 60_000
}

/** CashMovementDto: every cash and bank account combined, netted per voucher. */
export interface DotnetCashMovementDto {
  fromUtc: string
  toUtc: string
  openingBalance: number
  totalInflow: number
  totalOutflow: number
  closingBalance: number
  /** Money moved between the tenant's own cash and bank accounts — neither in nor out. */
  internalTransfers?: number
}

export interface DotnetVatReturnReportDto {
  fromUtc: string
  toUtc: string
  vatCollected: number
  vatRefundedOrAdjusted: number
  netVatPayable: number
  /** Input VAT recoverable on purchases (1150). Absent on older API builds. */
  inputVat?: number
  /** Output VAT net of input VAT. Absent on older API builds. */
  netVatDue?: number
  branchId?: string | null
  /** VAT paid to IRD / set off in the period — informational, not part of the figures. */
  vatSettled?: number
}

export interface DotnetGeneralLedgerLineDto {
  voucherId: string
  voucherNo: string
  voucherDateUtc: string
  narration: string | null
  debitAmount: number
  creditAmount: number
  runningBalance: number
}

/**
 * The .NET general-ledger report pages its detail lines (`PagedResponse<GeneralLedgerLineDto>`), but
 * openingBalance/closingBalance always cover the whole period regardless of which page was requested —
 * see GetGeneralLedgerQueryHandler.
 */
export interface DotnetGeneralLedgerReportDto {
  accountId: string
  accountCode: string
  accountName: string
  accountType: string
  fromUtc: string
  toUtc: string
  openingBalance: number
  lines: {
    items: DotnetGeneralLedgerLineDto[]
    pageNumber: number
    pageSize: number
    totalCount: number
    totalPages: number
  }
  closingBalance: number
}

/** ArAgingReportLineDto from Modules.Customers.Contracts. */
export interface DotnetArAgingReportLineDto {
  customerId: string
  customerName: string
  current: number
  days31To60: number
  days61To90: number
  over90: number
  total: number
}

/** ApAgingReportLineDto from Modules.Suppliers.Contracts. */
export interface DotnetApAgingReportLineDto {
  supplierId: string
  supplierName: string
  current: number
  days31To60: number
  days61To90: number
  over90: number
  total: number
}

/** ReportsOverviewDto from Modules.Accounting.Contracts (KPI aggregate, no row tables). */
export interface DotnetReportsOverviewDto {
  fromUtc: string
  toUtc: string
  generatedAtUtc: string
  saleCount: number
  totalRevenue: number
  totalDiscount: number
  averageSaleAmount: number
  inventoryValuation: number
  totalMedicines: number
  lowStockCount: number
  prescriptionsTotal: number
  prescriptionsPending: number
  prescriptionsPartiallyFilled: number
  prescriptionsFilled: number
  prescriptionsCancelled: number
  trialBalanceTotalDebit: number
  trialBalanceTotalCredit: number
}

// ---------------------------------------------------------------------------
// Trial balance and period activity
// ---------------------------------------------------------------------------

/** One account's balance (as-of) or activity (period), with debit and credit kept separate. */
export interface AccountBalanceRow {
  accountId: string
  code: string
  name: string
  /** Lower-case legacy account type: asset, liability, equity, revenue or expense. */
  accountType: string
  debit: number
  credit: number
}

/** The legacy trial-balance row shape. */
export interface LegacyTrialBalanceRow {
  account_id: string
  code: string
  name: string
  account_type: string
  debit_total: number
  credit_total: number
  balance: number
}

export function toAccountBalanceRow(dto: DotnetTrialBalanceLineDto, debit: number, credit: number): AccountBalanceRow {
  return {
    accountId: dto.accountId,
    code: dto.accountCode,
    name: dto.accountName,
    accountType: dto.accountType.toLowerCase(),
    debit: round2(debit),
    credit: round2(credit),
  }
}

async function fetchTrialBalanceDtos(asOf: string, branchId?: string | null): Promise<DotnetTrialBalanceLineDto[]> {
  const p = new URLSearchParams({ asOfUtc: endOfDayUtc(asOf) })
  if (branchId) p.set("branchId", branchId)
  return dotnetClient.get<DotnetTrialBalanceLineDto[]>(`/accounting/reports/trial-balance?${p.toString()}`)
}

/** Cumulative balances per account as at the end of `asOf`. */
export async function loadAsOfBalances(asOf: string, branchId?: string | null): Promise<AccountBalanceRow[]> {
  const dtos = await fetchTrialBalanceDtos(asOf, branchId)
  return dtos.map((r) => toAccountBalanceRow(r, r.totalDebit, r.totalCredit))
}

/** One account of the period trial balance, with the API's gross sums (see DotnetPeriodTrialBalanceLineDto). */
export interface PeriodTrialBalanceAccount {
  accountId: string
  code: string
  name: string
  /** Lower-case account type: asset, liability, equity, revenue or expense. */
  accountType: string
  openingDebit: number
  openingCredit: number
  periodDebit: number
  periodCredit: number
  openingVoucherDebit: number
  openingVoucherCredit: number
}

export interface PeriodOpeningVoucher {
  id: string
  voucherNo: string
  /** yyyy-mm-dd */
  date: string
  voucherType: string
}

export interface PeriodTrialBalanceData {
  from: string
  to: string
  branchId: string | null
  accounts: PeriodTrialBalanceAccount[]
  /** Opening-balance vouchers (and reversals of them) dated inside the period. */
  openingVouchersInPeriod: PeriodOpeningVoucher[]
}

export function toPeriodTrialBalanceData(dto: DotnetPeriodTrialBalanceDto, from: string, to: string): PeriodTrialBalanceData {
  return {
    from,
    to,
    branchId: dto.branchId ?? null,
    accounts: dto.lines.map((l) => ({
      accountId: l.accountId,
      code: l.accountCode,
      name: l.accountName,
      accountType: l.accountType.toLowerCase(),
      openingDebit: round2(l.openingDebit),
      openingCredit: round2(l.openingCredit),
      periodDebit: round2(l.periodDebit),
      periodCredit: round2(l.periodCredit),
      openingVoucherDebit: round2(l.openingVoucherDebit),
      openingVoucherCredit: round2(l.openingVoucherCredit),
    })),
    openingVouchersInPeriod: (dto.openingVouchersInPeriod ?? []).map((v) => ({
      id: v.voucherId,
      voucherNo: v.voucherNo,
      date: dateOnly(v.voucherDateUtc),
      voucherType: v.voucherType,
    })),
  }
}

/** Query string for the period trial balance; the end date is inclusive of the whole day. */
export function periodTrialBalancePath(from: string, to: string, branchId?: string | null): string {
  const p = new URLSearchParams({ fromUtc: startOfDayUtc(from), toUtc: endOfDayUtc(to) })
  if (branchId) p.set("branchId", branchId)
  return `/accounting/reports/trial-balance-period?${p.toString()}`
}

/** Opening / movement per account for [from, to] in one API call (branch-scoped). */
export async function getPeriodTrialBalance(from: string, to: string, branchId?: string | null): Promise<PeriodTrialBalanceData> {
  const dto = await dotnetClient.get<DotnetPeriodTrialBalanceDto>(periodTrialBalancePath(from, to, branchId))
  return toPeriodTrialBalanceData(dto, from, to)
}

export interface PeriodBalances {
  /** Balances at the end of the day before `from`. */
  opening: AccountBalanceRow[]
  /** Balances at the end of `to`. */
  closing: AccountBalanceRow[]
  /** Activity inside [from, to], per account. */
  activity: AccountBalanceRow[]
}

/** Splits period trial balance accounts into opening, activity and closing rows (gross debit/credit). */
export function toPeriodBalances(data: PeriodTrialBalanceData): PeriodBalances {
  const row = (a: PeriodTrialBalanceAccount, debit: number, credit: number): AccountBalanceRow => ({
    accountId: a.accountId,
    code: a.code,
    name: a.name,
    accountType: a.accountType,
    debit: round2(debit),
    credit: round2(credit),
  })
  return {
    opening: data.accounts.map((a) => row(a, a.openingDebit, a.openingCredit)),
    activity: data.accounts.map((a) => row(a, a.periodDebit, a.periodCredit)),
    closing: data.accounts.map((a) => row(a, a.openingDebit + a.periodDebit, a.openingCredit + a.periodCredit)),
  }
}

/** Period activity per account, from the period trial balance (branch-scoped, one API call). */
export async function loadPeriodBalances(from: string, to: string, branchId?: string | null): Promise<PeriodBalances> {
  return toPeriodBalances(await getPeriodTrialBalance(from, to, branchId))
}

export function sumDebitsAndCredits(rows: AccountBalanceRow[]): { debit: number; credit: number } {
  return {
    debit: round2(rows.reduce((s, r) => s + r.debit, 0)),
    credit: round2(rows.reduce((s, r) => s + r.credit, 0)),
  }
}

export function toLegacyTrialBalanceRow(r: AccountBalanceRow): LegacyTrialBalanceRow {
  return {
    account_id: r.accountId,
    code: r.code,
    name: r.name,
    account_type: r.accountType,
    debit_total: round2(r.debit),
    credit_total: round2(r.credit),
    balance: round2(r.debit - r.credit),
  }
}

export async function getTrialBalance(
  from: string,
  to: string,
  branchId?: string | null,
): Promise<{ rows: LegacyTrialBalanceRow[]; debits_equal_credits: boolean }> {
  const { activity } = await loadPeriodBalances(from, to, branchId)
  const totals = sumDebitsAndCredits(activity)
  return {
    rows: activity.map(toLegacyTrialBalanceRow),
    debits_equal_credits: totals.debit === totals.credit,
  }
}

const GROUP_ORDER = ["asset", "liability", "equity", "revenue", "expense"] as const
const GROUP_LABEL: Record<string, string> = {
  asset: "Assets",
  liability: "Liabilities",
  equity: "Equity",
  revenue: "Revenue",
  expense: "Expenses",
}

export interface GroupedTrialBalanceView {
  rows: Array<{
    code: string
    name: string
    debit_total: number
    credit_total: number
    balance: number
    is_group: boolean
    children: Array<{ code: string; name: string; debit_total: number; credit_total: number; balance: number }>
  }>
  flat_rows: LegacyTrialBalanceRow[]
  debits_equal_credits: boolean
}

/** Groups the period trial balance by account type. The .NET chart has no parent-account hierarchy. */
export async function getTrialBalanceGrouped(
  from: string,
  to: string,
  branchId?: string | null,
): Promise<GroupedTrialBalanceView> {
  const { activity } = await loadPeriodBalances(from, to, branchId)
  const totals = sumDebitsAndCredits(activity)
  const flat = activity.map(toLegacyTrialBalanceRow)
  const rows = GROUP_ORDER.map((type) => {
    const members = flat.filter((r) => r.account_type === type)
    const debit = round2(members.reduce((s, r) => s + r.debit_total, 0))
    const credit = round2(members.reduce((s, r) => s + r.credit_total, 0))
    return {
      code: type,
      name: GROUP_LABEL[type],
      debit_total: debit,
      credit_total: credit,
      balance: round2(debit - credit),
      is_group: true,
      children: members.map((m) => ({
        code: m.code,
        name: m.name,
        debit_total: m.debit_total,
        credit_total: m.credit_total,
        balance: m.balance,
      })),
    }
  }).filter((g) => g.children.length > 0)
  return { rows, flat_rows: flat, debits_equal_credits: totals.debit === totals.credit }
}

// ---------------------------------------------------------------------------
// Profit and loss, balance sheet, cash movement
// ---------------------------------------------------------------------------

export interface ProfitLossLegacyRow {
  account_id: string
  code: string
  name: string
  account_type: string
  amount: number
}

export async function getProfitAndLoss(
  from: string,
  to: string,
  branchId?: string | null,
): Promise<{ rows: ProfitLossLegacyRow[]; net_income: number; debits_equal_credits: boolean; chart_of_accounts_missing: boolean }> {
  const { activity } = await loadPeriodBalances(from, to, branchId)
  const totals = sumDebitsAndCredits(activity)
  let net = 0
  const rows: ProfitLossLegacyRow[] = []
  for (const r of activity) {
    if (r.accountType === "revenue") {
      const amount = round2(r.credit - r.debit)
      rows.push({ account_id: r.accountId, code: r.code, name: r.name, account_type: r.accountType, amount })
      net += amount
    } else if (r.accountType === "expense") {
      const amount = round2(r.debit - r.credit)
      rows.push({ account_id: r.accountId, code: r.code, name: r.name, account_type: r.accountType, amount })
      net -= amount
    }
  }
  return {
    rows,
    net_income: round2(net),
    debits_equal_credits: totals.debit === totals.credit,
    // With no accounts at all, every posting no-ops, so a zero result means "nothing could post".
    chart_of_accounts_missing: activity.length === 0,
  }
}

export interface BalanceSheetLegacyRow {
  account_id: string
  code: string
  name: string
  account_type: string
  balance: number
}

export async function getBalanceSheet(
  asOf: string,
  branchId?: string | null,
): Promise<{
  assets: BalanceSheetLegacyRow[]
  liabilities: BalanceSheetLegacyRow[]
  equity: BalanceSheetLegacyRow[]
  total_assets: number
  total_liabilities: number
  total_equity: number
  accounting_equation_residual: number
}> {
  const rows = await loadAsOfBalances(asOf, branchId)
  const assets: BalanceSheetLegacyRow[] = []
  const liabilities: BalanceSheetLegacyRow[] = []
  const equity: BalanceSheetLegacyRow[] = []
  let currentEarnings = 0
  for (const r of rows) {
    const toRow = (balance: number): BalanceSheetLegacyRow => ({
      account_id: r.accountId,
      code: r.code,
      name: r.name,
      account_type: r.accountType,
      balance: round2(balance),
    })
    if (r.accountType === "asset") assets.push(toRow(r.debit - r.credit))
    else if (r.accountType === "liability") liabilities.push(toRow(r.credit - r.debit))
    else if (r.accountType === "equity") equity.push(toRow(r.credit - r.debit))
    else if (r.accountType === "revenue") currentEarnings += r.credit - r.debit
    else if (r.accountType === "expense") currentEarnings -= r.debit - r.credit
  }
  const totalAssets = round2(assets.reduce((s, r) => s + r.balance, 0))
  const totalLiabilities = round2(liabilities.reduce((s, r) => s + r.balance, 0))
  const totalEquity = round2(equity.reduce((s, r) => s + r.balance, 0))
  // Current earnings (revenue minus expense) stand in for retained earnings, as on the .NET balance check.
  const residual = round2(totalAssets - totalLiabilities - totalEquity - currentEarnings)
  return {
    assets,
    liabilities,
    equity,
    total_assets: totalAssets,
    total_liabilities: totalLiabilities,
    total_equity: totalEquity,
    accounting_equation_residual: residual,
  }
}

export interface CashMovementLegacyLine {
  voucher_date: string
  voucher_no: string
  voucher_id: string
  account_code: string
  account_name: string
  description: string | null
  debit_amount: number
  credit_amount: number
  reference_type: string | null
}

export interface CashMovementLegacyReport {
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
  /** Money that came into all cash/bank accounts, net of transfers between them. */
  money_in: number
  /** Money that left all cash/bank accounts, net of transfers between them. */
  money_out: number
  /** Moved between the business's own cash and bank accounts (e.g. bank deposits). */
  internal_transfers: number
  lines: CashMovementLegacyLine[]
}

/**
 * Cash (1000) and bank (1010) movement. Opening, receipts and payments come from the period trial balance,
 * so they are branch-scoped. Lines come from the general ledger of each account.
 */
export async function getCashMovement(from: string, to: string, branchId?: string | null): Promise<CashMovementLegacyReport> {
  const totalsQuery = new URLSearchParams({ fromUtc: startOfDayUtc(from), toUtc: endOfDayUtc(to) })
  if (branchId) totalsQuery.set("branchId", branchId)
  const [{ opening, activity }, totals] = await Promise.all([
    loadPeriodBalances(from, to, branchId),
    dotnetClient.get<DotnetCashMovementDto>(`/accounting/reports/cash-movement?${totalsQuery.toString()}`),
  ])
  const openingByCode = new Map(opening.map((r) => [r.code, r] as const))
  const activityByCode = new Map(activity.map((r) => [r.code, r] as const))

  const figures = (code: string) => {
    const open = openingByCode.get(code)
    const act = activityByCode.get(code)
    const openingBalance = round2((open?.debit ?? 0) - (open?.credit ?? 0))
    const receipts = round2(act?.debit ?? 0)
    const payments = round2(act?.credit ?? 0)
    return { opening: openingBalance, receipts, payments, closing: round2(openingBalance + receipts - payments) }
  }
  const cash = figures(CASH_CODE)
  const bank = figures(BANK_CODE)

  const lines: CashMovementLegacyLine[] = []
  for (const code of [CASH_CODE, BANK_CODE]) {
    const account = activityByCode.get(code) ?? openingByCode.get(code)
    if (!account) continue
    const ledger = await getGeneralLedger(account.accountId, from, to, branchId)
    for (const row of ledger.rows) {
      lines.push({
        voucher_date: row.voucher_date,
        voucher_no: row.voucher_no,
        voucher_id: row.voucher_id,
        account_code: row.account_code,
        account_name: row.account_name,
        description: row.description,
        debit_amount: row.debit_amount,
        credit_amount: row.credit_amount,
        reference_type: null,
      })
    }
  }
  lines.sort((a, b) => a.voucher_date.localeCompare(b.voucher_date))

  return {
    period_from: from,
    period_to: to,
    branch_id: branchId ?? null,
    cash_opening: cash.opening,
    cash_receipts: cash.receipts,
    cash_payments: cash.payments,
    cash_closing: cash.closing,
    bank_opening: bank.opening,
    bank_receipts: bank.receipts,
    bank_payments: bank.payments,
    bank_closing: bank.closing,
    money_in: round2(totals.totalInflow),
    money_out: round2(totals.totalOutflow),
    internal_transfers: round2(totals.internalTransfers ?? 0),
    lines,
  }
}

// ---------------------------------------------------------------------------
// General ledger
// ---------------------------------------------------------------------------

export interface GeneralLedgerLegacyRow {
  voucher_date: string
  voucher_no: string
  voucher_id: string
  line_no: number
  description: string | null
  debit_amount: number
  credit_amount: number
  account_code: string
  account_name: string
  running_balance: number
}

async function fetchGeneralLedgerPage(
  accountId: string,
  from: string,
  to: string,
  branchId: string | null | undefined,
  pageNumber: number,
  pageSize: number,
): Promise<DotnetGeneralLedgerReportDto> {
  const p = new URLSearchParams({
    fromUtc: startOfDayUtc(from),
    toUtc: endOfDayUtc(to),
    pageNumber: String(pageNumber),
    pageSize: String(pageSize),
  })
  if (branchId) p.set("branchId", branchId)
  return dotnetClient.get<DotnetGeneralLedgerReportDto>(
    `/accounting/reports/general-ledger/${encodeURIComponent(accountId)}?${p.toString()}`,
  )
}

function toLegacyGeneralLedgerRows(
  dto: DotnetGeneralLedgerReportDto,
  pageNumber: number,
  pageSize: number,
): GeneralLedgerLegacyRow[] {
  return dto.lines.items.map((l, i) => ({
    voucher_date: dateOnly(l.voucherDateUtc),
    voucher_no: l.voucherNo,
    voucher_id: l.voucherId,
    // Global position across the whole period, not just this page, so renumbering still makes sense
    // when pages are viewed out of order.
    line_no: (pageNumber - 1) * pageSize + i + 1,
    description: l.narration,
    debit_amount: l.debitAmount,
    credit_amount: l.creditAmount,
    account_code: dto.accountCode,
    account_name: dto.accountName,
    running_balance: l.runningBalance,
  }))
}

export interface GeneralLedgerPageResult {
  rows: GeneralLedgerLegacyRow[]
  opening_balance: number
  closing_balance: number
  totalCount: number
  totalPages: number
  pageNumber: number
}

/**
 * One page of the general ledger. The .NET endpoint pages for real (`PagedResponse` on `lines`), so
 * this requests only the current page — opening/closing balances in the result always cover the
 * whole period, not just the page (see GetGeneralLedgerQueryHandler).
 */
export async function getGeneralLedgerPage(
  accountId: string,
  from: string,
  to: string,
  branchId?: string | null,
  pageNumber = 1,
  pageSize = 50,
): Promise<GeneralLedgerPageResult> {
  const dto = await fetchGeneralLedgerPage(accountId, from, to, branchId, pageNumber, pageSize)
  return {
    rows: toLegacyGeneralLedgerRows(dto, dto.lines.pageNumber, dto.lines.pageSize),
    opening_balance: dto.openingBalance,
    closing_balance: dto.closingBalance,
    totalCount: dto.lines.totalCount,
    totalPages: dto.lines.totalPages,
    pageNumber: dto.lines.pageNumber,
  }
}

/**
 * Every line for the account/period, fetched page by page. Only for internal composition that needs
 * the full ledger regardless of UI paging — currently the cash-movement report below, which walks
 * cash/bank account activity for a period. The general-ledger UI tab uses {@link getGeneralLedgerPage}
 * instead so it never has to pull a whole busy account's history into the browser.
 */
export async function getGeneralLedger(
  accountId: string,
  from: string,
  to: string,
  branchId?: string | null,
): Promise<{ rows: GeneralLedgerLegacyRow[]; opening_balance: number }> {
  const pageSize = 200
  const allRows: GeneralLedgerLegacyRow[] = []
  let openingBalance = 0
  for (let pageNumber = 1; ; pageNumber++) {
    const dto = await fetchGeneralLedgerPage(accountId, from, to, branchId, pageNumber, pageSize)
    openingBalance = dto.openingBalance
    allRows.push(...toLegacyGeneralLedgerRows(dto, dto.lines.pageNumber, dto.lines.pageSize))
    if (pageNumber >= dto.lines.totalPages || dto.lines.items.length === 0) break
  }
  return { rows: allRows, opening_balance: openingBalance }
}

// ---------------------------------------------------------------------------
// VAT and reconciliations
// ---------------------------------------------------------------------------

export async function getVatReturn(from: string, to: string, branchId?: string | null): Promise<{
  period_from: string
  period_to: string
  output_vat_gl: number
  /** Output VAT given back on sales returns / credit notes and other adjustments. */
  output_vat_adjustments: number
  input_vat_gl: number
  net_vat_payable: number
  /** VAT paid to IRD (or set off) in the period — never part of the figures above. */
  vat_settled: number
  output_vat_operational: number
  input_vat_operational: number
  gl_vs_operational_output_diff: number
  gl_vs_operational_input_diff: number
  trial_balance_ok: boolean
}> {
  const p = new URLSearchParams({ fromUtc: startOfDayUtc(from), toUtc: endOfDayUtc(to) })
  if (branchId) p.set("branchId", branchId)
  const dto = await dotnetClient.get<DotnetVatReturnReportDto>(`/accounting/reports/vat-return?${p.toString()}`)
  const { activity } = await loadPeriodBalances(from, to, branchId)
  const inputVat = dto.inputVat ?? 0
  const totals = sumDebitsAndCredits(activity)
  return {
    period_from: from,
    period_to: to,
    // Gross output VAT charged on sales; returns/adjustments are their own line so the return adds up:
    // output − adjustments − input = net. VAT payments to IRD are excluded server-side.
    output_vat_gl: dto.vatCollected,
    output_vat_adjustments: dto.vatRefundedOrAdjusted,
    // Input VAT recoverable on purchases (account 1150); operational cross-checks are not modelled yet.
    input_vat_gl: inputVat,
    net_vat_payable: dto.netVatDue ?? dto.netVatPayable - inputVat,
    vat_settled: dto.vatSettled ?? 0,
    output_vat_operational: 0,
    input_vat_operational: 0,
    gl_vs_operational_output_diff: 0,
    gl_vs_operational_input_diff: 0,
    trial_balance_ok: totals.debit === totals.credit,
  }
}

/**
 * POST /accounting/vat/payments — records VAT paid to IRD (Dr VAT Payable / Cr Cash or Bank). The VAT return
 * leaves these settlements out, so the payment never shows up as a reduction of the period's output VAT.
 */
export async function recordVatPayment(body: {
  payment_date: string
  amount: number
  payment_method: string
  reference?: string | null
  narration?: string | null
}): Promise<{ voucher_id: string }> {
  assertDateOnly(body.payment_date, "payment_date")
  const id = await dotnetClient.post<string>("/accounting/vat/payments", {
    paymentDateUtc: startOfDayUtc(body.payment_date),
    amount: body.amount,
    paymentMethod: body.payment_method,
    reference: body.reference?.trim() || null,
    narration: body.narration?.trim() || null,
  })
  return { voucher_id: String(id) }
}

async function trialBalanceBalancedAsOf(asOf: string, branchId?: string | null): Promise<boolean> {
  const totals = sumDebitsAndCredits(await loadAsOfBalances(asOf, branchId))
  return totals.debit === totals.credit
}

/** Query string for a GL reconciliation report; `branchId` is sent only when a branch is selected. */
function glReconciliationQuery(asOf: string, branchId?: string | null): string {
  const p = new URLSearchParams({ asOfUtc: endOfDayUtc(asOf) })
  if (branchId) p.set("branchId", branchId)
  return p.toString()
}

export async function getArGlReconciliation(asOf: string, branchId?: string | null): Promise<{
  as_of: string
  subledger_ar_total: number
  gl_ar_total: number
  difference: number
  trial_balance_ok: boolean
}> {
  const dto = await dotnetClient.get<DotnetGlReconciliationDto>(
    `/accounting/reports/ar-gl-reconciliation?${glReconciliationQuery(asOf, branchId)}`,
  )
  return {
    as_of: asOf,
    subledger_ar_total: dto.subledgerTotal,
    gl_ar_total: dto.glBalance,
    difference: dto.variance,
    trial_balance_ok: await trialBalanceBalancedAsOf(asOf, branchId),
  }
}

export async function getApGlReconciliation(asOf: string, branchId?: string | null): Promise<{
  as_of: string
  subledger_ap_total: number
  gl_ap_total: number
  difference: number
  gl_ap_breakdown: Array<{ account_id: string; code: string; name: string; balance: number }>
  trial_balance_ok: boolean
}> {
  const dto = await dotnetClient.get<DotnetGlReconciliationDto>(
    `/accounting/reports/ap-gl-reconciliation?${glReconciliationQuery(asOf, branchId)}`,
  )
  const balances = await loadAsOfBalances(asOf, branchId)
  const totals = sumDebitsAndCredits(balances)
  return {
    as_of: asOf,
    subledger_ap_total: dto.subledgerTotal,
    gl_ap_total: dto.glBalance,
    difference: dto.variance,
    gl_ap_breakdown: balances
      .filter((r) => r.code === AP_CONTROL_CODE)
      .map((r) => ({ account_id: r.accountId, code: r.code, name: r.name, balance: round2(r.credit - r.debit) })),
    trial_balance_ok: totals.debit === totals.credit,
  }
}

export async function getInventoryGlReconciliation(asOf: string, branchId?: string | null): Promise<{
  as_of: string
  stock_valuation: number
  gl_inventory_balance: number
  difference: number
  /** The stock figure is today's valuation even when `as_of` is earlier (stock has no history). */
  stock_is_current_only: boolean
  trial_balance_ok: boolean
}> {
  const dto = await dotnetClient.get<DotnetGlReconciliationDto>(
    `/accounting/reports/inventory-gl-reconciliation?${glReconciliationQuery(asOf, branchId)}`,
  )
  return {
    as_of: asOf,
    stock_valuation: dto.subledgerTotal,
    gl_inventory_balance: dto.glBalance,
    difference: dto.variance,
    stock_is_current_only: subledgerIsCurrentOnly(dto),
    trial_balance_ok: await trialBalanceBalancedAsOf(asOf, branchId),
  }
}

// ---------------------------------------------------------------------------
// Aging
// ---------------------------------------------------------------------------

export interface AgingLegacyRow {
  customer_id?: string
  customer_name?: string
  supplier_id?: string
  supplier_name?: string
  balance: number
  current: number
  days_31_60: number
  days_61_90: number
  days_90_plus: number
}

export function toArAgingRow(dto: DotnetArAgingReportLineDto): AgingLegacyRow {
  return {
    customer_id: dto.customerId,
    customer_name: dto.customerName,
    balance: dto.total,
    current: dto.current,
    days_31_60: dto.days31To60,
    days_61_90: dto.days61To90,
    days_90_plus: dto.over90,
  }
}

export function toApAgingRow(dto: DotnetApAgingReportLineDto): AgingLegacyRow {
  return {
    supplier_id: dto.supplierId,
    supplier_name: dto.supplierName,
    balance: dto.total,
    current: dto.current,
    days_31_60: dto.days31To60,
    days_61_90: dto.days61To90,
    days_90_plus: dto.over90,
  }
}

export async function getArAging(asOf: string, branchId?: string | null): Promise<{ rows: AgingLegacyRow[] }> {
  const p = new URLSearchParams({ asOfUtc: endOfDayUtc(asOf) })
  if (branchId) p.set("branchId", branchId)
  const dtos = await dotnetClient.get<DotnetArAgingReportLineDto[]>(`/accounting/reports/ar-aging?${p.toString()}`)
  return { rows: dtos.map(toArAgingRow) }
}

export async function getApAging(asOf: string, branchId?: string | null): Promise<{ rows: AgingLegacyRow[] }> {
  const p = new URLSearchParams({ asOfUtc: endOfDayUtc(asOf) })
  if (branchId) p.set("branchId", branchId)
  const dtos = await dotnetClient.get<DotnetApAgingReportLineDto[]>(`/accounting/reports/ap-aging?${p.toString()}`)
  return { rows: dtos.map(toApAgingRow) }
}
