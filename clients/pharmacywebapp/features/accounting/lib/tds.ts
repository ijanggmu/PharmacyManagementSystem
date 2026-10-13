/**
 * TDS (tax deducted at source / withholding tax) helpers — pure, shared by the expense form, the supplier payment
 * dialog, the TDS settings section and the TDS report.
 *
 * Nepal rule used throughout: TDS is withheld on the payment EXCLUDING VAT (the VAT is not the vendor's income).
 * The category rates are tenant settings (Finance setup › TDS rates); the API seeds Nepal defaults that must be
 * confirmed against the current Finance Act. The amount on each document stays editable.
 */

import type { CsvValue } from "./csv"
import { formatBsYmd } from "./date-presets"

/** TdsCategoryDto from Modules.Accounting.Contracts. */
export interface TdsCategory {
  code: string
  name: string
  rate_percent: number
  is_active: boolean
  sort_order: number
}

/** The TDS part of a form, as typed. `category` "" = no TDS; `amount` "" = worked out from the rate. */
export interface TdsFieldsValue {
  category: string
  rate: string
  amount: string
  /** Supplier payments only: the TDS base excluding VAT; "" = the payment amount. */
  taxable: string
}

export const EMPTY_TDS: TdsFieldsValue = { category: "", rate: "", amount: "", taxable: "" }

const AMOUNT = /^\d+(\.\d{1,2})?$/
const RATE = /^\d+(\.\d{1,2})?$/

function round2(n: number): number {
  return Math.sign(n) * Math.round(Math.abs(n) * 100 + Number.EPSILON) / 100
}

/** taxable × rate%, rounded half away from zero to the paisa (as the API does). */
export function computeTds(taxable: number, ratePercent: number): number {
  if (!Number.isFinite(taxable) || !Number.isFinite(ratePercent) || taxable <= 0 || ratePercent <= 0) return 0
  return round2((taxable * ratePercent) / 100)
}

/** Categories offered in a picker: active ones, in display order (plus `keep` — an edit's current category). */
export function selectableTdsCategories(categories: readonly TdsCategory[], keep?: string): TdsCategory[] {
  return [...categories]
    .filter((c) => c.is_active || c.code === keep)
    .sort((a, b) => a.sort_order - b.sort_order || a.code.localeCompare(b.code))
}

/** Picking a category fills its rate and goes back to the worked-out amount. "" turns TDS off. */
export function chooseTdsCategory(value: TdsFieldsValue, categories: readonly TdsCategory[], code: string): TdsFieldsValue {
  if (!code) return { ...EMPTY_TDS, taxable: value.taxable }
  const category = categories.find((c) => c.code === code)
  return { ...value, category: code, rate: category ? String(category.rate_percent) : value.rate, amount: "" }
}

/** The base TDS is worked out on: the typed taxable amount when given, else `defaultTaxable`. */
export function tdsTaxableBase(value: TdsFieldsValue, defaultTaxable: number): number {
  const typed = value.taxable.trim()
  if (typed && AMOUNT.test(typed)) return Number(typed)
  return Number.isFinite(defaultTaxable) ? defaultTaxable : 0
}

/** The TDS that will be withheld: the typed amount, else taxable × rate. 0 without a category. */
export function effectiveTds(value: TdsFieldsValue, defaultTaxable: number): number {
  if (!value.category) return 0
  const typed = value.amount.trim()
  if (typed && AMOUNT.test(typed)) return Number(typed)
  const rate = Number(value.rate)
  return computeTds(tdsTaxableBase(value, defaultTaxable), Number.isFinite(rate) ? rate : 0)
}

/**
 * The first problem with the TDS fields, or undefined. `defaultTaxable` is the base (expense: amount excluding VAT;
 * payment: the payment amount); `limit` the most TDS can be (expense: the base; payment: less than the payment).
 */
export function validateTdsFields(
  value: TdsFieldsValue,
  defaultTaxable: number,
  options: { mustBeLessThan?: number } = {},
): string | undefined {
  if (!value.category) return undefined
  const rate = value.rate.trim()
  if (!rate || !RATE.test(rate) || Number(rate) <= 0 || Number(rate) > 100) return "Enter a TDS rate between 0 and 100%."
  const taxableTyped = value.taxable.trim()
  if (taxableTyped && (!AMOUNT.test(taxableTyped) || Number(taxableTyped) <= 0)) return "Enter the taxable amount like 1250 or 1250.50."
  const base = tdsTaxableBase(value, defaultTaxable)
  if (options.mustBeLessThan != null && base > options.mustBeLessThan + 0.005) {
    return "The taxable amount can't be more than the payment."
  }
  const typed = value.amount.trim()
  if (typed && !AMOUNT.test(typed)) return "Enter the TDS amount like 150 or 150.75."
  const tds = effectiveTds(value, defaultTaxable)
  if (tds <= 0) return "The TDS works out to nothing — check the amount and rate, or choose “No TDS”."
  if (tds > base + 0.005) return "TDS can't be more than the taxable amount (excluding VAT)."
  if (options.mustBeLessThan != null && tds >= options.mustBeLessThan - 0.005) return "TDS must be less than the payment amount."
  return undefined
}

/** Request fields for RecordExpense / UpdateExpense (the API works the amount out from the rate when it is null). */
export function tdsExpenseRequest(value: TdsFieldsValue): { tdsCategory: string | null; tdsRatePercent: number | null; tdsAmount: number | null } {
  if (!value.category) return { tdsCategory: null, tdsRatePercent: null, tdsAmount: null }
  const typed = value.amount.trim()
  return {
    tdsCategory: value.category,
    tdsRatePercent: value.rate.trim() ? Number(value.rate) : null,
    tdsAmount: typed && AMOUNT.test(typed) ? Number(typed) : null,
  }
}

/** Request fields for a supplier payment: the amount is always sent (Suppliers does not know the rates). */
export function tdsPaymentRequest(
  value: TdsFieldsValue,
  paymentAmount: number,
): { tdsAmount: number; tdsCategory: string; tdsRatePercent: number | null; tdsTaxableAmount: number } | null {
  if (!value.category) return null
  const tds = effectiveTds(value, paymentAmount)
  if (tds <= 0) return null
  return {
    tdsAmount: tds,
    tdsCategory: value.category,
    tdsRatePercent: value.rate.trim() ? Number(value.rate) : null,
    tdsTaxableAmount: tdsTaxableBase(value, paymentAmount),
  }
}

/** Prefill for editing an expense that already has TDS. */
export function tdsFieldsFrom(expense: { tds_category_code: string | null; tds_rate_percent: number | null; tds_amount: number }): TdsFieldsValue {
  if (!expense.tds_category_code || !(expense.tds_amount > 0)) return { ...EMPTY_TDS }
  return {
    category: expense.tds_category_code,
    rate: expense.tds_rate_percent != null ? String(expense.tds_rate_percent) : "",
    amount: expense.tds_amount.toFixed(2),
    taxable: "",
  }
}

// ---------------------------------------------------------------------------------------------------------------
// Report
// ---------------------------------------------------------------------------------------------------------------

export interface TdsReportLine {
  id: string
  /** Nepal business date, yyyy-mm-dd (AD). */
  date: string
  source_type: "Expense" | "SupplierPayment" | string
  source_id: string
  vendor_name: string
  pan: string | null
  category_code: string
  category_name: string
  rate_percent: number
  taxable_amount: number
  tds_amount: number
  document_reference: string | null
}

export interface TdsReportCategoryTotal {
  category_code: string
  category_name: string
  count: number
  taxable_amount: number
  tds_amount: number
}

export interface TdsReport {
  lines: TdsReportLine[]
  category_totals: TdsReportCategoryTotal[]
  total_taxable: number
  total_tds: number
  tds_deposited: number
  tds_payable_balance: number
}

/** Lines without a PAN — the e-TDS upload needs the withholdee's PAN, so they are flagged before export. */
export function linesMissingPan(lines: readonly TdsReportLine[]): TdsReportLine[] {
  return lines.filter((l) => !l.pan?.trim())
}

/**
 * Column layout of the e-TDS export. Close to IRD's e-TDS bulk upload sheet (withholdee PAN, name, payment amount,
 * TDS amount, TDS type and the transaction date in BS). Assumptions, since IRD changes the template: "payment
 * amount" is the taxable amount (excluding VAT); "TDS type" is the tenant's category code + name (map it to the
 * IRD revenue / TDS head when filing); the BS date uses the app's BS calendar. Check the columns against the
 * current e-TDS template before uploading.
 */
export const ETDS_CSV_HEADERS = [
  "S.N.",
  "Withholdee PAN",
  "Withholdee Name",
  "Payment Amount",
  "TDS Amount",
  "TDS Type Code",
  "TDS Type",
  "TDS Rate (%)",
  "Transaction Date (BS)",
  "Transaction Date (AD)",
  "Document Ref",
] as const

export function etdsCsvRows(lines: readonly TdsReportLine[]): CsvValue[][] {
  return lines.map((l, i) => [
    i + 1,
    l.pan ?? "",
    l.vendor_name,
    l.taxable_amount.toFixed(2),
    l.tds_amount.toFixed(2),
    l.category_code,
    l.category_name,
    l.rate_percent,
    formatBsYmd(l.date),
    l.date,
    l.document_reference ?? "",
  ])
}

/** The per-category summary appended under the e-TDS rows (blank separator row first). */
export function tdsCategoryTotalsCsvRows(report: Pick<TdsReport, "category_totals" | "total_taxable" | "total_tds">): CsvValue[][] {
  return [
    [],
    ["", "", "Totals by TDS type", "Payment Amount", "TDS Amount", "TDS Type Code", "TDS Type", "Deductions"],
    ...report.category_totals.map((t) => [
      "",
      "",
      "",
      t.taxable_amount.toFixed(2),
      t.tds_amount.toFixed(2),
      t.category_code,
      t.category_name,
      t.count,
    ]),
    ["", "", "Total", report.total_taxable.toFixed(2), report.total_tds.toFixed(2), "", "", ""],
  ]
}

// ---------------------------------------------------------------------------------------------------------------
// Settings
// ---------------------------------------------------------------------------------------------------------------

/** A category row in the settings editor, as typed. */
export interface TdsCategoryDraft {
  code: string
  name: string
  rate: string
  is_active: boolean
  /** True for a row added in this session (its code can still be edited). */
  is_new?: boolean
}

const CODE = /^[A-Za-z0-9_-]+$/

/** Per-row errors (by index) for the settings editor; empty when it can be saved. */
export function validateTdsCategoryDrafts(drafts: readonly TdsCategoryDraft[]): Record<number, string> {
  const errors: Record<number, string> = {}
  const seen = new Set<string>()
  drafts.forEach((d, i) => {
    const code = d.code.trim().toLowerCase()
    if (!code) errors[i] = "Enter a code."
    else if (!CODE.test(code) || code.length > 32) errors[i] = "Use letters, digits, _ or - (up to 32)."
    else if (seen.has(code)) errors[i] = "This code is already used."
    else if (!d.name.trim()) errors[i] = "Enter a name."
    else if (d.name.trim().length > 128) errors[i] = "Keep the name under 128 characters."
    else if (!RATE.test(d.rate.trim()) || Number(d.rate) <= 0 || Number(d.rate) > 100) errors[i] = "Enter a rate between 0 and 100%."
    seen.add(code)
  })
  return errors
}

export function tdsCategoryInputs(drafts: readonly TdsCategoryDraft[]): { code: string; name: string; ratePercent: number; isActive: boolean }[] {
  return drafts.map((d) => ({ code: d.code.trim().toLowerCase(), name: d.name.trim(), ratePercent: Number(d.rate), isActive: d.is_active }))
}
