export type CurrencyCode = "USD" | "EUR" | "GBP" | "INR" | "NPR"

function getEnvNumber(name: string, fallback: number): number {
  const raw = process.env[name]
  if (!raw) return fallback
  const parsed = Number(raw)
  return Number.isFinite(parsed) ? parsed : fallback
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
  const usdToNpr = getEnvNumber("NEXT_PUBLIC_USD_TO_NPR_RATE", 132.5)
  const usdToInr = getEnvNumber("NEXT_PUBLIC_USD_TO_INR_RATE", 83)
  const usdToEur = getEnvNumber("NEXT_PUBLIC_USD_TO_EUR_RATE", 0.92)
  const usdToGbp = getEnvNumber("NEXT_PUBLIC_USD_TO_GBP_RATE", 0.79)

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

