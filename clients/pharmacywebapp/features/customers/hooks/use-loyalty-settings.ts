"use client"

import { useMemo } from "react"
import { useSystemSettings } from "@/features/settings/hooks/use-system-settings"
import { parseLoyaltySettings, type LoyaltySettings } from "@/features/customers/lib/loyalty"

/** The tenant's loyalty programme (off until enabled in Settings → Loyalty). */
export function useLoyaltySettings(): { settings: LoyaltySettings; isLoading: boolean } {
  const { data, isLoading } = useSystemSettings()
  const settings = useMemo(() => parseLoyaltySettings(data), [data])
  return { settings, isLoading }
}
