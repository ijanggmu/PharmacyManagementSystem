"use client"

import { useCurrency } from "@/lib/contexts/currency-context"

interface CurrencyDisplayProps {
  amount: number | string
  className?: string
  showSymbol?: boolean
}

export function CurrencyDisplay({ amount, className = "", showSymbol = true }: CurrencyDisplayProps) {
  const { formatCurrency, currentCurrency } = useCurrency()

  if (!showSymbol) {
    return <span className={className}>{formatCurrency(amount)}</span>
  }

  return <span className={className}>{formatCurrency(amount)}</span>
}
