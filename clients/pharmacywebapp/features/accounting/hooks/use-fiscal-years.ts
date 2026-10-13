"use client"

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query"
import { accountingApi } from "@/features/accounting/api-client"
import { ACCOUNTING_ROOT_KEY } from "./use-vouchers"

const FISCAL_YEARS_KEY = [...ACCOUNTING_ROOT_KEY, "fiscal-years"] as const

/** Fiscal years with their year-end close status, newest first. */
export function useFiscalYears(enabled = true) {
  return useQuery({
    queryKey: FISCAL_YEARS_KEY,
    queryFn: () => accountingApi.listFiscalYears(),
    enabled,
    staleTime: 30_000,
  })
}

/**
 * Close / reopen a fiscal year. The year rides through `mutate(fiscalYear)`. Both post vouchers that change every
 * balance report and the posting lock, so the whole accounting cache is invalidated.
 */
export function useFiscalYearMutations() {
  const qc = useQueryClient()
  const invalidate = () => qc.invalidateQueries({ queryKey: ACCOUNTING_ROOT_KEY })

  const close = useMutation({
    mutationFn: (fiscalYear: number) => accountingApi.closeFiscalYear(fiscalYear),
    onSuccess: invalidate,
  })
  const reopen = useMutation({
    mutationFn: (fiscalYear: number) => accountingApi.reopenFiscalYear(fiscalYear),
    onSuccess: invalidate,
  })

  return { close, reopen }
}
