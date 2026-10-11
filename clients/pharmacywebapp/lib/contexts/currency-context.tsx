"use client"

import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState, type ReactNode } from "react"
import { usePathname } from "next/navigation"
import { settingsApi } from "@/features/settings/api-client"
import {
  DEFAULT_CURRENCY,
  findSupportedCurrency,
  formatMoney,
  type Currency,
  type FormatMoneyOptions,
} from "@/lib/currency/money"

export { formatMoney, SUPPORTED_CURRENCIES, type Currency, type FormatMoneyOptions } from "@/lib/currency/money"

const CURRENCY_SETTING_KEY = "pharmacy.currency"
const LOCAL_CACHE_KEY = "pharmacy-currency"

/** Only signed-in app pages may read (or write) the tenant's settings; public pages never call the API. */
function isTenantAppPath(pathname: string | null): boolean {
  return pathname === "/dashboard" || (pathname?.startsWith("/dashboard/") ?? false)
}

function readCachedCurrency(): Currency | undefined {
  try {
    const raw = localStorage.getItem(LOCAL_CACHE_KEY)
    if (!raw) return undefined
    const parsed: unknown = JSON.parse(raw)
    const code = typeof parsed === "object" && parsed !== null && "code" in parsed ? (parsed as { code: unknown }).code : undefined
    return typeof code === "string" ? findSupportedCurrency(code) : undefined
  } catch {
    return undefined
  }
}

function writeCachedCurrency(currency: Currency): void {
  try {
    localStorage.setItem(LOCAL_CACHE_KEY, JSON.stringify({ code: currency.code }))
  } catch {
    // storage unavailable (private mode) — the in-memory value still applies
  }
}

interface CurrencyContextType {
  currentCurrency: Currency
  /** Explicit user choice (settings page): applies locally and persists to the tenant setting. */
  setCurrency: (currency: Currency) => void
  formatCurrency: (amount: number | string, options?: FormatMoneyOptions) => string
  getCurrencySymbol: () => string
}

const CurrencyContext = createContext<CurrencyContextType | undefined>(undefined)

export function CurrencyProvider({ children }: { children: ReactNode }) {
  // Always start from the default so the server render and the first client render match (no
  // hydration mismatch); the cached / tenant value is applied in effects after mount.
  const [currentCurrency, setCurrentCurrency] = useState<Currency>(DEFAULT_CURRENCY)
  const pathname = usePathname()
  const inTenantApp = isTenantAppPath(pathname)
  const backendLoaded = useRef(false)

  useEffect(() => {
    const cached = readCachedCurrency()
    if (cached) setCurrentCurrency(cached)
  }, [])

  useEffect(() => {
    // The .NET tenant settings KV store is the source of truth across devices. Read it once, and only
    // inside the signed-in app: public pages have no session and must not touch tenant settings.
    if (!inTenantApp || backendLoaded.current) return
    backendLoaded.current = true
    let cancelled = false
    void settingsApi.getByKey(CURRENCY_SETTING_KEY).then(({ value, error }) => {
      if (cancelled || error || !value) return
      const found = findSupportedCurrency(value)
      if (!found) return
      setCurrentCurrency(found)
      writeCachedCurrency(found)
    })
    return () => {
      cancelled = true
      backendLoaded.current = false
    }
  }, [inTenantApp])

  const setCurrency = useCallback(
    (currency: Currency) => {
      const supported = findSupportedCurrency(currency.code)
      if (!supported) return
      setCurrentCurrency(supported)
      writeCachedCurrency(supported)
      // Persist only an explicit choice made inside the signed-in app — never from a public page.
      if (!isTenantAppPath(pathname)) return
      void settingsApi.upsert(CURRENCY_SETTING_KEY, supported.code).then(({ error }) => {
        if (error) {
          // eslint-disable-next-line no-console
          console.error("Failed to persist currency setting to the backend:", error)
        }
      })
    },
    [pathname],
  )

  const value = useMemo<CurrencyContextType>(
    () => ({
      currentCurrency,
      setCurrency,
      formatCurrency: (amount, options) => formatMoney(amount, currentCurrency, options),
      getCurrencySymbol: () => currentCurrency.symbol,
    }),
    [currentCurrency, setCurrency],
  )

  return <CurrencyContext.Provider value={value}>{children}</CurrencyContext.Provider>
}

export function useCurrency() {
  const context = useContext(CurrencyContext)
  if (context === undefined) {
    throw new Error("useCurrency must be used within a CurrencyProvider")
  }
  return context
}
