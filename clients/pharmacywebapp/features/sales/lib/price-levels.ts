/**
 * Wholesale / custom price levels, mirroring the .NET PriceLevelPricing (Modules.Sales/Domain/PriceLevel.cs).
 *
 * Retail is the default and has no level: every lot sells at its own selling price (the MRP). A level prices each
 * lot at `discountPercent` below the lot price — or at the medicine's explicit price on the level — and never above
 * the lot price. Prices stay VAT-inclusive, so VAT is carved out exactly as for retail.
 *
 * The server prices the sale itself (CreateSale); the till only uses this to show the same figures, from the quote
 * POST /sales/price-levels/quote returns for the cart's customer.
 */

import { roundMoneyAwayFromZero } from "@/features/sales/lib/vat"

/** PriceQuoteDto (camelCase). */
export interface PriceQuote {
  customerPriceLevelId: string | null
  customerPriceLevelName: string | null
  priceLevelId: string | null
  priceLevelName: string | null
  discountPercent: number
  items: { medicineId: string; unitPrice: number }[]
}

/** The level the cart is priced at; null = retail. */
export interface PriceLevelRule {
  id: string
  name: string
  discountPercent: number
  /** Explicit price per base unit, by medicine id. */
  explicitPrices: Record<string, number>
}

/** PriceLevelDto (camelCase). */
export interface PriceLevel {
  id: string
  name: string
  discountPercent: number
  description: string | null
  isActive: boolean
  itemCount: number
  customerCount: number
}

/** Sent as `priceLevelId` to ask for retail explicitly (for a customer who has a level). */
export const RETAIL_LEVEL_ID = "00000000-0000-0000-0000-000000000000"

export function ruleFromQuote(quote: PriceQuote | null | undefined): PriceLevelRule | null {
  if (!quote?.priceLevelId) return null
  const explicitPrices: Record<string, number> = {}
  for (const item of quote.items ?? []) explicitPrices[item.medicineId] = item.unitPrice
  return {
    id: quote.priceLevelId,
    name: quote.priceLevelName ?? "Price level",
    discountPercent: quote.discountPercent,
    explicitPrices,
  }
}

/** A base unit's price at `rule` from a lot priced `lotPrice` (retail when `rule` is null). */
export function levelUnitPrice(rule: PriceLevelRule | null | undefined, medicineId: string, lotPrice: number): number {
  if (!rule || !(lotPrice > 0)) return lotPrice
  const explicit = rule.explicitPrices[medicineId]
  const price =
    explicit !== undefined && Number.isFinite(explicit)
      ? explicit
      : roundMoneyAwayFromZero((lotPrice * (100 - rule.discountPercent)) / 100)
  return Math.min(price, lotPrice)
}

/** `(lotPrice) => level price` for one medicine, as posPriceLine takes it. */
export function levelPricer(rule: PriceLevelRule | null | undefined, medicineId: string): ((lotPrice: number) => number) | undefined {
  return rule ? (lotPrice: number) => levelUnitPrice(rule, medicineId, lotPrice) : undefined
}

/** What the till sends as `priceLevelId`: nothing when the cart is at the customer's own level. */
export function priceLevelIdToSend(customerLevelId: string | null, appliedLevelId: string | null): string | undefined {
  if ((customerLevelId ?? null) === (appliedLevelId ?? null)) return undefined
  return appliedLevelId ?? RETAIL_LEVEL_ID
}
