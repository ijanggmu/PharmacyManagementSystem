import type { SupplierBillPaymentInput } from "@/lib/api/catalog-api"
import type { PartyPaymentMethod } from "@/features/accounting/lib/payment-methods"

/**
 * "Paid now / On credit" state for a supplier bill entered through Add medicine or Bulk import.
 * On credit (the default) leaves the bill payable; paid now records a payment against that bill, which
 * posts Dr Accounts Payable / Cr Cash (or Bank for any non-cash method).
 */
export interface BillPaymentState {
  paid: boolean
  method: PartyPaymentMethod
  /** As typed; blank means the full bill total. */
  amount: string
  reference: string
  /** YYYY-MM-DD; blank means the receipt date. */
  date: string
}

export function emptyBillPayment(): BillPaymentState {
  return { paid: false, method: "cash", amount: "", reference: "", date: "" }
}

/** Bill total including VAT: Σ qty × cost + Σ VAT. */
export function billTotal(rows: ReadonlyArray<{ stock_quantity: number; cost_price: number; vat_amount?: number | null }>): number {
  const total = rows.reduce(
    (sum, r) => sum + (Number(r.stock_quantity) || 0) * (Number(r.cost_price) || 0) + (Number(r.vat_amount) || 0),
    0,
  )
  return Math.round(total * 100) / 100
}

/** Blocking problem with the payment, or null. Nothing to check when the bill is on credit. */
export function validateBillPayment(state: BillPaymentState, total: number): string | null {
  if (!state.paid) return null
  if (!state.method) return "Choose how the bill was paid"
  const raw = state.amount.replace(/,/g, "").trim()
  if (raw === "") return total > 0 ? null : "Add medicines with stock and cost before marking the bill paid"
  if (!/^\d+(\.\d{1,2})?$/.test(raw)) return "Enter the amount paid, like 1250 or 1250.50"
  const amount = Number(raw)
  if (amount <= 0) return "Amount paid must be more than zero"
  if (amount - total > 0.005) return `Amount paid can't be more than the bill total (${total.toFixed(2)})`
  return null
}

/** The API payment object, or null for a bill on credit. */
export function toBillPaymentInput(state: BillPaymentState): SupplierBillPaymentInput | null {
  if (!state.paid) return null
  const raw = state.amount.replace(/,/g, "").trim()
  return {
    method: state.method,
    amount: raw ? Number(raw) : null,
    reference: state.reference.trim() || null,
    payment_date: state.date || null,
  }
}
