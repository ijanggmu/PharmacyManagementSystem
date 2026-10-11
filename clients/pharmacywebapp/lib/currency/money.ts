/**
 * Money display shared by client components (via the currency context) and server code.
 * Plain module — no "use client" — so Server Components and route handlers can format amounts too.
 */

export interface Currency {
  code: string
  symbol: string
  name: string
  position: "before" | "after"
  minorDigits?: number
}

/**
 * NPR is charged to the paisa (1/100), so it must also display to the paisa: a रू 44.10 bill
 * showing as "रू44" while 44.10 is collected is a real cash-drawer discrepancy.
 */
export const NPR_CURRENCY: Currency = { code: "NPR", symbol: "रू", name: "Nepalese Rupee", position: "before", minorDigits: 2 }

export const DEFAULT_CURRENCY = NPR_CURRENCY

/**
 * Every amount the API returns is in Nepalese rupees and the app does no FX conversion, so offering
 * USD/EUR/INR here would only swap the symbol on a rupee figure ("$1,000.00" for रू1,000). NPR is the
 * only display currency until amounts carry their own currency and a conversion exists.
 */
export const SUPPORTED_CURRENCIES: Currency[] = [NPR_CURRENCY]

export function findSupportedCurrency(code: string | null | undefined): Currency | undefined {
  if (!code) return undefined
  return SUPPORTED_CURRENCIES.find((c) => c.code === code)
}

export interface FormatMoneyOptions {
  /** Override the currency's minor digits, e.g. 0 for a compact whole-rupee figure. */
  fractionDigits?: number
}

/** Pure money formatter: "रू1,234.50". Non-numeric input renders as zero. */
export function formatMoney(amount: number | string, currency: Currency = DEFAULT_CURRENCY, options: FormatMoneyOptions = {}): string {
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
