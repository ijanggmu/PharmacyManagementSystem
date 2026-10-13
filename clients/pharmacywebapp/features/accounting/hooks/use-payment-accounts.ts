"use client"

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query"
import { paymentAccountsApi } from "@/features/accounting/api-client-payment-accounts"
import { resolvedPaymentAccount, type PaymentMethodAccountInput } from "@/features/accounting/lib/payment-accounts"
import { ACCOUNTING_ROOT_KEY } from "./use-vouchers"

export const paymentAccountKeys = {
  all: [...ACCOUNTING_ROOT_KEY, "payment-method-accounts"] as const,
}

/** The tenant's payment-method → account mapping (every method, defaults included). */
export function usePaymentMethodAccounts(enabled = true) {
  return useQuery({
    queryKey: paymentAccountKeys.all,
    queryFn: () => paymentAccountsApi.list(),
    enabled,
    staleTime: 60_000,
    // A user without Accounts.View gets 403 — help text then falls back to the defaults; don't retry it.
    retry: false,
  })
}

/** Where a method's money posts, for help text — the tenant's mapping once loaded, the default until then. */
export function usePaymentAccountFor(method: string): { code: string; name: string } {
  const { data } = usePaymentMethodAccounts()
  return resolvedPaymentAccount(method, data)
}

export interface CreateCashBankAccountVars {
  name: string
  /** One per submit, so a retried create is replayed instead of adding a second account. */
  idempotency_key: string
}

/** Save the mapping / add a bank account. Per-call data goes through mutate(arg). */
export function usePaymentAccountMutations() {
  const qc = useQueryClient()

  const update = useMutation({
    mutationFn: (mappings: PaymentMethodAccountInput[]) => paymentAccountsApi.update(mappings),
    onSuccess: (rows) => qc.setQueryData(paymentAccountKeys.all, rows),
  })

  const createBankAccount = useMutation({
    mutationFn: ({ name, idempotency_key }: CreateCashBankAccountVars) => paymentAccountsApi.createCashBankAccount(name, idempotency_key),
  })

  return { update, createBankAccount }
}
