/**
 * Payment methods for customer receipts and supplier payments. The API maps the method to the GL money
 * account the same way expenses do: cash → Cash (1000); everything else → Bank (1010).
 */

export const PARTY_PAYMENT_METHODS = [
  { value: "cash", label: "Cash" },
  { value: "bank", label: "Bank transfer" },
  { value: "cheque", label: "Cheque" },
  { value: "card", label: "Card" },
  { value: "esewa", label: "eSewa" },
  { value: "khalti", label: "Khalti" },
  { value: "fonepay", label: "Fonepay" },
] as const

export type PartyPaymentMethod = (typeof PARTY_PAYMENT_METHODS)[number]["value"]

export function paymentMethodLabel(method: PartyPaymentMethod): string {
  return PARTY_PAYMENT_METHODS.find((m) => m.value === method)?.label ?? method
}

/** The GL account the voucher will use, for the dialog's help text. */
export function paymentMethodAccount(method: PartyPaymentMethod): { code: "1000" | "1010"; name: "Cash" | "Bank" } {
  return method === "cash" ? { code: "1000", name: "Cash" } : { code: "1010", name: "Bank" }
}

/** The cheque a receipt / payment was made by, as the payment clients send it ("yyyy-MM-dd" date). */
export interface PartyPaymentCheque {
  chequeNumber: string
  chequeDate: string
  chequeBank: string | null
  chequeClearedOnDeposit: boolean
}

/** The cheque fields of a Customers / Suppliers payment request body (dates as the API's UTC instant). */
export function chequeRequestBody(cheque: PartyPaymentCheque | null | undefined): Record<string, unknown> {
  if (!cheque) return {}
  return {
    chequeNumber: cheque.chequeNumber,
    chequeDateUtc: `${cheque.chequeDate}T00:00:00Z`,
    chequeBank: cheque.chequeBank,
    chequeClearedOnDeposit: cheque.chequeClearedOnDeposit,
  }
}

/** "Bank transfer - Ref 12" style description; the label is kept so the ledger narration stays readable. */
export function paymentDescription(method: PartyPaymentMethod, referenceNote?: string | null): string {
  return [paymentMethodLabel(method), referenceNote?.trim()].filter(Boolean).join(" - ")
}
