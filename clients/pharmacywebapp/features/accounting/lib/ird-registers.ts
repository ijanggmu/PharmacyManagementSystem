/**
 * Column layouts, totals and cross-checks for the IRD registers (sales / purchase register and
 * Annex 13 / Annex 14). Pure — the rows come from lib/api/ird-api.
 */

import type { IrdPurchaseRegisterRow, IrdReportType, IrdSalesRegisterRow } from "@/lib/api/ird-api"
import { formatLocalDateYmd } from "@/lib/utils/date"

export type IrdCell = string | number | null

export interface IrdColumn<T> {
  key: string
  label: string
  kind: "text" | "date" | "money"
  value: (row: T) => IrdCell
  /** Summed in the totals row. Only money columns are totalled. */
  total?: boolean
}

export type IrdRegisterSide = "sales" | "purchase"

export interface IrdRegisterMeta {
  type: IrdReportType
  side: IrdRegisterSide
  title: string
  /** e.g. "Annex 13" — the IRD schedule the export matches, or null for internal registers. */
  badge: string | null
  description: string
}

export const IRD_REGISTERS: readonly IrdRegisterMeta[] = [
  {
    type: "sales-register",
    side: "sales",
    title: "Sales register",
    badge: null,
    description: "Every tax invoice with VAT, discount, payment and IRD sync status.",
  },
  {
    type: "annex-13",
    side: "sales",
    title: "Sales book",
    badge: "Annex 13",
    description: "IRD sales schedule — taxable value and VAT per invoice.",
  },
  {
    type: "purchase-register",
    side: "purchase",
    title: "Purchase register",
    badge: null,
    description: "Received purchase bills (orders and direct receipts) with taxable value, VAT and supplier invoice numbers.",
  },
  {
    type: "annex-14",
    side: "purchase",
    title: "Purchase book",
    badge: "Annex 14",
    description: "IRD purchase schedule — taxable value and VAT per supplier bill.",
  },
]

export function irdRegisterMeta(type: IrdReportType): IrdRegisterMeta {
  const meta = IRD_REGISTERS.find((r) => r.type === type)
  if (!meta) throw new Error(`Unknown IRD register: ${type}`)
  return meta
}

/** Date part of an instant in local time; a bare yyyy-mm-dd is returned unchanged. */
export function irdDate(value: string | null | undefined): string {
  if (!value) return ""
  if (/^\d{4}-\d{2}-\d{2}$/.test(value)) return value
  const d = new Date(value)
  return Number.isNaN(d.getTime()) ? value.slice(0, 10) : formatLocalDateYmd(d)
}

/** "PartiallyReceived" / "partially_received" → "Partially received". */
export function humanizeStatus(value: string | null | undefined): string {
  const words = String(value ?? "")
    .replace(/([a-z])([A-Z])/g, "$1 $2")
    .replace(/[_-]+/g, " ")
    .trim()
    .toLowerCase()
  return words ? words.charAt(0).toUpperCase() + words.slice(1) : ""
}

const sDate: IrdColumn<IrdSalesRegisterRow> = { key: "sale_date", label: "Date", kind: "date", value: (r) => irdDate(r.sale_date) }
const sInvoice: IrdColumn<IrdSalesRegisterRow> = { key: "invoice_number", label: "Invoice no.", kind: "text", value: (r) => r.invoice_number || null }
const sCustomer: IrdColumn<IrdSalesRegisterRow> = { key: "customer_name", label: "Customer", kind: "text", value: (r) => r.customer_name || null }
const sTaxable: IrdColumn<IrdSalesRegisterRow> = { key: "taxable_amount", label: "Taxable", kind: "money", value: (r) => r.taxable_amount, total: true }
const sVat: IrdColumn<IrdSalesRegisterRow> = { key: "tax_amount", label: "VAT", kind: "money", value: (r) => r.tax_amount, total: true }
const sTotal: IrdColumn<IrdSalesRegisterRow> = { key: "total_amount", label: "Total", kind: "money", value: (r) => r.total_amount, total: true }

export const SALES_REGISTER_COLUMNS: IrdColumn<IrdSalesRegisterRow>[] = [
  sDate,
  sInvoice,
  sCustomer,
  { key: "payment_method", label: "Payment", kind: "text", value: (r) => humanizeStatus(r.payment_method) || null },
  { key: "ird_status", label: "IRD status", kind: "text", value: (r) => humanizeStatus(r.ird_status) || null },
  { key: "discount_amount", label: "Discount", kind: "money", value: (r) => r.discount_amount, total: true },
  sTaxable,
  sVat,
  sTotal,
]

export const ANNEX_13_COLUMNS: IrdColumn<IrdSalesRegisterRow>[] = [
  sDate,
  sInvoice,
  sCustomer,
  { key: "customer_phone", label: "Phone", kind: "text", value: (r) => r.customer_phone || null },
  sTaxable,
  sVat,
  sTotal,
]

const pDate: IrdColumn<IrdPurchaseRegisterRow> = { key: "order_date", label: "Date", kind: "date", value: (r) => irdDate(r.order_date) }
const pSupplier: IrdColumn<IrdPurchaseRegisterRow> = { key: "supplier_name", label: "Supplier", kind: "text", value: (r) => r.supplier_name || null }
const pInvoice: IrdColumn<IrdPurchaseRegisterRow> = {
  key: "supplier_tax_invoice_numbers",
  label: "Supplier invoice no.",
  kind: "text",
  value: (r) => r.supplier_tax_invoice_numbers || null,
}
const pStatus: IrdColumn<IrdPurchaseRegisterRow> = { key: "status", label: "Status", kind: "text", value: (r) => humanizeStatus(r.status) || null }
const pTaxable: IrdColumn<IrdPurchaseRegisterRow> = { key: "taxable_amount", label: "Taxable", kind: "money", value: (r) => r.taxable_amount, total: true }
const pVat: IrdColumn<IrdPurchaseRegisterRow> = { key: "tax_amount", label: "VAT", kind: "money", value: (r) => r.tax_amount, total: true }
const pTotal: IrdColumn<IrdPurchaseRegisterRow> = { key: "total_amount", label: "Total", kind: "money", value: (r) => r.total_amount, total: true }

export const PURCHASE_REGISTER_COLUMNS: IrdColumn<IrdPurchaseRegisterRow>[] = [
  pDate,
  { key: "order_number", label: "Order ref.", kind: "text", value: (r) => r.order_number || null },
  pSupplier,
  pInvoice,
  pStatus,
  pTaxable,
  pVat,
  pTotal,
]

export const ANNEX_14_COLUMNS: IrdColumn<IrdPurchaseRegisterRow>[] = [
  pDate,
  { key: "purchase_number", label: "Purchase ref.", kind: "text", value: (r) => r.purchase_number || null },
  pSupplier,
  pInvoice,
  pTaxable,
  pVat,
  pTotal,
]

function round2(n: number): number {
  return Math.round(n * 100) / 100
}

/** One entry per column: the sum for totalled columns (nulls skipped), null otherwise. */
export function irdColumnTotals<T>(rows: readonly T[], columns: readonly IrdColumn<T>[]): (number | null)[] {
  return columns.map((col) => {
    if (!col.total) return null
    let sum = 0
    for (const row of rows) {
      const v = col.value(row)
      if (typeof v === "number" && Number.isFinite(v)) sum += v
    }
    return round2(sum)
  })
}

export interface IrdTable {
  headers: string[]
  rows: IrdCell[][]
  /** Totals row: "Total (n)" in the first column, sums under money columns, null elsewhere. */
  totals: IrdCell[]
}

/** The register as a plain table — the single source for the preview footer, CSV and print. */
export function irdRegisterTable<T>(rows: readonly T[], columns: readonly IrdColumn<T>[]): IrdTable {
  const sums = irdColumnTotals(rows, columns)
  const totals: IrdCell[] = sums.map((s, i) => (i === 0 ? `Total (${rows.length})` : s))
  return {
    headers: columns.map((c) => c.label),
    rows: rows.map((row) => columns.map((c) => c.value(row))),
    totals,
  }
}

/** CSV-ready rows: money as fixed 2-dp strings, plus the totals row. */
export function irdTableCsvRows(table: IrdTable, kinds: readonly IrdColumn<unknown>["kind"][]): IrdCell[][] {
  const fmt = (cell: IrdCell, i: number): IrdCell =>
    kinds[i] === "money" && typeof cell === "number" ? cell.toFixed(2) : cell
  return [...table.rows.map((r) => r.map(fmt)), table.totals.map(fmt)]
}

export interface VatCrossCheck {
  registerVat: number
  ledgerVat: number
  /** register − ledger */
  difference: number
  matches: boolean
}

/** Compares VAT on the sales register with output VAT posted to the ledger for the same period. */
export function vatRegisterCrossCheck(registerVat: number, ledgerVat: number): VatCrossCheck {
  const difference = round2(registerVat - ledgerVat)
  return { registerVat: round2(registerVat), ledgerVat: round2(ledgerVat), difference, matches: Math.abs(difference) < 0.01 }
}
