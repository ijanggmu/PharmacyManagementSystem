"use client"

import { useEffect, useState } from "react"
import { keepPreviousData, useMutation, useQuery, useQueryClient } from "@tanstack/react-query"
import { customerPaymentsApi, searchCustomerPayers } from "@/features/customer-payments/api-client"
import { suppliersApi } from "@/features/suppliers/api-client"
import { supplierPaymentsApi } from "@/features/suppliers/api-client-payments"
import { ACCOUNTING_ROOT_KEY } from "@/features/accounting/hooks/use-vouchers"
import type { PaymentKind } from "@/features/accounting/lib/payment-form"
import type { PartyPaymentMethod } from "@/features/accounting/lib/payment-methods"

/** A customer (receipt) or supplier (payment) with what is outstanding on their sub-ledger. */
export interface PaymentParty {
  id: string
  name: string
  detail: string | null
  /** Positive = open balance (customer owes us / we owe the supplier). */
  outstanding: number
}

export const PARTY_SEARCH_PAGE_SIZE = 25

/** Debounces a value; the party search waits for typing to settle before it queries. */
function useDebounced<T>(value: T, ms: number): T {
  const [debounced, setDebounced] = useState(value)
  useEffect(() => {
    const t = setTimeout(() => setDebounced(value), ms)
    return () => clearTimeout(t)
  }, [value, ms])
  return debounced
}

async function searchParties(kind: PaymentKind, term: string): Promise<{ items: PaymentParty[]; total: number }> {
  if (kind === "receipt") {
    const res = await searchCustomerPayers(term, PARTY_SEARCH_PAGE_SIZE)
    return { items: res.items.map((c) => ({ id: c.id, name: c.name, detail: c.phone, outstanding: c.outstanding })), total: res.total }
  }
  const res = await suppliersApi.getSuppliers({ limit: PARTY_SEARCH_PAGE_SIZE, page: 1, status: "all", search: term || undefined })
  if (res.error) throw new Error(res.error)
  return {
    items: res.data.map((s) => ({
      id: s.id,
      name: s.name,
      detail: s.phone ?? s.contact_person ?? null,
      outstanding: Number(s.payable_amount ?? 0),
    })),
    total: res.total ?? res.data.length,
  }
}

/** Server-side party search for the payment dialog: one bounded page, debounced, cached per term. */
export function usePaymentPartySearch(kind: PaymentKind, term: string, enabled: boolean) {
  const debounced = useDebounced(term.trim(), 300)
  return useQuery({
    queryKey: [...ACCOUNTING_ROOT_KEY, "payment-parties", kind, debounced] as const,
    queryFn: () => searchParties(kind, debounced),
    enabled,
    staleTime: 30_000,
    placeholderData: keepPreviousData,
  })
}

export interface RecordPaymentVars {
  kind: PaymentKind
  partyId: string
  amount: number
  method: PartyPaymentMethod
  date: string
  referenceNote: string | null
  /** Supplier payments only: apply to this bill. Null settles the oldest open bills first. */
  bill?: { referenceType: string; referenceId: string } | null
  /** Supplier payments only: TDS withheld from the payment (see tdsPaymentRequest). */
  tds?: { tdsAmount: number; tdsCategory: string; tdsRatePercent: number | null; tdsTaxableAmount: number } | null
  /** Idempotency-Key for this submit (customer receipts and supplier payments), reused when the same payment is retried. */
  idempotencyKey?: string
}

/**
 * Records a customer receipt or supplier payment through the existing Customers/Suppliers payment
 * endpoints (which raise the events that post the GL voucher), then refreshes accounting, customer
 * and supplier data. Per-call data travels through `mutate(vars)`.
 */
export function useRecordPartyPayment() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: async (v: RecordPaymentVars) => {
      if (v.kind === "receipt") {
        await customerPaymentsApi.post({
          customer_id: v.partyId,
          amount: v.amount,
          payment_method: v.method,
          payment_date: v.date,
          reference_note: v.referenceNote,
          allocations: null,
          idempotency_key: v.idempotencyKey,
        })
      } else {
        await supplierPaymentsApi.post({
          supplier_id: v.partyId,
          amount: v.amount,
          payment_method: v.method,
          payment_date: v.date,
          reference_note: v.referenceNote,
          allow_overpayment: true,
          bill: v.bill ? { reference_type: v.bill.referenceType, reference_id: v.bill.referenceId } : null,
          tds: v.tds ?? null,
          idempotency_key: v.idempotencyKey,
        })
      }
    },
    onSuccess: (_data, v) =>
      Promise.all([
        qc.invalidateQueries({ queryKey: ACCOUNTING_ROOT_KEY }),
        qc.invalidateQueries({ queryKey: [v.kind === "receipt" ? "customers" : "suppliers"] }),
      ]),
  })
}

export interface VoidPaymentVars {
  kind: PaymentKind
  partyId: string
  paymentId: string
  reason: string
  /** Idempotency-Key for this void, reused when the same void is retried. */
  idempotencyKey?: string
}

/**
 * Voids a customer receipt or supplier payment (reversing ledger entry + GL voucher reversal), then refreshes
 * accounting, customer and supplier data. Per-call data travels through `mutate(vars)`.
 */
export function useVoidPartyPayment() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: async (v: VoidPaymentVars) => {
      if (v.kind === "receipt") {
        await customerPaymentsApi.void({
          customer_id: v.partyId,
          payment_id: v.paymentId,
          reason: v.reason,
          idempotency_key: v.idempotencyKey,
        })
      } else {
        await supplierPaymentsApi.void({
          supplier_id: v.partyId,
          payment_id: v.paymentId,
          reason: v.reason,
          idempotency_key: v.idempotencyKey,
        })
      }
    },
    onSuccess: (_data, v) =>
      Promise.all([
        qc.invalidateQueries({ queryKey: ACCOUNTING_ROOT_KEY }),
        qc.invalidateQueries({ queryKey: [v.kind === "receipt" ? "customers" : "suppliers"] }),
      ]),
  })
}
