"use client"

import { useMemo } from "react"
import { useSystemSettings } from "@/features/settings/hooks/use-system-settings"
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
 * falling back to the locally saved settings and finally a generic name.
 */
export function usePharmacyProfile(): { profile: PrintProfile; isLoading: boolean } {
  const { data, isLoading } = useSystemSettings()

  const profile = useMemo<PrintProfile>(() => {
    const byKey = new Map((data ?? []).map((s) => [s.key, s.value] as const))
    const local = readLocalSettings()
    const legalName = pick(byKey.get("pharmacy.legal_name"))
    const name = pick(byKey.get("pharmacy_name"), local.pharmacyName, legalName) ?? "Pharmacy"
    return {
      name,
      legalName,
      address: pick(byKey.get("pharmacy_address"), local.pharmacyAddress),
      phone: pick(byKey.get("pharmacy_phone"), local.pharmacyPhone),
      email: pick(byKey.get("pharmacy_email"), local.pharmacyEmail),
      panVat: pick(byKey.get("pharmacy.vat_number"), byKey.get("pharmacy.pan_number")),
    }
  }, [data])

  return { profile, isLoading }
}
