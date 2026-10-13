"use client"

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query"
import { getIrdSettings, updateIrdSettings, type IrdSettings, type IrdSettingsInput } from "@/lib/api/ird-api"

export const IRD_SETTINGS_QUERY_KEY = ["sales", "ird-settings"] as const

/** The tenant's IRD CBMS e-billing settings (no secrets). The POS uses it for the abbreviated-invoice threshold. */
export function useIrdSettings(options: { enabled?: boolean } = {}) {
  return useQuery<IrdSettings>({
    queryKey: IRD_SETTINGS_QUERY_KEY,
    queryFn: () => getIrdSettings(),
    enabled: options.enabled ?? true,
    staleTime: 5 * 60 * 1000,
    refetchOnWindowFocus: false,
    retry: 1,
  })
}

export function useUpdateIrdSettings() {
  const queryClient = useQueryClient()
  return useMutation<IrdSettings, Error, IrdSettingsInput>({
    mutationFn: (input) => updateIrdSettings(input),
    onSuccess: (saved) => {
      queryClient.setQueryData(IRD_SETTINGS_QUERY_KEY, saved)
    },
  })
}
