"use client"

import { keepPreviousData, useQuery } from "@tanstack/react-query"
import { duesApi } from "@/lib/api/dues-api"

/**
 * Payables / receivables by due date. Payables keys live under ["suppliers", …] so a supplier payment
 * (which invalidates ["suppliers"]) refreshes the schedule too.
 */
export const dueKeys = {
  payables: (asOf: string, withinDays: number, branchId: string | null) =>
    ["suppliers", "payables-due", asOf, withinDays, branchId ?? "all"] as const,
  receivables: (asOf: string, customerId: string | null, branchId: string | null) =>
    ["customers", "receivables-due", asOf, customerId ?? "all", branchId ?? "all"] as const,
}

export function usePayablesDue(asOf: string, options?: { withinDays?: number; branchId?: string | null; enabled?: boolean }) {
  const withinDays = options?.withinDays ?? 7
  const branchId = options?.branchId ?? null
  return useQuery({
    queryKey: dueKeys.payables(asOf, withinDays, branchId),
    queryFn: () => duesApi.payables(asOf, { withinDays, branchId }),
    enabled: !!asOf && (options?.enabled ?? true),
    placeholderData: keepPreviousData,
    staleTime: 15_000,
  })
}

/** One customer's open invoices (every open debt, with due dates), or all customers' when `customerId` is null. */
export function useReceivablesDue(
  asOf: string,
  options?: { customerId?: string | null; branchId?: string | null; enabled?: boolean },
) {
  const customerId = options?.customerId ?? null
  const branchId = options?.branchId ?? null
  return useQuery({
    queryKey: dueKeys.receivables(asOf, customerId, branchId),
    queryFn: () => duesApi.receivables(asOf, { customerId, branchId, includeAll: true }),
    enabled: !!asOf && (options?.enabled ?? true),
    staleTime: 15_000,
  })
}
