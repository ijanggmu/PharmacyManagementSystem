"use client"

import { accountingApi } from "@/features/accounting/api-client"
import {
  getBalanceSheets,
  getCashFlowStatement,
  getProfitAndLossColumns,
  type DateRangeYmd,
} from "@/lib/api/accounting-statements-api"
import { useAccountingReport } from "./use-vouchers"

/**
 * Period report queries. Keys are shared, so the overview, voucher register and the report pages
 * reuse each other's results instead of refetching.
 */

export interface PeriodParams {
  from: string
  to: string
  branchId?: string
}

const ready = (p: PeriodParams, enabled: boolean) => enabled && !!p.from && !!p.to

export function useTrialBalance(p: PeriodParams, enabled = true) {
  return useAccountingReport(["trial-balance", p], () => accountingApi.trialBalance(p.from, p.to, p.branchId), ready(p, enabled))
}

/** Opening / movement / closing per account for the period (one API call). */
export function usePeriodTrialBalance(p: PeriodParams, enabled = true) {
  return useAccountingReport(
    ["trial-balance-period", p],
    () => accountingApi.periodTrialBalance(p.from, p.to, p.branchId),
    ready(p, enabled)
  )
}

export function useTrialBalanceGrouped(p: PeriodParams, enabled = true) {
  return useAccountingReport(
    ["trial-balance-grouped", p],
    () => accountingApi.trialBalanceGrouped(p.from, p.to, p.branchId),
    ready(p, enabled)
  )
}

export function useProfitAndLoss(p: PeriodParams, enabled = true) {
  return useAccountingReport(["profit-loss", p], () => accountingApi.profitAndLoss(p.from, p.to, p.branchId), ready(p, enabled))
}

export function useBalanceSheet(asOf: string, branchId?: string, enabled = true) {
  return useAccountingReport(["balance-sheet", asOf, branchId ?? ""], () => accountingApi.balanceSheet(asOf, branchId), enabled && !!asOf)
}

/** Cash flow statement (indirect method) for the period. */
export function useCashFlowStatement(p: PeriodParams, enabled = true) {
  return useAccountingReport(["cash-flow", p], () => getCashFlowStatement(p.from, p.to, p.branchId), ready(p, enabled))
}

/** P&L for several periods side by side (comparatives, monthly trend). */
export function useProfitAndLossColumns(periods: readonly DateRangeYmd[], branchId?: string, enabled = true) {
  return useAccountingReport(
    ["profit-loss-columns", periods, branchId ?? ""],
    () => getProfitAndLossColumns(periods, branchId),
    enabled && periods.length > 0 && periods.every((x) => !!x.from && !!x.to)
  )
}

/** Balance sheets as of each date (comparatives). */
export function useBalanceSheets(asOfs: readonly string[], branchId?: string, enabled = true) {
  return useAccountingReport(
    ["balance-sheets", asOfs, branchId ?? ""],
    () => getBalanceSheets(asOfs, branchId),
    enabled && asOfs.length > 0 && asOfs.every(Boolean)
  )
}

export function useCashMovement(p: PeriodParams, enabled = true) {
  return useAccountingReport(["cash-movement", p], () => accountingApi.cashMovement(p.from, p.to, p.branchId), ready(p, enabled))
}

export function useArAging(asOf: string, branchId?: string, enabled = true) {
  return useAccountingReport(["ar-aging", asOf, branchId ?? ""], () => accountingApi.arAging(asOf, branchId), enabled && !!asOf)
}

export function useApAging(asOf: string, branchId?: string, enabled = true) {
  return useAccountingReport(["ap-aging", asOf, branchId ?? ""], () => accountingApi.apAging(asOf, branchId), enabled && !!asOf)
}

export function useVatReturn(p: PeriodParams, enabled = true) {
  return useAccountingReport(["vat-return", p], () => accountingApi.vatReturn(p.from, p.to, p.branchId), ready(p, enabled))
}

export function useGlReconciliations(asOf: string, branchId?: string, enabled = true) {
  return useAccountingReport(
    ["gl-reconciliations", asOf, branchId ?? ""],
    async () => {
      const [ap, inv, ar] = await Promise.all([
        accountingApi.apGlReconciliation(asOf, branchId),
        accountingApi.inventoryGlReconciliation(asOf, branchId),
        accountingApi.arGlReconciliation(asOf, branchId),
      ])
      return { ap, inv, ar }
    },
    enabled && !!asOf
  )
}

/** Sums aging rows into bucket totals. */
export function agingTotals(
  rows: { balance: number; current: number; days_31_60: number; days_61_90: number; days_90_plus: number }[]
) {
  return rows.reduce(
    (acc, r) => {
      acc.balance += Number(r.balance || 0)
      acc.current += Number(r.current || 0)
      acc.d31 += Number(r.days_31_60 || 0)
      acc.d61 += Number(r.days_61_90 || 0)
      acc.d90 += Number(r.days_90_plus || 0)
      return acc
    },
    { balance: 0, current: 0, d31: 0, d61: 0, d90: 0 }
  )
}
