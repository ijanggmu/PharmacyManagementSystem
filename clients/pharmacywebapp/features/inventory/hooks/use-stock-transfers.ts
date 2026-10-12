"use client"

import { keepPreviousData, useMutation, useQuery, useQueryClient } from "@tanstack/react-query"
import { stockTransfersApi, type StockTransfer } from "@/features/inventory/api-client-stock-transfers"

export const stockTransferKeys = {
  all: ["stock-transfers"] as const,
  list: (params: StockTransferListParams) => ["stock-transfers", "list", params] as const,
  count: (params: { branchId?: string; status?: StockTransfer["status"] }) => ["stock-transfers", "count", params] as const,
}

export interface StockTransferListParams {
  pageNumber: number
  pageSize: number
  status?: StockTransfer["status"]
  branchId?: string
}

/** One server page of transfers. Keeps the previous page on screen while the next one loads. */
export function useStockTransfers(params: StockTransferListParams) {
  return useQuery({
    queryKey: stockTransferKeys.list(params),
    queryFn: async () => {
      const result = await stockTransfersApi.list(params)
      if (result.error) throw new Error(result.error)
      return result
    },
    placeholderData: keepPreviousData,
  })
}

/** Server-side total for a status (e.g. how many are still in transit), independent of the current page. */
export function useStockTransferCount(params: { branchId?: string; status?: StockTransfer["status"] }) {
  return useQuery({
    queryKey: stockTransferKeys.count(params),
    queryFn: () => stockTransfersApi.count(params),
    staleTime: 30 * 1000,
  })
}

function useInvalidateTransfers() {
  const queryClient = useQueryClient()
  return () => queryClient.invalidateQueries({ queryKey: stockTransferKeys.all })
}

/**
 * Mutation variables carry the Idempotency-Key of the user action (golden rule 9: per-call data goes through
 * mutate(vars), never through state the callbacks close over). Callers keep one key per action with
 * createIdempotencyKeyTracker and reuse it when the same action is retried, so a retry is applied once.
 */
export function useCreateStockTransfer() {
  const invalidate = useInvalidateTransfers()
  return useMutation({
    mutationFn: async ({ idempotencyKey, ...input }: Parameters<typeof stockTransfersApi.create>[0] & { idempotencyKey?: string }) => {
      const result = await stockTransfersApi.create(input, idempotencyKey)
      if (result.error) throw new Error(result.error)
      return result.data
    },
    onSuccess: invalidate,
  })
}

export function useReceiveStockTransfer() {
  const invalidate = useInvalidateTransfers()
  return useMutation({
    mutationFn: async ({ id, idempotencyKey }: { id: string; idempotencyKey?: string }) => {
      const result = await stockTransfersApi.receive(id, idempotencyKey)
      if (result.error) throw new Error(result.error)
    },
    onSuccess: invalidate,
  })
}

export function useCancelStockTransfer() {
  const invalidate = useInvalidateTransfers()
  return useMutation({
    mutationFn: async ({ id, reason, idempotencyKey }: { id: string; reason: string; idempotencyKey?: string }) => {
      const result = await stockTransfersApi.cancel(id, reason, idempotencyKey)
      if (result.error) throw new Error(result.error)
    },
    onSuccess: invalidate,
  })
}
