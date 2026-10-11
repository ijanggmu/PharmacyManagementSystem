/**
 * Validation for the "Record VAT payment" form (Accounting › Tax & IRD › VAT return). Pure.
 */

export interface VatPaymentFormValues {
  amount: string
  date: string
  reference: string
}

export interface VatPaymentFormErrors {
  amount?: string
  date?: string
  reference?: string
}

const DATE_ONLY = /^\d{4}-\d{2}-\d{2}$/
const MAX_REFERENCE = 128

/** Field errors, or an empty object when the form can be submitted. */
export function validateVatPaymentForm(v: VatPaymentFormValues): VatPaymentFormErrors {
  const errors: VatPaymentFormErrors = {}
  const amount = Number(v.amount)
  if (!v.amount.trim() || !Number.isFinite(amount) || amount <= 0) {
    errors.amount = "Enter the amount paid to IRD."
  } else if (!/^\d+(\.\d{1,2})?$/.test(v.amount.trim())) {
    errors.amount = "Use at most 2 decimal places."
  }
  if (!DATE_ONLY.test(v.date)) errors.date = "Choose the payment date."
  if (v.reference.trim().length > MAX_REFERENCE) errors.reference = `Keep the reference under ${MAX_REFERENCE} characters.`
  return errors
}

export function hasVatPaymentErrors(errors: VatPaymentFormErrors): boolean {
  return Object.values(errors).some(Boolean)
}
