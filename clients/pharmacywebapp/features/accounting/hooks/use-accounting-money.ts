"use client"

import { useCallback } from "react"
import { useCurrency } from "@/lib/contexts/currency-context"

/**
 * Money formatting for accounting views, driven by the tenant currency.
 * - `money(n)`  — with the currency symbol (KPI cards, totals in prose)
 * - `amount(n)` — bare figure with the currency's minor digits (dense table cells; column headers carry the unit)
 */
export function useAccountingMoney() {
  const { formatCurrency, currentCurrency } = useCurrency()
  const digits = currentCurrency.minorDigits ?? 2

  const amount = useCallback(
    (n: number | string | null | undefined) => {
      const v = typeof n === "string" ? Number.parseFloat(n) : Number(n ?? 0)
      const safe = Number.isFinite(v) ? v : 0
      return safe.toLocaleString("en-US", { minimumFractionDigits: digits, maximumFractionDigits: digits })
    },
    [digits]
  )

  const money = useCallback((n: number | string | null | undefined) => formatCurrency(Number(n ?? 0) || 0), [formatCurrency])

  return { amount, money, symbol: currentCurrency.symbol, digits }
}
