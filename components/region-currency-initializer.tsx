"use client"

import { useLayoutEffect } from "react"
import { SUPPORTED_CURRENCIES, useCurrency } from "@/lib/contexts/currency-context"

function detectCurrencyCode(): string | null {
  try {
    const lang = typeof navigator !== "undefined" ? navigator.language?.toLowerCase() : ""
    const tz = typeof Intl !== "undefined" ? Intl.DateTimeFormat().resolvedOptions().timeZone : ""

    // Nepal: Asia/Kathmandu and/or Nepali locale (ne-NP / en-NP)
    if (tz?.toLowerCase().includes("kathmandu")) return "NPR"
    if (lang?.endsWith("-np") || lang?.includes("np") || lang?.startsWith("ne-")) return "NPR"

    // India: common locale patterns
    if (lang?.endsWith("-in") || lang?.includes("-in") || tz?.toLowerCase().includes("kolkata")) return "INR"

    return null
  } catch {
    return null
  }
}

export function RegionCurrencyInitializer() {
  const { setCurrency } = useCurrency()

  useLayoutEffect(() => {
    // Do not override user's existing selection.
    const savedCurrency = localStorage.getItem("pharmacy-currency")
    if (savedCurrency) return

    const detected = detectCurrencyCode()
    if (!detected) return

    const currency = SUPPORTED_CURRENCIES.find((c) => c.code === detected)
    if (!currency) return

    setCurrency(currency)
  }, [setCurrency])

  return null
}

