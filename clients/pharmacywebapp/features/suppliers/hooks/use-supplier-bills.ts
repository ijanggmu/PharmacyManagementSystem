"use client"

import { keepPreviousData, useQuery } from "@tanstack/react-query"
import { suppliersDotnetApi } from "@/lib/api/suppliers-api"

/**
 * Keys live under ["suppliers", …] so the payment mutation's supplier invalidation refreshes open bills
 * and the ledger after a payment.
 */
export const supplierBillKeys = {
  openBills: (supplierId: string, onlyOpen: boolean, branchId: string | null) =>
    ["suppliers", "open-bills", supplierId, onlyOpen, branchId ?? "all"] as const,
  ledgerPage: (supplierId: string, page: number, pageSize: number, branchId: string | null) =>
    ["suppliers", "ledger-page", supplierId, page, pageSize, branchId ?? "all"] as const,
}

/** Bills for one supplier with paid/outstanding amounts, oldest first. */
export function useSupplierOpenBills(
  supplierId: string | null | undefined,
  options?: { onlyOpen?: boolean; branchId?: string | null; enabled?: boolean },
) {
  const onlyOpen = options?.onlyOpen ?? true
  const branchId = options?.branchId ?? null
  return useQuery({
    queryKey: supplierBillKeys.openBills(supplierId ?? "", onlyOpen, branchId),
    queryFn: () => suppliersDotnetApi.openBills(supplierId as string, { onlyOpen, branchId }),
    enabled: !!supplierId && (options?.enabled ?? true),
    staleTime: 15_000,
  })
}

/** One page of a supplier's ledger, newest first. */
export function useSupplierLedgerPage(
  supplierId: string | null | undefined,
  page: number,
  pageSize: number,
  options?: { branchId?: string | null; enabled?: boolean },
) {
  const branchId = options?.branchId ?? null
  return useQuery({
    queryKey: supplierBillKeys.ledgerPage(supplierId ?? "", page, pageSize, branchId),
    queryFn: () => suppliersDotnetApi.ledgerPage(supplierId as string, page, pageSize, branchId),
    enabled: !!supplierId && (options?.enabled ?? true),
    placeholderData: keepPreviousData,
    staleTime: 15_000,
  })
}
