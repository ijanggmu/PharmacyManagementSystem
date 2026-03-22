"use client"

import React, { createContext, useContext, useState, useEffect, ReactNode } from "react"

export interface Currency {
  code: string
  symbol: string
  name: string
  position: "before" | "after"
  minorDigits?: number
}

export const SUPPORTED_CURRENCIES: Currency[] = [
  { code: "NPR", symbol: "रू", name: "Nepalese Rupee", position: "before", minorDigits: 0 },
  { code: "USD", symbol: "$", name: "US Dollar", position: "before", minorDigits: 2 },
  { code: "EUR", symbol: "€", name: "Euro", position: "before", minorDigits: 2 },
  { code: "GBP", symbol: "£", name: "British Pound", position: "before", minorDigits: 2 },
  { code: "INR", symbol: "₹", name: "Indian Rupee", position: "before", minorDigits: 2 },
  { code: "CAD", symbol: "C$", name: "Canadian Dollar", position: "before", minorDigits: 2 },
]

interface CurrencyContextType {
  currentCurrency: Currency
  setCurrency: (currency: Currency) => void
  formatCurrency: (amount: number | string) => string
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

  const setCurrency = (currency: Currency) => {
    setCurrentCurrency(currency)
    localStorage.setItem("pharmacy-currency", JSON.stringify(currency))
  }

  const formatCurrency = (amount: number | string): string => {
    const numAmount = typeof amount === "string" ? parseFloat(amount) : amount
    if (isNaN(numAmount)) return "0"
    
    const digits = currentCurrency.minorDigits ?? 2
    const formatted = numAmount.toLocaleString("en-US", {
      minimumFractionDigits: digits,
      maximumFractionDigits: digits,
    })

    if (currentCurrency.position === "before") {
      return `${currentCurrency.symbol}${formatted}`
    } else {
      return `${formatted} ${currentCurrency.symbol}`
    }
  }

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
