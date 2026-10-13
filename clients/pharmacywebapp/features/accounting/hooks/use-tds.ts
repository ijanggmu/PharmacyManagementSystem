"use client"

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query"
import { tdsApi } from "@/features/accounting/api-client-tds"
import { ACCOUNTING_ROOT_KEY, useAccountingReport } from "@/features/accounting/hooks/use-vouchers"
import type { TdsCategoryDraft } from "@/features/accounting/lib/tds"
import { tdsCategoryInputs } from "@/features/accounting/lib/tds"

export const TDS_CATEGORIES_KEY = [...ACCOUNTING_ROOT_KEY, "tds-categories"] as const

/** The tenant's TDS categories (rates pre-fill the expense and supplier payment forms). */
export function useTdsCategories(enabled = true) {
  return useQuery({
    queryKey: TDS_CATEGORIES_KEY,
    queryFn: () => tdsApi.categories(),
    staleTime: 5 * 60 * 1000,
    enabled,
  })
}

/** Saves the TDS categories; the drafts travel through mutate(drafts). */
export function useSaveTdsCategories() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (drafts: readonly TdsCategoryDraft[]) => tdsApi.saveCategories(tdsCategoryInputs(drafts)),
    onSuccess: (saved) => {
      qc.setQueryData(TDS_CATEGORIES_KEY, saved)
    },
  })
}

export function useTdsReport(p: { from: string; to: string; branchId?: string }, enabled = true) {
  return useAccountingReport(["tds-report", p], () => tdsApi.report(p.from, p.to, p.branchId), enabled && !!p.from && !!p.to)
}

export interface RecordTdsPaymentVars {
  payment_date: string
  amount: number
  payment_method: string
  reference: string
  idempotency_key: string
}

/** Records a TDS deposit; per-call data through mutate(vars). Refreshes every accounting query. */
export function useRecordTdsPayment() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: ({ idempotency_key, ...body }: RecordTdsPaymentVars) => tdsApi.recordPayment(body, idempotency_key),
    onSuccess: () => qc.invalidateQueries({ queryKey: ACCOUNTING_ROOT_KEY }),
  })
}
