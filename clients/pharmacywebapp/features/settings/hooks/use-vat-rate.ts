"use client"

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query"
import { pharmacySettingsApi, type PharmacySettings } from "@/lib/api/pharmacy-settings-api"

/** One cache entry for the tenant's pharmacy settings; the VAT rate is selected from it. */
export const PHARMACY_SETTINGS_QUERY_KEY = ["reference", "pharmacy-settings"] as const

/** The tenant's VAT rate as a percent (e.g. 13), the same rate the server uses on the invoice. */
export function useVatRate() {
  return useQuery<PharmacySettings, Error, number>({
    queryKey: PHARMACY_SETTINGS_QUERY_KEY,
    queryFn: () => pharmacySettingsApi.get(),
    select: (settings) => settings.vatRatePercent,
    staleTime: 5 * 60 * 1000,
    refetchOnWindowFocus: false,
    retry: 1,
  })
}

export function useUpdateVatRate() {
  const queryClient = useQueryClient()
  return useMutation<PharmacySettings, Error, number>({
    mutationFn: (vatRatePercent) => pharmacySettingsApi.updateVatRate(vatRatePercent),
    onSettled: () => queryClient.invalidateQueries({ queryKey: PHARMACY_SETTINGS_QUERY_KEY }),
  })
}
