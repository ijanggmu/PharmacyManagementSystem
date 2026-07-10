"use client"

import { useQuery } from "@tanstack/react-query"
import { settingsApi } from "@/features/settings/api-client"

export interface SystemSetting {
  id: string
  key: string
  value: string
  type: "string" | "number" | "boolean" | "json"
  category: string | null
  description: string | null
  is_public: boolean
  created_at: string
  updated_at: string
}

export interface SystemSettingsMap {
  pharmacy_name: string
  pharmacy_address: string
  pharmacy_phone: string
  pharmacy_email: string
  tax_rate: number
  currency: string
  pharmacy_country: string
  low_stock_threshold: number
  expiry_warning_days: number
  enable_barcode: boolean
  enable_notifications: boolean
}

async function fetchSystemSettings(): Promise<SystemSetting[]> {
  const { data, error } = await settingsApi.list()
  if (error) throw new Error(error)
  return (data || []) as unknown as SystemSetting[]
}

export function useSystemSettings() {
  return useQuery({
    queryKey: ["system-settings"],
    queryFn: fetchSystemSettings,
    staleTime: 5 * 60 * 1000, // 5 minutes
    refetchOnWindowFocus: false,
  })
}

export function useSystemSetting(key: string) {
  const { data: settings, ...rest } = useSystemSettings()
  
  const setting = settings?.find((s) => s.key === key)
  
  const getValue = <T = string>(): T | undefined => {
    if (!setting) return undefined
    
    switch (setting.type) {
      case "number":
        return (Number.parseFloat(setting.value) as unknown as T) || undefined
      case "boolean":
        return (setting.value === "true" ? true : false) as T || undefined
      case "json":
        try {
          return JSON.parse(setting.value) as T
        } catch {
          return undefined
        }
      default:
        return (setting.value as unknown as T) || undefined
    }
  }

  return {
    ...rest,
    setting,
    value: getValue(),
  }
}

export function useSystemSettingsMap(): {
  data: SystemSettingsMap | undefined
  isLoading: boolean
  error: Error | null
} {
  const { data: settings, isLoading, error } = useSystemSettings()

  const settingsMap: SystemSettingsMap | undefined = settings
    ? {
        pharmacy_name: settings.find((s) => s.key === "pharmacy_name")?.value || "Pharmacy Management System",
        pharmacy_address: settings.find((s) => s.key === "pharmacy_address")?.value || "",
        pharmacy_phone: settings.find((s) => s.key === "pharmacy_phone")?.value || "",
        pharmacy_email: settings.find((s) => s.key === "pharmacy_email")?.value || "",
        tax_rate: Number.parseFloat(settings.find((s) => s.key === "tax_rate")?.value || "0.1"),
        currency: settings.find((s) => s.key === "currency")?.value || "USD",
        pharmacy_country: settings.find((s) => s.key === "pharmacy_country")?.value || "Nepal",
        low_stock_threshold: Number.parseFloat(settings.find((s) => s.key === "low_stock_threshold")?.value || "0.2"),
        expiry_warning_days: Number.parseInt(settings.find((s) => s.key === "expiry_warning_days")?.value || "30"),
        enable_barcode: settings.find((s) => s.key === "enable_barcode")?.value === "true",
        enable_notifications: settings.find((s) => s.key === "enable_notifications")?.value === "true",
      }
    : undefined

  return {
    data: settingsMap,
    isLoading,
    error: error as Error | null,
  }
}



