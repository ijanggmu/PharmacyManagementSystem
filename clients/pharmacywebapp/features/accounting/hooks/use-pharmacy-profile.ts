"use client"

import { useMemo } from "react"
import { useQuery } from "@tanstack/react-query"
import { useSystemSettings } from "@/features/settings/hooks/use-system-settings"
import { PHARMACY_SETTINGS_QUERY_KEY } from "@/features/settings/hooks/use-vat-rate"
import { pharmacySettingsApi } from "@/lib/api/pharmacy-settings-api"
import type { PrintProfile } from "@/features/accounting/lib/voucher-print"

interface LocalPharmacySettings {
  pharmacyName?: string
  pharmacyAddress?: string
  pharmacyPhone?: string
  pharmacyEmail?: string
}

/** The settings page also keeps name/address/phone/email in localStorage; used as a fallback. */
function readLocalSettings(): LocalPharmacySettings {
  if (typeof window === "undefined") return {}
  try {
    const raw = window.localStorage.getItem("pharmacy-settings")
    if (!raw) return {}
    const parsed: unknown = JSON.parse(raw)
    return parsed && typeof parsed === "object" ? (parsed as LocalPharmacySettings) : {}
  } catch {
    return {}
  }
}

function pick(...values: (string | null | undefined)[]): string | null {
  for (const v of values) {
    const t = (v ?? "").trim()
    if (t) return t
  }
  return null
}

/**
 * Pharmacy letterhead for printed documents. Reads the tenant settings store (pharmacy_name,
 * pharmacy_address, pharmacy_phone, pharmacy_email, pharmacy.legal_name, pharmacy.vat_number),
 * then the pharmacy profile (business name, address, phone, email: Settings → Pharmacy profile, seeded with the
 * name the pharmacy signed up under), the locally saved settings, and finally a generic name.
 */
export function usePharmacyProfile(): { profile: PrintProfile; isLoading: boolean } {
  const { data, isLoading } = useSystemSettings()
  const business = useQuery({
    queryKey: PHARMACY_SETTINGS_QUERY_KEY,
    queryFn: () => pharmacySettingsApi.get(),
    staleTime: 5 * 60 * 1000,
    refetchOnWindowFocus: false,
    retry: 1,
  })
  const biz = business.data

  const profile = useMemo<PrintProfile>(() => {
    const byKey = new Map((data ?? []).map((s) => [s.key, s.value] as const))
    const local = readLocalSettings()
    const legalName = pick(byKey.get("pharmacy.legal_name"))
    const name = pick(byKey.get("pharmacy_name"), biz?.businessName, local.pharmacyName, legalName) ?? "Pharmacy"
    return {
      name,
      legalName,
      address: pick(byKey.get("pharmacy_address"), biz?.businessAddress, local.pharmacyAddress),
      phone: pick(byKey.get("pharmacy_phone"), biz?.businessPhone, local.pharmacyPhone),
      email: pick(byKey.get("pharmacy_email"), biz?.businessEmail, local.pharmacyEmail),
      panVat: pick(byKey.get("pharmacy.vat_number"), byKey.get("pharmacy.pan_number")),
    }
  }, [data, biz])

  return { profile, isLoading: isLoading || business.isLoading }
}
