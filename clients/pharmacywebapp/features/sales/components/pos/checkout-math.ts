/**
 * Pure display helpers for the POS "Review & pay" panel. Money decisions stay in
 * payment/payment-math.ts and VAT in lib/vat.ts; this file only shapes their results for the UI.
 */

import { allocateOrderDiscount } from "@/lib/api/sales-api"
import { roundMoneyAwayFromZero, type VatCartLine } from "@/features/sales/lib/vat"
import type { PaymentSummary } from "@/features/sales/components/payment/payment-math"

const paisa = (value: number) => Math.round(roundMoneyAwayFromZero(value) * 100)

export interface TaxableSplit {
  /** VAT-inclusive total of taxable lines after line and order discounts. */
  taxable: number
  /** Total of VAT-exempt lines (is_taxable === false) after line and order discounts. */
  exempt: number
  hasExempt: boolean
}

/**
 * Splits the bill into taxable and exempt parts using the same per-line totals that
 * computeInclusiveVat carves VAT out of (gross − percent discount − order-discount share).
 */
export function taxableSplit(lines: readonly VatCartLine[], orderDiscount = 0): TaxableSplit {
  const shares = allocateOrderDiscount(
    lines.map((line) => Number(line.totalPrice.toFixed(2))),
    Math.max(0, orderDiscount),
  )
  let taxablePaisa = 0
  let exemptPaisa = 0
  let hasExempt = false
  lines.forEach((line, index) => {
    const gross = paisa(line.quantity * line.unitPrice)
    const percentDiscount = paisa(((gross / 100) * (line.discountPercent ?? 0)) / 100)
    const total = gross - percentDiscount - paisa(shares[index] ?? 0)
    if (line.isTaxable === false) {
      hasExempt = true
      exemptPaisa += total
    } else {
      taxablePaisa += total
    }
  })
  return { taxable: taxablePaisa / 100, exempt: exemptPaisa / 100, hasExempt }
}

export type PaymentStatusKind = "covered" | "due" | "over"

export interface PaymentStatus {
  kind: PaymentStatusKind
  /** Remaining (due) or excess (over) in paisa; 0 when covered. */
  amountPaisa: number
  /** Cash to hand back, in paisa. */
  changePaisa: number
}

/** Live "Remaining / Over by / Fully covered" state for the status bar. */
export function paymentStatus(summary: PaymentSummary): PaymentStatus {
  if (summary.balanced) return { kind: "covered", amountPaisa: 0, changePaisa: summary.changePaisa }
  if (summary.remainingPaisa < 0) {
    return { kind: "over", amountPaisa: -summary.remainingPaisa, changePaisa: summary.changePaisa }
  }
  return { kind: "due", amountPaisa: Math.max(0, summary.remainingPaisa), changePaisa: summary.changePaisa }
}

export interface BlockReasonInput {
  legCount: number
  summary: PaymentSummary
  hasCredit: boolean
  hasCustomer: boolean
  qrPending: boolean
  /** A Fonepay leg failed/expired and has no manual transaction id. */
  qrUnconfirmed: boolean
  /** A cash leg's tendered amount is below its applied amount. */
  shortTender: boolean
}

/** Why "Complete sale" is disabled, or null when the bill can be completed. Order matters: first problem wins. */
export function checkoutBlockReason(input: BlockReasonInput, formatMoney: (amount: number) => string): string | null {
  const { summary } = input
  if (input.legCount === 0) return "Add a payment method."
  if (summary.hasEmptyLeg) return "Enter an amount for every payment."
  if (summary.remainingPaisa > 0) return `${formatMoney(summary.remainingPaisa / 100)} still to collect.`
  if (summary.remainingPaisa < 0) {
    return `Payments are ${formatMoney(-summary.remainingPaisa / 100)} more than the bill. Reduce one.`
  }
  if (input.hasCredit && !input.hasCustomer) return "Select a customer before recording a credit sale."
  if (input.qrPending) return "Waiting for the Fonepay payment to be confirmed."
  if (input.qrUnconfirmed) {
    return "Fonepay payment wasn't confirmed. Regenerate the QR, enter the transaction ID, or change the method."
  }
  if (input.shortTender) return "Cash received is less than the cash amount."
  return null
}

/** "2 lines · 5 units" / "1 line · 1 unit" from cart quantities. */
export function unitCountLabel(quantities: readonly number[]): string {
  // Lines and units, as the cart shows them: "1 line · 110 units" (a strip of 10 is 10 units, not 10 items).
  const units = quantities.reduce((sum, q) => sum + q, 0)
  const lines = quantities.length
  return `${lines} line${lines === 1 ? "" : "s"} · ${units} unit${units === 1 ? "" : "s"}`
}
