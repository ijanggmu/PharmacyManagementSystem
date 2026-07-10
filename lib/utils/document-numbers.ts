/**
 * Tenant-facing document references for sales (invoice) and refunds (credit note).
 * DB also assigns invoice_number in create_sale_with_items; keep formats aligned.
 */

export function formatInvoiceStyleSuffixFromUuid(id: string): string {
  return id.replace(/-/g, "").slice(0, 8).toUpperCase()
}

export function formatCreditNoteNumber(refundId: string, issuedAt: Date = new Date()): string {
  const y = issuedAt.getUTCFullYear().toString().slice(-2)
  const m = String(issuedAt.getUTCMonth() + 1).padStart(2, "0")
  const d = String(issuedAt.getUTCDate()).padStart(2, "0")
  return `CN-${y}${m}${d}-${refundId.replace(/-/g, "").slice(0, 12).toUpperCase()}`
}
