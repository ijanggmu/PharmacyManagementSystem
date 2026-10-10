"use client"

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query"
import {
  paymentSettingsApi,
  type FonepayQr,
  type FonepayQrStatus,
  type PaymentSettings,
  type PaymentSettingsInput,
} from "@/lib/api/payment-settings-api"

export const PAYMENT_SETTINGS_QUERY_KEY = ["sales", "payment-settings"] as const

/** `data === null` means the API has no payment settings yet (treated as "not configured"). */
export function usePaymentSettings(options: { enabled?: boolean } = {}) {
  return useQuery<PaymentSettings | null>({
    queryKey: PAYMENT_SETTINGS_QUERY_KEY,
    queryFn: () => paymentSettingsApi.get(),
    enabled: options.enabled ?? true,
    staleTime: 5 * 60 * 1000,
    refetchOnWindowFocus: false,
    retry: 1,
  })
}

export function useUpdatePaymentSettings() {
  const queryClient = useQueryClient()
  return useMutation<PaymentSettings, Error, PaymentSettingsInput>({
    mutationFn: (input) => paymentSettingsApi.update(input),
    onSuccess: (saved) => {
      queryClient.setQueryData(PAYMENT_SETTINGS_QUERY_KEY, saved)
    },
  })
}

export function useCreateFonepayQr() {
  return useMutation<FonepayQr, Error, { amount: number; remarks1?: string; remarks2?: string }>({
    mutationFn: (input) => paymentSettingsApi.createFonepayQr(input),
  })
}

export const FONEPAY_POLL_INTERVAL_MS = 3_000
export const FONEPAY_POLL_TIMEOUT_MS = 5 * 60 * 1000

/**
 * Polls a Fonepay QR every 3 s until it succeeds, fails or `startedAt` is 5 minutes old. Unmounting
 * the caller (dialog closed, leg removed) stops polling because the query has no observers.
 */
export function useFonepayQrStatus(prn: string | null, startedAt: number | null) {
  return useQuery<FonepayQrStatus>({
    queryKey: ["sales", "fonepay-qr-status", prn],
    queryFn: () => paymentSettingsApi.getFonepayQrStatus(prn as string),
    enabled: Boolean(prn),
    gcTime: 0,
    retry: 2,
    refetchOnWindowFocus: false,
    refetchIntervalInBackground: true,
    refetchInterval: (query) => {
      const status = query.state.data?.status
      if (status === "success" || status === "failed") return false
      if (startedAt !== null && Date.now() - startedAt > FONEPAY_POLL_TIMEOUT_MS) return false
      return FONEPAY_POLL_INTERVAL_MS
    },
  })
}
