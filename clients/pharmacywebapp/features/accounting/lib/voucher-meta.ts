/**
 * Pure presentation helpers for vouchers: identifiers, titles, labels.
 */

export interface VoucherIdentity {
  source: string | null | undefined
  voucher_type: string | null | undefined
}

/** Manual journal entries are "MJE"; everything posted by the system (sales, purchases, …) is "SYS". */
export function isManualJournal(v: VoucherIdentity): boolean {
  return (v.source ?? "").toLowerCase() === "manual" && (v.voucher_type ?? "").toLowerCase() === "journal"
}

export function voucherIdentifier(v: VoucherIdentity): "MJE" | "SYS" {
  return isManualJournal(v) ? "MJE" : "SYS"
}

/** Voucher types posted by the .NET API, in the order the type filter lists them. */
export const VOUCHER_TYPE_OPTIONS: { value: string; label: string }[] = [
  { value: "journal", label: "Journal" },
  { value: "system_sale", label: "Sales" },
  { value: "system_sales_return", label: "Sales return" },
  { value: "system_refund", label: "Refund" },
  { value: "system_purchase", label: "Purchase" },
  { value: "system_purchase_return", label: "Purchase return" },
  { value: "system_customer_payment", label: "Customer receipt" },
  { value: "system_supplier_payment", label: "Supplier payment" },
  { value: "system_expense", label: "Expense" },
  { value: "system_vat_payment", label: "VAT payment" },
  { value: "system_bank_deposit", label: "Bank deposit" },
  { value: "system_consignment_settlement", label: "Consignment settlement" },
  { value: "system_opening_stock", label: "Opening stock" },
  { value: "system_inventory_adjustment", label: "Stock adjustment" },
  { value: "system_stock_transfer", label: "Stock transfer" },
  { value: "system_cash_shift_variance", label: "Cash short / over" },
  { value: "opening_balance", label: "Opening balance" },
  { value: "system_opening_balance", label: "Opening balance (migration)" },
]

function titleCase(s: string): string {
  return s
    .split(/[\s_-]+/)
    .filter(Boolean)
    .map((w) => w.charAt(0).toUpperCase() + w.slice(1).toLowerCase())
    .join(" ")
}

/** Human label for a voucher type, e.g. "system_sale" -> "Sales". Unknown types are title-cased. */
export function voucherTypeLabel(type: string | null | undefined): string {
  const t = (type ?? "").toLowerCase()
  if (!t) return "—"
  const known = VOUCHER_TYPE_OPTIONS.find((o) => o.value === t)
  if (known) return known.label
  return titleCase(t.replace(/^system_/, ""))
}

/** Printed document title for a voucher type (follows the API's voucher series: SAL, SRN, PUR, PRN, RCT, PMT, CNT, OB, JV). */
export function voucherDocumentTitle(type: string | null | undefined): string {
  const t = (type ?? "").toLowerCase().replace(/^system_/, "")
  if (t === "sale" || t === "sales") return "Sales Voucher"
  if (t === "sales_return" || t === "refund") return "Credit Note"
  if (t === "purchase") return "Purchase Voucher"
  if (t === "purchase_return") return "Debit Note"
  if (t === "customer_payment" || t === "receipt") return "Receipt Voucher"
  if (t === "supplier_payment" || t === "payment" || t === "expense" || t === "vat_payment") return "Payment Voucher"
  if (t === "bank_deposit" || t === "contra") return "Contra Voucher"
  if (t === "opening_balance" || t === "opening_stock") return "Opening Balance Voucher"
  if (
    t === "journal" ||
    t === "inventory_adjustment" ||
    t === "stock_transfer" ||
    t === "consignment_settlement" ||
    t === "cash_shift_variance"
  ) {
    return "Journal Voucher"
  }
  return "Voucher"
}

export function voucherStatusLabel(status: string | null | undefined): string {
  const s = (status ?? "").toLowerCase()
  return s ? s.charAt(0).toUpperCase() + s.slice(1) : "Unknown"
}

const GUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i

/** The API records a user's name, or their id when no name is known. Ids are not shown as names. */
export function displayUserName(value: string | null | undefined): string | null {
  const v = (value ?? "").trim()
  if (!v || GUID.test(v)) return null
  return v
}

export function isGuid(value: string | null | undefined): boolean {
  return GUID.test((value ?? "").trim())
}

/** Short form of an id for display, e.g. "3f2a9c1b…". */
export function shortId(id: string | null | undefined): string {
  const v = (id ?? "").trim()
  if (v.length <= 10) return v
  return `${v.slice(0, 8)}…`
}

/** True when debits equal credits to the paisa. */
export function isBalanced(debit: number, credit: number): boolean {
  return Math.round(debit * 100) === Math.round(credit * 100)
}
