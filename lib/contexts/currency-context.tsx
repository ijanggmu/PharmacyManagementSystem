"use client"

import React, { createContext, useContext, useState, useEffect, ReactNode } from "react"

export interface Currency {
  code: string
  symbol: string
  name: string
  position: "before" | "after"
}

export const SUPPORTED_CURRENCIES: Currency[] = [
  { code: "NPR", symbol: "रू", name: "Nepalese Rupee", position: "before" },
  { code: "USD", symbol: "$", name: "US Dollar", position: "before" },
  { code: "EUR", symbol: "€", name: "Euro", position: "before" },
  { code: "GBP", symbol: "£", name: "British Pound", position: "before" },
  { code: "INR", symbol: "₹", name: "Indian Rupee", position: "before" },
  { code: "CAD", symbol: "C$", name: "Canadian Dollar", position: "before" },
]

interface CurrencyContextType {
  currentCurrency: Currency
  setCurrency: (currency: Currency) => void
  formatCurrency: (amount: number | string) => string
  getCurrencySymbol: () => string
}

const CurrencyContext = createContext<CurrencyContextType | undefined>(undefined)

export function CurrencyProvider({ children }: { children: ReactNode }) {
  const [currentCurrency, setCurrentCurrency] = useState<Currency>(SUPPORTED_CURRENCIES[0]) // Default to NPR

  useEffect(() => {
    // Load currency from localStorage on mount
    const savedCurrency = localStorage.getItem("pharmacy-currency")
    if (savedCurrency) {
      const parsed = JSON.parse(savedCurrency)
      const found = SUPPORTED_CURRENCIES.find(c => c.code === parsed.code)
      if (found) {
        setCurrentCurrency(found)
      }
    }
  }, [])

  const setCurrency = (currency: Currency) => {
    setCurrentCurrency(currency)
    localStorage.setItem("pharmacy-currency", JSON.stringify(currency))
  }

  const formatCurrency = (amount: number | string): string => {
    const numAmount = typeof amount === "string" ? parseFloat(amount) : amount
    if (isNaN(numAmount)) return "0"
    
    const formatted = numAmount.toLocaleString("en-US", {
      minimumFractionDigits: 2,
      maximumFractionDigits: 2,
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
