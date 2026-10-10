"use client"

import React, { createContext, useContext, useState, useEffect, ReactNode } from "react"
import { settingsApi } from "@/features/settings/api-client"

const CURRENCY_SETTING_KEY = "pharmacy.currency"

export interface Currency {
  code: string
  symbol: string
  name: string
  position: "before" | "after"
  minorDigits?: number
}

export const SUPPORTED_CURRENCIES: Currency[] = [
  // NPR is charged to the paisa (1/100), so it must also display to the paisa: a रू 44.10 bill
  // showing as "रू44" while 44.10 is collected is a real cash-drawer discrepancy.
  { code: "NPR", symbol: "रू", name: "Nepalese Rupee", position: "before", minorDigits: 2 },
  { code: "USD", symbol: "$", name: "US Dollar", position: "before", minorDigits: 2 },
  { code: "EUR", symbol: "€", name: "Euro", position: "before", minorDigits: 2 },
  { code: "GBP", symbol: "£", name: "British Pound", position: "before", minorDigits: 2 },
  { code: "INR", symbol: "₹", name: "Indian Rupee", position: "before", minorDigits: 2 },
  { code: "CAD", symbol: "C$", name: "Canadian Dollar", position: "before", minorDigits: 2 },
]

export interface FormatMoneyOptions {
  /** Override the currency's minor digits, e.g. 0 for a compact whole-rupee figure. */
  fractionDigits?: number
}

/** Pure formatter behind `formatCurrency`; exported for tests and non-React callers. */
export function formatMoney(amount: number | string, currency: Currency, options: FormatMoneyOptions = {}): string {
  const numAmount = typeof amount === "string" ? parseFloat(amount) : amount
  const digits = options.fractionDigits ?? currency.minorDigits ?? 2
  const safe = Number.isFinite(numAmount) ? numAmount : 0
  // Round in minor units first so 44.099999 renders as 44.10, never 44.09, and -0 never shows.
  const factor = 10 ** digits
  const rounded = Math.round((safe + Math.sign(safe) * Number.EPSILON) * factor) / factor || 0
  const formatted = rounded.toLocaleString("en-US", {
    minimumFractionDigits: digits,
    maximumFractionDigits: digits,
  })
  return currency.position === "before" ? `${currency.symbol}${formatted}` : `${formatted} ${currency.symbol}`
}

interface CurrencyContextType {
  currentCurrency: Currency
  setCurrency: (currency: Currency) => void
  formatCurrency: (amount: number | string, options?: FormatMoneyOptions) => string
  getCurrencySymbol: () => string
}

const CurrencyContext = createContext<CurrencyContextType | undefined>(undefined)

export function CurrencyProvider({ children }: { children: ReactNode }) {
  const [currentCurrency, setCurrentCurrency] = useState<Currency>(() => {
    // Avoid “flash” to default currency on first paint.
    if (typeof window === "undefined") return SUPPORTED_CURRENCIES[0]
    const savedCurrency = localStorage.getItem("pharmacy-currency")
    if (savedCurrency) {
      try {
        const parsed = JSON.parse(savedCurrency)
        const found = SUPPORTED_CURRENCIES.find((c) => c.code === parsed.code)
        if (found) return found
      } catch {
        // ignore invalid saved currency
      }
    }
    return SUPPORTED_CURRENCIES[0]
  })
 
  useEffect(() => {
    // Keep existing effect as a safety net in case storage changes after initial render.
    const savedCurrency = localStorage.getItem("pharmacy-currency")
    if (!savedCurrency) return
    try {
      const parsed = JSON.parse(savedCurrency)
      const found = SUPPORTED_CURRENCIES.find((c) => c.code === parsed.code)
      if (found) setCurrentCurrency(found)
    } catch {
      // ignore
    }
  }, [])

  useEffect(() => {
    // The .NET tenant settings KV store is the source of truth across devices/sessions;
    // localStorage above is just a fast client-side cache to avoid a flash on first paint.
    settingsApi.getByKey(CURRENCY_SETTING_KEY).then(({ value, error }) => {
      if (error || !value) return
      const found = SUPPORTED_CURRENCIES.find((c) => c.code === value)
      if (found) {
        setCurrentCurrency(found)
        localStorage.setItem("pharmacy-currency", JSON.stringify(found))
      }
    })
  }, [])

  const setCurrency = (currency: Currency) => {
    setCurrentCurrency(currency)
    localStorage.setItem("pharmacy-currency", JSON.stringify(currency))
    void settingsApi.upsert(CURRENCY_SETTING_KEY, currency.code).then(({ error }) => {
      if (error) {
        // eslint-disable-next-line no-console
        console.error("Failed to persist currency setting to the backend:", error)
      }
    })
  }

  const formatCurrency = (amount: number | string, options?: FormatMoneyOptions): string =>
    formatMoney(amount, currentCurrency, options)

  const getCurrencySymbol = (): string => {
    return currentCurrency.symbol
  }

  return (
    <CurrencyContext.Provider
      value={{
        currentCurrency,
        setCurrency,
        formatCurrency,
        getCurrencySymbol,
      }}
    >
      {children}
    </CurrencyContext.Provider>
  )
}

export function useCurrency() {
  const context = useContext(CurrencyContext)
  if (context === undefined) {
    throw new Error("useCurrency must be used within a CurrencyProvider")
  }
  return context
}
