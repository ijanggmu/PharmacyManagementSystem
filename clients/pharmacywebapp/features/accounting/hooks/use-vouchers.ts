"use client"

import { useCallback } from "react"
import { keepPreviousData, useMutation, useQuery, useQueryClient, type QueryKey } from "@tanstack/react-query"
import { accountingApi } from "@/features/accounting/api-client"
import { buildVoucherPrintHtml, printHtmlDocument } from "@/features/accounting/lib/voucher-print"
import { usePharmacyProfile } from "./use-pharmacy-profile"

/** Every accounting query lives under this root so a mutation can refresh the whole module. */
export const ACCOUNTING_ROOT_KEY = ["accounting"] as const

export const voucherKeys = {
  all: [...ACCOUNTING_ROOT_KEY, "vouchers"] as const,
  list: (params: VoucherListQuery) => [...ACCOUNTING_ROOT_KEY, "vouchers", "list", params] as const,
  counts: (params: { from: string; to: string; branchId?: string }) =>
    [...ACCOUNTING_ROOT_KEY, "vouchers", "counts", params] as const,
  detail: (id: string) => [...ACCOUNTING_ROOT_KEY, "vouchers", "detail", id] as const,
}

export interface VoucherListQuery {
  from: string
  to: string
  branchId?: string
  status?: string
  voucherType?: string
  /** "manual" | "system" — applied by the API. */
  source?: string
  /** Voucher no / narration / reference type — applied by the API. */
  search?: string
  page: number
  pageSize: number
}

/** One page of the register. Every filter is applied server-side, so `meta` totals match the filters. */
export function useVoucherList(q: VoucherListQuery, enabled = true) {
  return useQuery({
    queryKey: voucherKeys.list(q),
    queryFn: () =>
      accountingApi.listVouchers({
        dateFrom: q.from,
        dateTo: q.to,
        branchId: q.branchId,
        status: q.status || undefined,
        voucherType: q.voucherType || undefined,
        source: q.source || undefined,
        search: q.search || undefined,
        page: q.page,
        pageSize: q.pageSize,
      }),
    enabled: enabled && !!q.from && !!q.to,
    placeholderData: keepPreviousData,
    staleTime: 30_000,
  })
}

/** Voucher counts by status for the period — one-row queries, read from each response's total. */
export function useVoucherStatusCounts(params: { from: string; to: string; branchId?: string }, enabled = true) {
  return useQuery({
    queryKey: voucherKeys.counts(params),
    queryFn: async () => {
      const count = async (status: string) => {
        const res = await accountingApi.listVouchers({
          dateFrom: params.from,
          dateTo: params.to,
          branchId: params.branchId,
          status,
          page: 1,
          pageSize: 1,
        })
        return res.meta.total
      }
      const [draft, posted, voided, reversed] = await Promise.all([count("draft"), count("posted"), count("void"), count("reversed")])
      return { draft, posted, void: voided, reversed, total: draft + posted + voided }
    },
    enabled: enabled && !!params.from && !!params.to,
    staleTime: 30_000,
  })
}

export function useVoucherDetail(id: string | null) {
  return useQuery({
    queryKey: voucherKeys.detail(id ?? ""),
    queryFn: () => accountingApi.getVoucher(id as string),
    enabled: !!id,
    staleTime: 30_000,
  })
}

/** Generic React Query wrapper for the period reports, keyed under the accounting root. */
export function useAccountingReport<T>(key: QueryKey, fn: () => Promise<T>, enabled = true) {
  return useQuery({
    queryKey: [...ACCOUNTING_ROOT_KEY, ...key],
    queryFn: fn,
    enabled,
    staleTime: 60_000,
    placeholderData: keepPreviousData,
  })
}

export function useVoucherMutations() {
  const qc = useQueryClient()
  const invalidate = () => qc.invalidateQueries({ queryKey: ACCOUNTING_ROOT_KEY })

  const reverse = useMutation({
    mutationFn: ({ id, reversalDate }: { id: string; reversalDate?: string }) =>
      accountingApi.reverseVoucher(id, reversalDate),
    onSuccess: invalidate,
  })
  const voidVoucher = useMutation({
    mutationFn: ({ id, reason }: { id: string; reason: string }) => accountingApi.voidVoucher(id, reason),
    onSuccess: invalidate,
  })
  const post = useMutation({
    mutationFn: (id: string) => accountingApi.postVoucher(id),
    onSuccess: invalidate,
  })
  const remove = useMutation({
    mutationFn: (id: string) => accountingApi.deleteVoucher(id),
    onSuccess: invalidate,
  })

  return { reverse, voidVoucher, post, remove, invalidate }
}

/**
 * Prints a voucher: loads its detail (cached), builds the A4 document with the pharmacy letterhead
 * and prints it from a hidden iframe.
 */
export function usePrintVoucher() {
  const qc = useQueryClient()
  const { profile } = usePharmacyProfile()

  return useCallback(
    async (voucherId: string, opts?: { branchName?: string | null; voidReason?: string | null }) => {
      const detail = await qc.fetchQuery({
        queryKey: voucherKeys.detail(voucherId),
        queryFn: () => accountingApi.getVoucher(voucherId),
        staleTime: 30_000,
      })
      const html = buildVoucherPrintHtml({
        voucher: detail.voucher,
        lines: detail.lines ?? [],
        profile,
        branchName: opts?.branchName ?? null,
        voidReason: opts?.voidReason ?? null,
      })
      await printHtmlDocument(html)
    },
    [qc, profile]
  )
}
