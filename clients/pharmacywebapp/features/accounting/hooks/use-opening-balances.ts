"use client"

import { useEffect, useState } from "react"
import { keepPreviousData, useMutation, useQuery, useQueryClient } from "@tanstack/react-query"
import {
  openingBalancesApi,
  type EditOpeningBalancesInput,
  type ResetOpeningBalancesInput,
  type SetOpeningBalancesInput,
} from "@/features/accounting/api-client-opening-balances"
import { openingBalanceAccess } from "@/features/accounting/lib/opening-balances"
import { loadDotnetCurrentUser } from "@/lib/api/auth-api"
import { isDotnetRootUser } from "@/lib/api/dotnet-permissions"
import { ACCOUNTING_ROOT_KEY } from "./use-vouchers"

export const openingBalanceKeys = {
  all: [...ACCOUNTING_ROOT_KEY, "opening-balances"] as const,
  state: (branchId: string) => [...ACCOUNTING_ROOT_KEY, "opening-balances", "state", branchId] as const,
  history: (branchId: string, page: number) => [...ACCOUNTING_ROOT_KEY, "opening-balances", "history", branchId, page] as const,
}

export const OPENING_HISTORY_PAGE_SIZE = 10

export function useOpeningBalanceState(branchId: string | null) {
  return useQuery({
    queryKey: openingBalanceKeys.state(branchId ?? ""),
    queryFn: () => openingBalancesApi.get(branchId as string),
    enabled: !!branchId,
    staleTime: 30_000,
  })
}

export function useOpeningBalanceHistory(branchId: string | null, page: number) {
  return useQuery({
    queryKey: openingBalanceKeys.history(branchId ?? "", page),
    queryFn: () => openingBalancesApi.history({ branchId: branchId as string, pageNumber: page, pageSize: OPENING_HISTORY_PAGE_SIZE }),
    enabled: !!branchId,
    placeholderData: keepPreviousData,
    staleTime: 30_000,
  })
}

/** Set / Edit / Reset. Per-call data goes through mutate(arg); success refreshes every accounting query
 *  (the opening voucher moves trial balance, ledger and statements). */
export function useOpeningBalanceMutations() {
  const qc = useQueryClient()
  const invalidate = () => qc.invalidateQueries({ queryKey: ACCOUNTING_ROOT_KEY })

  const set = useMutation({ mutationFn: (input: SetOpeningBalancesInput) => openingBalancesApi.set(input), onSuccess: invalidate })
  const edit = useMutation({ mutationFn: (input: EditOpeningBalancesInput) => openingBalancesApi.edit(input), onSuccess: invalidate })
  const reset = useMutation({ mutationFn: (input: ResetOpeningBalancesInput) => openingBalancesApi.reset(input), onSuccess: invalidate })

  return { set, edit, reset }
}

export interface OpeningBalancePermissions {
  loaded: boolean
  canView: boolean
  canManage: boolean
}

/** View = accounting read (Vouchers.View); Set/Edit/Reset = Vouchers.ManageOpeningBalances. False until loaded. */
export function useOpeningBalancePermissions(): OpeningBalancePermissions {
  const [state, setState] = useState<OpeningBalancePermissions>({ loaded: false, canView: false, canManage: false })

  useEffect(() => {
    let cancelled = false
    loadDotnetCurrentUser()
      .then((current) => {
        if (cancelled) return
        const granted = current?.info.permissions ?? []
        setState({ loaded: true, ...openingBalanceAccess(granted, isDotnetRootUser(granted)) })
      })
      .catch(() => !cancelled && setState({ loaded: true, canView: false, canManage: false }))
    return () => {
      cancelled = true
    }
  }, [])

  return state
}
