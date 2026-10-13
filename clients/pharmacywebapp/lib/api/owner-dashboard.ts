/**
 * Owner dashboard KPIs (.NET GET /accounting/reports/owner-dashboard): one call returns today/month sales,
 * the month's gross margin from the GL, stock value, receivables, payables, cash & bank, VAT payable and the
 * top medicines by margin, for one branch scope. The server caches the result for a minute.
 *
 * Mapping helpers are pure and exported for unit tests.
 */

import { dotnetClient } from "@/lib/api/dotnet-client"
import { bsMonthRangeYmd } from "@/lib/utils/bs-date"
import { nepalDayStartUtc, nepalYmdOf } from "@/lib/utils/nepal-time"

/** The .NET permission the endpoint requires (AccountingPermissions.Reports.View). */
export const OWNER_DASHBOARD_PERMISSION = "Permissions.Accounting.Reports.View"

export function canViewOwnerDashboard(granted: readonly string[] | null | undefined): boolean {
  return !!granted?.includes(OWNER_DASHBOARD_PERMISSION)
}

/** Accounting.Contracts OwnerDashboardMoneyAccountDto. */
export interface OwnerDashboardMoneyAccount {
  accountId: string
  code: string
  name: string
  balance: number
}

/** Accounting.Contracts OwnerDashboardTopMedicineDto. */
export interface OwnerDashboardTopMedicine {
  medicineId: string
  name: string
  quantity: number
  netRevenue: number
  cost: number
  margin: number
  marginPercent: number | null
}

/** Accounting.Contracts OwnerDashboardDto (camelCase JSON). */
export interface OwnerDashboard {
  generatedAtUtc: string
  branchId: string | null
  todayStartUtc: string
  monthStartUtc: string
  todaySales: number
  todaySaleCount: number
  monthSales: number
  monthSaleCount: number
  monthNetSales: number
  monthCostOfGoodsSold: number
  monthGrossProfit: number
  grossMarginPercent: number | null
  stockValue: number
  receivables: number
  payables: number
  cashAndBankBalance: number
  cashAndBankAccounts: OwnerDashboardMoneyAccount[]
  vatPayable: number
  topMedicinesByMargin: OwnerDashboardTopMedicine[]
}

/**
 * Start (UTC instant) of the Bikram Sambat month containing `now` in Nepal — the "this month" the rest of the
 * app shows, e.g. 1 Ashwin 00:00 NPT, rather than the 1st of the Gregorian month.
 */
export function bsMonthStartUtc(now: Date = new Date()): string {
  return nepalDayStartUtc(bsMonthRangeYmd(nepalYmdOf(now)).from)
}

export function ownerDashboardPath(params: { branchId?: string; monthStartUtc?: string }): string {
  const query = new URLSearchParams()
  if (params.branchId) query.set("branchId", params.branchId)
  if (params.monthStartUtc) query.set("monthStartUtc", params.monthStartUtc)
  const qs = query.toString()
  return `/accounting/reports/owner-dashboard${qs ? `?${qs}` : ""}`
}

export function fetchOwnerDashboard(params: { branchId?: string; monthStartUtc?: string }): Promise<OwnerDashboard> {
  return dotnetClient.get<OwnerDashboard>(ownerDashboardPath(params))
}

/** "38.5%" / "—" for a percentage that may be missing (no sales yet). */
export function formatPercent(value: number | null | undefined): string {
  if (value === null || value === undefined || !Number.isFinite(value)) return "—"
  return `${value.toFixed(1)}%`
}

/** Tone for the gross-margin tile: a loss is a problem, a thin margin a warning. */
export function marginTone(percent: number | null | undefined): "success" | "warning" | "danger" | "default" {
  if (percent === null || percent === undefined) return "default"
  if (percent < 0) return "danger"
  if (percent < 10) return "warning"
  return "success"
}

/** VAT payable reads as a credit (refundable / carried forward) when negative. */
export function vatHint(vatPayable: number): string {
  return vatPayable < 0 ? "Input VAT credit to carry forward" : "Output VAT less input VAT, to date"
}
