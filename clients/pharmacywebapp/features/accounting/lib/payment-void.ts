import { isDotnetRootUser } from "@/lib/api/dotnet-permissions"
import type { PaymentKind } from "@/features/accounting/lib/payment-form"

/**
 * Voiding a recorded customer receipt or supplier payment. The ledger keeps the payment and adds a reversing
 * entry (reference types below); Accounting reverses the payment's GL voucher dated at the void.
 */

/** CustomersPermissions.Ledger.VoidPayment / SuppliersPermissions.Ledger.VoidPayment. */
export const CUSTOMER_PAYMENT_VOID_PERMISSION = "Permissions.Customers.Ledger.VoidPayment"
export const SUPPLIER_PAYMENT_VOID_PERMISSION = "Permissions.Suppliers.Ledger.VoidPayment"

/** Reference type of the ledger entry that voids a payment (its reference id is the voided payment). */
export const PAYMENT_VOID_REFERENCE: Record<PaymentKind, string> = {
  receipt: "CustomerPaymentVoid",
  payment: "SupplierPaymentVoid",
}

export const VOID_REASON_MIN = 3
export const VOID_REASON_MAX = 500

/** Whether the caller may void payments of this kind. Root users always may. */
export function canVoidPayments(kind: PaymentKind, granted: readonly string[]): boolean {
  const permission = kind === "receipt" ? CUSTOMER_PAYMENT_VOID_PERMISSION : SUPPLIER_PAYMENT_VOID_PERMISSION
  return isDotnetRootUser(granted) || granted.includes(permission)
}

/** The ledger row fields that decide whether it is a voidable payment. */
export interface VoidablePaymentRow {
  entry_type: string
  credit: number
  is_voided?: boolean
}

/** A payment (a credit on the party's ledger) not voided yet. Void entries and other rows are never voidable. */
export function isVoidablePayment(row: VoidablePaymentRow): boolean {
  return row.entry_type === "payment" && row.credit > 0 && !row.is_voided
}

/** True on the reversing entry a void added. */
export function isPaymentVoidEntry(referenceType: string | null | undefined): boolean {
  return referenceType === PAYMENT_VOID_REFERENCE.receipt || referenceType === PAYMENT_VOID_REFERENCE.payment
}

/** Error message for a void reason, or undefined when it is acceptable. */
export function voidReasonError(reason: string): string | undefined {
  const r = reason.trim()
  if (r.length < VOID_REASON_MIN) return `Give a short reason (at least ${VOID_REASON_MIN} characters). It is kept on the ledger and the reversing voucher.`
  if (r.length > VOID_REASON_MAX) return `Keep the reason under ${VOID_REASON_MAX} characters.`
  return undefined
}

/** POST path of the void endpoint (the dotnet client adds /api/v1). */
export function paymentVoidPath(kind: PaymentKind, partyId: string, paymentId: string): string {
  const party = kind === "receipt" ? "customers" : "suppliers"
  return `/${party}/${encodeURIComponent(partyId)}/payments/${encodeURIComponent(paymentId)}/void`
}
