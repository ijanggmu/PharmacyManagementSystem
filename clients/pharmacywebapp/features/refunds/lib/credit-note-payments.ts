import type { ReversalSettlement } from "@/lib/api/sales-api"

const REFUND_METHOD_LABELS: Record<string, string> = {
  original_payment: "Original payment method",
  cash: "cash",
  card: "card",
  bank: "bank",
  store_credit: "Store credit",
}

export interface CreditNotePaymentLeg {
  method: string
  amount: number
}

/**
 * The "paid back" lines printed on a credit note. Once the refund/return is completed the server records
 * the real split (cash out of the drawer, card/bank/wallet, credited to the customer's account) and that
 * is printed; before that (or on documents recorded before the split was stored) the chosen method is
 * printed for the whole net amount.
 */
export function creditNotePaymentLegs(
  settlement: ReversalSettlement | null | undefined,
  refundMethod: string | null | undefined,
  netAmount: number,
): CreditNotePaymentLeg[] {
  if (settlement) {
    const legs: CreditNotePaymentLeg[] = []
    if (settlement.cash > 0) legs.push({ method: "Cash refunded", amount: settlement.cash })
    if (settlement.bank > 0) legs.push({ method: "Card / bank / wallet", amount: settlement.bank })
    if (settlement.on_account > 0) legs.push({ method: "Credited to customer account", amount: settlement.on_account })
    if (legs.length > 0) return legs
  }
  const method = refundMethod || "original_payment"
  return [{ method: REFUND_METHOD_LABELS[method] ?? method, amount: netAmount }]
}
