"use client"

import { keepPreviousData, useMutation, useQuery, useQueryClient } from "@tanstack/react-query"
import { loadDotnetCurrentUser } from "@/lib/api/auth-api"
import { currentUserQueryKey } from "@/features/branches/hooks/use-branch-access"
import { chequesApi } from "@/features/accounting/api-client-cheques"
import type { ChequeAction, ChequeFilters } from "@/features/accounting/lib/cheques"
import { ACCOUNTING_ROOT_KEY } from "./use-vouchers"

export const chequeKeys = {
  all: [...ACCOUNTING_ROOT_KEY, "cheques"] as const,
  list: (filters: ChequeFilters, branchId: string | null) => [...ACCOUNTING_ROOT_KEY, "cheques", "list", filters, branchId] as const,
  detail: (id: string) => [...ACCOUNTING_ROOT_KEY, "cheques", "detail", id] as const,
}

/** The cheque register page for the filters (branch "" / null = the API's default scope). */
export function useCheques(filters: ChequeFilters, branchId: string | null, enabled = true) {
  return useQuery({
    queryKey: chequeKeys.list(filters, branchId),
    queryFn: () => chequesApi.search(filters, branchId),
    enabled,
    staleTime: 30_000,
    placeholderData: keepPreviousData,
  })
}

/** One cheque with its status history (the detail sheet). */
export function useCheque(id: string | null) {
  return useQuery({
    queryKey: chequeKeys.detail(id ?? ""),
    queryFn: () => chequesApi.get(id as string),
    enabled: !!id,
  })
}

/** The signed-in user's permissions, for showing only the register actions they may run (the API checks too). */
export function useGrantedPermissions(): readonly string[] {
  const user = useQuery({
    queryKey: currentUserQueryKey,
    queryFn: () => loadDotnetCurrentUser(),
    staleTime: 5 * 60 * 1000,
  })
  return user.data?.info.permissions ?? NO_PERMISSIONS
}

const NO_PERMISSIONS: readonly string[] = []

export interface ChequeActionVars {
  action: ChequeAction
  id: string
  /** Deposit / clearance date ("yyyy-MM-dd"); ignored by bounce and cancel. */
  date: string
  bankAccountId: string | null
  note: string
  /** Required for bounce and cancel. */
  reason: string
  /** One per action the user submits, reused when the same action is retried. */
  idempotencyKey: string
}

/**
 * Runs a register action; everything per call travels through mutate(vars). A clearance posts a voucher and a
 * bounce / cancellation voids a payment, so every accounting query is refreshed, and the party ledgers too.
 */
export function useChequeAction() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (v: ChequeActionVars) => {
      switch (v.action) {
        case "deposit":
          return chequesApi.deposit(v.id, { date: v.date, bank_account_id: v.bankAccountId, note: v.note }, v.idempotencyKey)
        case "clear":
          return chequesApi.clear(v.id, { date: v.date, bank_account_id: v.bankAccountId, note: v.note }, v.idempotencyKey)
        case "bounce":
          return chequesApi.bounce(v.id, v.reason, v.idempotencyKey)
        case "cancel":
          return chequesApi.cancel(v.id, v.reason, v.idempotencyKey)
      }
    },
    onSuccess: (_row, v) =>
      Promise.all([
        qc.invalidateQueries({ queryKey: ACCOUNTING_ROOT_KEY }),
        ...(v.action === "bounce" || v.action === "cancel"
          ? [qc.invalidateQueries({ queryKey: ["customers"] }), qc.invalidateQueries({ queryKey: ["suppliers"] })]
          : []),
      ]),
  })
}
