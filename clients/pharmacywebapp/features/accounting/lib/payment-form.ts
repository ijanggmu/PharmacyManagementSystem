/**
 * Pure validation for the record-receipt / record-payment dialog (Receivables & Payables).
 * Errors block submission; warnings (paying more than is outstanding) need an explicit confirmation.
 */

export type PaymentKind = "receipt" | "payment"

export interface PaymentFormInput {
  partyId: string
  amount: string
  /** Local "yyyy-MM-dd". */
  date: string
  /** Local "yyyy-MM-dd" for today, injected so the check is testable. */
  today: string
  /** Party's outstanding balance, when known. Null/undefined = unknown (no overpayment check). */
  outstanding?: number | null
  reference?: string
  note?: string
  billNumber?: string
  billDate?: string
  /**
   * Outstanding on the one bill the payment is applied to. A bill can't be overpaid (the server rejects
   * it), so this is a hard limit, unlike the party's outstanding, which only warns about an advance.
   */
  billOutstanding?: number | null
  /**
   * Formats an amount in the app currency for messages (the dialog passes useAccountingMoney().money, so it
   * reads "NPR 452.00" / "Rs. 452.00" as configured). Defaults to a plain 2-decimal figure.
   */
  formatMoney?: (amount: number) => string
}

export interface PaymentFormErrors {
  party?: string
  amount?: string
  date?: string
  description?: string
}

export interface PaymentFormResult {
  errors: PaymentFormErrors
  /** Set when the amount exceeds the outstanding balance (an advance). */
  overpaymentBy: number | null
  /** Parsed amount (NaN when invalid). */
  amount: number
  valid: boolean
}

/** The backends cap the payment description at 512 characters. */
export const PAYMENT_DESCRIPTION_MAX = 512

const DATE_ONLY = /^\d{4}-\d{2}-\d{2}$/
const AMOUNT = /^\d+(\.\d{1,2})?$/

/** Parses a user-typed amount ("1,250.50" → 1250.5). Returns NaN for anything that isn't a plain amount. */
export function parseAmountInput(raw: string): number {
  const cleaned = raw.replace(/,/g, "").trim()
  if (!AMOUNT.test(cleaned)) return Number.NaN
  return Number(cleaned)
}

/**
 * Joins reference, supplier bill and note into the single reference note the payment clients send. The
 * clients prefix it with the method ("Cash - …" / "Bank transfer - …"), so that prefix is budgeted for.
 */
export function buildReferenceNote(parts: { reference?: string; note?: string; billNumber?: string; billDate?: string }): string | null {
  const bill = [parts.billNumber?.trim(), parts.billDate?.trim()].filter(Boolean).join(" / ")
  const joined = [
    parts.reference?.trim() ? `Ref ${parts.reference.trim()}` : "",
    bill ? `Bill ${bill}` : "",
    parts.note?.trim() ?? "",
  ]
    .filter(Boolean)
    .join(" | ")
  return joined || null
}

/** Fallback for messages when no currency formatter is passed: the amount with 2 decimals, no symbol. */
function formatPlainAmount(amount: number): string {
  return amount.toFixed(2)
}

/** Longest method prefix the payment clients add ("Bank transfer - "). */
const METHOD_PREFIX_BUDGET = "Bank transfer - ".length

export function validatePaymentForm(input: PaymentFormInput, kind: PaymentKind): PaymentFormResult {
  const errors: PaymentFormErrors = {}
  if (!input.partyId) errors.party = kind === "receipt" ? "Choose a customer" : "Choose a supplier"

  const amount = parseAmountInput(input.amount)
  if (!input.amount.trim()) errors.amount = kind === "receipt" ? "Enter the amount received" : "Enter the amount paid"
  else if (!Number.isFinite(amount)) errors.amount = "Enter an amount like 1250 or 1250.50"
  else if (amount <= 0) errors.amount = "Amount must be more than zero"
  else if (input.billOutstanding != null && amount - input.billOutstanding > 0.005)
    errors.amount = `This bill has only ${(input.formatMoney ?? formatPlainAmount)(input.billOutstanding)} outstanding — pay that or less, or record the rest without a bill`

  if (!input.date) errors.date = "Pick a date"
  else if (!DATE_ONLY.test(input.date)) errors.date = "Pick a valid date"
  else if (input.date > input.today) errors.date = "The date can't be in the future"

  const referenceNote = buildReferenceNote(input) ?? ""
  if (METHOD_PREFIX_BUDGET + referenceNote.length > PAYMENT_DESCRIPTION_MAX) errors.description = "Reference and note are too long — shorten them"

  const outstanding = input.outstanding
  const overpaymentBy =
    Number.isFinite(amount) && amount > 0 && outstanding != null && Number.isFinite(outstanding) && amount - outstanding > 0.005
      ? Math.round((amount - Math.max(outstanding, 0)) * 100) / 100
      : null

  return { errors, overpaymentBy, amount, valid: Object.keys(errors).length === 0 }
}
