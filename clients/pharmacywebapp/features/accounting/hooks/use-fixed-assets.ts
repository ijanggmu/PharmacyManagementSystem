"use client"

import { keepPreviousData, useMutation, useQuery, useQueryClient } from "@tanstack/react-query"
import { fixedAssetsApi } from "@/features/accounting/api-client-fixed-assets"
import { ACCOUNTING_ROOT_KEY } from "@/features/accounting/hooks/use-vouchers"
import { DEFAULT_TAX_POOLS, type DisposalFormValues, type FixedAssetFormValues } from "@/features/accounting/lib/fixed-assets"

const FIXED_ASSETS_KEY = [...ACCOUNTING_ROOT_KEY, "fixed-assets"] as const

/** The fixed asset register (every status; the tab filters locally). */
export function useFixedAssets(enabled = true) {
  return useQuery({
    queryKey: [...FIXED_ASSETS_KEY, "register"],
    queryFn: () => fixedAssetsApi.list(),
    enabled,
    staleTime: 30_000,
    placeholderData: keepPreviousData,
  })
}

/** Schedule 2 pools; falls back to the built-in defaults until the API answers. */
export function useTaxPools() {
  return useQuery({
    queryKey: [...FIXED_ASSETS_KEY, "tax-pools"],
    queryFn: () => fixedAssetsApi.taxPools(),
    staleTime: 60 * 60 * 1000,
    placeholderData: [...DEFAULT_TAX_POOLS],
  })
}

export function useDepreciationPreview(fiscalYear: number, month: number | null, enabled = true) {
  return useQuery({
    queryKey: [...FIXED_ASSETS_KEY, "preview", fiscalYear, month],
    queryFn: () => fixedAssetsApi.preview(fiscalYear, month),
    enabled,
    staleTime: 10_000,
    placeholderData: keepPreviousData,
  })
}

export function useDepreciationRuns(fiscalYear: number) {
  return useQuery({
    queryKey: [...FIXED_ASSETS_KEY, "runs", fiscalYear],
    queryFn: () => fixedAssetsApi.runs(fiscalYear),
    staleTime: 30_000,
    placeholderData: keepPreviousData,
  })
}

export function useDepreciationSchedule(fiscalYear: number) {
  return useQuery({
    queryKey: [...FIXED_ASSETS_KEY, "schedule", fiscalYear],
    queryFn: () => fixedAssetsApi.schedule(fiscalYear),
    staleTime: 30_000,
    placeholderData: keepPreviousData,
  })
}

export function useTaxDepreciationSchedule(fiscalYear: number) {
  return useQuery({
    queryKey: [...FIXED_ASSETS_KEY, "tax-schedule", fiscalYear],
    queryFn: () => fixedAssetsApi.taxSchedule(fiscalYear),
    staleTime: 30_000,
    placeholderData: keepPreviousData,
  })
}

export interface CreateFixedAssetVars {
  values: FixedAssetFormValues
  idempotency_key: string
}

export interface UpdateFixedAssetVars {
  id: string
  values: FixedAssetFormValues
}

export interface DisposeFixedAssetVars {
  id: string
  values: DisposalFormValues
  idempotency_key: string
}

export interface RunDepreciationVars {
  fiscal_year: number
  month: number | null
  idempotency_key: string
}

/**
 * Register and depreciation writes. Every per-call value travels through `mutate(vars)`; each one posts vouchers (or
 * changes what reports show), so the whole accounting cache is refreshed afterwards.
 */
export function useFixedAssetMutations() {
  const qc = useQueryClient()
  const invalidate = () => qc.invalidateQueries({ queryKey: ACCOUNTING_ROOT_KEY })

  const create = useMutation({
    mutationFn: ({ values, idempotency_key }: CreateFixedAssetVars) => fixedAssetsApi.create(values, idempotency_key),
    onSuccess: invalidate,
  })
  const update = useMutation({
    mutationFn: ({ id, values }: UpdateFixedAssetVars) => fixedAssetsApi.update(id, values),
    onSuccess: invalidate,
  })
  const remove = useMutation({
    mutationFn: (id: string) => fixedAssetsApi.remove(id),
    onSuccess: invalidate,
  })
  const dispose = useMutation({
    mutationFn: ({ id, values, idempotency_key }: DisposeFixedAssetVars) => fixedAssetsApi.dispose(id, values, idempotency_key),
    onSuccess: invalidate,
  })
  const run = useMutation({
    mutationFn: ({ fiscal_year, month, idempotency_key }: RunDepreciationVars) => fixedAssetsApi.run(fiscal_year, month, idempotency_key),
    onSuccess: invalidate,
  })
  const reverseRun = useMutation({
    mutationFn: (runId: string) => fixedAssetsApi.reverseRun(runId),
    onSuccess: invalidate,
  })

  return { create, update, remove, dispose, run, reverseRun }
}
