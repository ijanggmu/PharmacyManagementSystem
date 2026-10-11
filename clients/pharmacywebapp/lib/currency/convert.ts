export type CurrencyCode = "USD" | "EUR" | "GBP" | "INR" | "NPR"

/**
 * Next.js only inlines NEXT_PUBLIC_* values for static `process.env.NEXT_PUBLIC_X` references; a dynamic
 * `process.env[name]` lookup is always undefined in the browser bundle. So callers pass the raw value.
 */
function parseRate(raw: string | undefined, fallback: number): number {
  if (!raw) return fallback
  const parsed = Number(raw)
  return Number.isFinite(parsed) && parsed > 0 ? parsed : fallback
}

/**
 * Convert plan prices maintained in USD into the target currency.
 *
 * Note: these are intentionally conservative defaults. For production,
 * wire these values to a reliable FX-rate source (or configure via env).
 */
export function convertFromUSD(amountUSD: number, targetCurrencyCode: string): number {
  const amount = Number(amountUSD)
  if (!Number.isFinite(amount)) return 0
  if (targetCurrencyCode === "USD") return amount

  // Default FX rates (approx). You can override via env vars:
  // NEXT_PUBLIC_USD_TO_NPR_RATE, NEXT_PUBLIC_USD_TO_INR_RATE, etc.
  const usdToNpr = parseRate(process.env.NEXT_PUBLIC_USD_TO_NPR_RATE, 132.5)
  const usdToInr = parseRate(process.env.NEXT_PUBLIC_USD_TO_INR_RATE, 83)
  const usdToEur = parseRate(process.env.NEXT_PUBLIC_USD_TO_EUR_RATE, 0.92)
  const usdToGbp = parseRate(process.env.NEXT_PUBLIC_USD_TO_GBP_RATE, 0.79)

  switch (targetCurrencyCode) {
    case "NPR":
      return amount * usdToNpr
    case "INR":
      return amount * usdToInr
    case "EUR":
      return amount * usdToEur
    case "GBP":
      return amount * usdToGbp
    default:
      // Unknown currency code: fall back to USD amount.
      return amount
  }
}

