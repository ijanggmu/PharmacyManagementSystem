import { STOCK_FUNDING_VALUES, type StockFunding } from "@/lib/api/catalog-api"

/**
 * "How was this stock paid for?" — asked whenever stock is entered without a supplier (no supplier bill).
 * The API posts Dr Inventory against: Owner's Equity for opening stock the pharmacy already owned at go-live;
 * Cash (1000) for stock bought for cash; Bank (1010) for stock paid by bank transfer, card or wallet.
 * Stock from a supplier never uses this: its bill (and any payment at entry) is the record of the purchase.
 */
export type { StockFunding }

/** Form state: "" until the user picks one (the choice is required, so there is no silent default). */
export type StockFundingChoice = StockFunding | ""

export const STOCK_FUNDING_OPTIONS: ReadonlyArray<{
  value: StockFunding
  label: string
  hint: string
  /** Where the credit side of the voucher goes. */
  account: string
}> = [
  {
    value: "opening_stock",
    label: "Opening stock",
    hint: "Already owned when you started using the system",
    account: "Owner's Equity",
  },
  { value: "cash", label: "Paid in cash", hint: "Bought for cash, no supplier bill", account: "Cash (1000)" },
  {
    value: "bank",
    label: "Paid by bank / wallet",
    hint: "Bank transfer, card, eSewa, Khalti or Fonepay",
    account: "Bank (1010)",
  },
]

export function isStockFunding(value: unknown): value is StockFunding {
  return typeof value === "string" && (STOCK_FUNDING_VALUES as readonly string[]).includes(value)
}

/** Blocking problem with the choice, or null. Only asked when stock is entered without a supplier. */
export function validateStockFunding(choice: StockFundingChoice, required: boolean): string | null {
  if (!required) return null
  return isStockFunding(choice) ? null : "Choose how this stock was paid for"
}

/** What the voucher will do, for the helper text under the choice. */
export function stockFundingPostingHint(choice: StockFundingChoice): string {
  const option = STOCK_FUNDING_OPTIONS.find((o) => o.value === choice)
  if (!option) return "Decides the accounting entry: opening stock adds to Owner's Equity; a cash or bank purchase is paid out of that account."
  return option.value === "opening_stock"
    ? "Recorded as opening stock: Inventory up, Owner's Equity up. Use this only for stock you already had at go-live."
    : `Recorded as a purchase: Inventory up, ${option.account} down by quantity × cost.`
}

/** The value sent to the API: the choice when stock arrives without a supplier, otherwise null. */
export function stockFundingForRequest(choice: StockFundingChoice, hasSupplier: boolean): StockFunding | null {
  return !hasSupplier && isStockFunding(choice) ? choice : null
}
