"use client"

import { useEffect, useState } from "react"
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query"
import {
  supplierPriceListAccess,
  supplierPriceListApi,
  type SupplierPriceListInput,
} from "@/features/suppliers/api-client-price-list"
import { supplierKeys } from "@/features/suppliers/hooks/use-suppliers"
import { loadDotnetCurrentUser } from "@/lib/api/auth-api"
import { isDotnetRootUser } from "@/lib/api/dotnet-permissions"

export const supplierPriceListKeys = {
  all: (supplierId: string) => [...supplierKeys.detail(supplierId), "price-list"] as const,
  /** Lookup results live outside the supplier's detail key so a list refresh doesn't drop them. */
  prices: (supplierId: string, medicineIds: readonly string[], asOf: string) =>
    ["suppliers", "price-lookup", supplierId, asOf, [...medicineIds].sort()] as const,
}

export function useSupplierPriceList(supplierId: string, enabled = true) {
  return useQuery({
    queryKey: supplierPriceListKeys.all(supplierId),
    queryFn: async () => {
      const res = await supplierPriceListApi.list(supplierId)
      if (res.error) throw new Error(res.error)
      return res.data
    },
    enabled: enabled && !!supplierId,
  })
}

/** Per-call data goes through mutate(arg): the row and the key of this save. */
export function useSaveSupplierPrice(supplierId: string) {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: async ({ input, idempotencyKey }: { input: SupplierPriceListInput; idempotencyKey: string }) => {
      const res = await supplierPriceListApi.save(supplierId, input, idempotencyKey)
      if (res.error || !res.data) throw new Error(res.error ?? "Failed to save the price")
      return res.data
    },
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: supplierPriceListKeys.all(supplierId) })
      void queryClient.invalidateQueries({ queryKey: ["suppliers", "price-lookup", supplierId] })
    },
  })
}

export function useRemoveSupplierPrice(supplierId: string) {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: async ({ itemId, idempotencyKey }: { itemId: string; idempotencyKey: string }) => {
      const res = await supplierPriceListApi.remove(supplierId, itemId, idempotencyKey)
      if (res.error) throw new Error(res.error)
    },
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: supplierPriceListKeys.all(supplierId) })
      void queryClient.invalidateQueries({ queryKey: ["suppliers", "price-lookup", supplierId] })
    },
  })
}

/** The supplier's price valid on `asOf` for each medicine, as a map by medicine id. */
export function useSupplierPrices(supplierId: string, medicineIds: readonly string[], asOf: string, enabled = true) {
  const ids = [...new Set(medicineIds.filter(Boolean))]
  return useQuery({
    queryKey: supplierPriceListKeys.prices(supplierId, ids, asOf),
    queryFn: async () => {
      const res = await supplierPriceListApi.lookup(supplierId, ids, asOf)
      if (res.error) throw new Error(res.error)
      return new Map(res.data.map((p) => [p.medicine_id, p]))
    },
    enabled: enabled && !!supplierId && ids.length > 0 && !!asOf,
    staleTime: 60 * 1000,
    // A prefill aid: without PriceLists.View (403) or on a blip the order form just keeps its own rates.
    retry: false,
  })
}

export interface SupplierPriceListPermissions {
  loaded: boolean
  canView: boolean
  canManage: boolean
}

export function useSupplierPriceListPermissions(): SupplierPriceListPermissions {
  const [state, setState] = useState<SupplierPriceListPermissions>({ loaded: false, canView: false, canManage: false })

  useEffect(() => {
    let cancelled = false
    loadDotnetCurrentUser()
      .then((current) => {
        if (cancelled) return
        const granted = current?.info.permissions ?? []
        setState({ loaded: true, ...supplierPriceListAccess(granted, isDotnetRootUser(granted)) })
      })
      .catch(() => !cancelled && setState({ loaded: true, canView: false, canManage: false }))
    return () => {
      cancelled = true
    }
  }, [])

  return state
}
