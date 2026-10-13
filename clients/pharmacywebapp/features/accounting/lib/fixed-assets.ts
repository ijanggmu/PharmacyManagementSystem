/**
 * Fixed assets: the register, depreciation runs and the book / tax schedules (Accounting › Fixed assets). Pure helpers
 * (no I/O) shared by the api client, the dialogs and the tabs, so they can be unit-tested.
 *
 * Periods are Nepali fiscal months: `fiscal_year` is the BS year the year starts in (2083 for 2083/84) and `month`
 * runs 1 = Shrawan … 9 = Chaitra, 10 = Baishakh … 12 = Ashadh (the months of the next BS year) — the same numbering the
 * API uses.
 */

import NepaliDate from "nepali-date-converter"
import type { CsvValue } from "@/features/accounting/lib/csv"

export type DepreciationMethod = "straight_line" | "written_down_value"
export type AcquisitionSource = "cash_bank" | "supplier" | "opening"
export type DisposalKind = "sale" | "write_off"
export type TaxPoolCode = "A" | "B" | "C" | "D" | "E"

export interface FixedAsset {
  id: string
  name: string
  category: string
  asset_tag: string | null
  location: string | null
  branch_id: string | null
  acquisition_date: string
  source: AcquisitionSource
  payment_method: string | null
  supplier_id: string | null
  vendor_name: string | null
  supplier_vat_number: string | null
  bill_number: string | null
  cost: number
  vat_amount: number
  residual_value: number
  method: DepreciationMethod
  useful_life_months: number | null
  rate_percent: number | null
  tax_pool: TaxPoolCode
  tax_useful_life_years: number | null
  opening_accumulated_depreciation: number
  opening_tax_wdv: number | null
  accumulated_depreciation: number
  net_book_value: number
  depreciated_through: string | null
  has_posted_depreciation: boolean
  status: "active" | "disposed"
  disposed_on: string | null
  disposal_kind: DisposalKind | null
  disposal_proceeds: number | null
  disposal_gain_loss: number | null
  notes: string | null
}

export interface TaxPool {
  code: TaxPoolCode
  name: string
  rate_percent: number
  per_asset_useful_life: boolean
  examples: string
}

/** Schedule 2 pools (Income Tax Act 2058) — mirrors NepalTaxPoolDefaults on the server; used before the API answers. */
export const DEFAULT_TAX_POOLS: readonly TaxPool[] = [
  { code: "A", name: "Pool A — Buildings & structures", rate_percent: 5, per_asset_useful_life: false, examples: "Buildings, structures" },
  { code: "B", name: "Pool B — Computers, office equipment & furniture", rate_percent: 25, per_asset_useful_life: false, examples: "Computers, furniture" },
  { code: "C", name: "Pool C — Vehicles", rate_percent: 20, per_asset_useful_life: false, examples: "Cars, motorcycles, vans" },
  { code: "D", name: "Pool D — Plant, machinery & other assets", rate_percent: 15, per_asset_useful_life: false, examples: "Fridges, machinery" },
  { code: "E", name: "Pool E — Intangible assets", rate_percent: 0, per_asset_useful_life: true, examples: "Software, licences" },
]

/** Category presets for the add dialog: a sensible tax pool and book life / rate for common pharmacy assets. */
export const ASSET_CATEGORY_PRESETS: readonly {
  category: string
  pool: TaxPoolCode
  method: DepreciationMethod
  life_years: number
  rate_percent: number
}[] = [
  { category: "Computers & IT equipment", pool: "B", method: "straight_line", life_years: 3, rate_percent: 25 },
  { category: "Furniture & fixtures", pool: "B", method: "straight_line", life_years: 10, rate_percent: 25 },
  { category: "Office equipment", pool: "B", method: "straight_line", life_years: 5, rate_percent: 25 },
  { category: "Refrigeration & medical equipment", pool: "D", method: "straight_line", life_years: 8, rate_percent: 15 },
  { category: "Vehicles", pool: "C", method: "written_down_value", life_years: 8, rate_percent: 20 },
  { category: "Buildings & improvements", pool: "A", method: "straight_line", life_years: 30, rate_percent: 5 },
  { category: "Software & licences", pool: "E", method: "straight_line", life_years: 5, rate_percent: 20 },
]

export const METHOD_LABEL: Record<DepreciationMethod, string> = {
  straight_line: "Straight line",
  written_down_value: "Written-down value",
}

export const SOURCE_LABEL: Record<AcquisitionSource, string> = {
  cash_bank: "Paid now",
  supplier: "Supplier bill (pay later)",
  opening: "Opening balance (owned before go-live)",
}

/** Fiscal month names, 1 = Shrawan … 12 = Ashadh. */
export const FISCAL_MONTH_NAMES = [
  "Shrawan",
  "Bhadra",
  "Ashwin",
  "Kartik",
  "Mangsir",
  "Poush",
  "Magh",
  "Falgun",
  "Chaitra",
  "Baishakh",
  "Jestha",
  "Ashadh",
] as const

export interface FiscalMonth {
  fiscal_year: number
  month: number
}

/** "2083/84". */
export function fiscalYearText(fiscalYear: number): string {
  return `${fiscalYear}/${String((fiscalYear + 1) % 100).padStart(2, "0")}`
}

/** "Shrawan 2083"; Baishakh–Ashadh carry the next BS year ("Baishakh 2084" in FY 2083/84). */
export function fiscalMonthLabel(m: FiscalMonth): string {
  const name = FISCAL_MONTH_NAMES[m.month - 1] ?? `Month ${m.month}`
  return `${name} ${m.month <= 9 ? m.fiscal_year : m.fiscal_year + 1}`
}

/** The fiscal month containing the local day of `now`. */
export function fiscalMonthOf(now: Date): FiscalMonth {
  const bs = NepaliDate.fromAD(new Date(now.getFullYear(), now.getMonth(), now.getDate()))
  const month0 = bs.getMonth() // 0 = Baishakh
  return month0 >= 3 ? { fiscal_year: bs.getYear(), month: month0 - 2 } : { fiscal_year: bs.getYear() - 1, month: month0 + 10 }
}

/** The month before `m` (Shrawan → the previous year's Ashadh). */
export function previousFiscalMonth(m: FiscalMonth): FiscalMonth {
  return m.month === 1 ? { fiscal_year: m.fiscal_year - 1, month: 12 } : { fiscal_year: m.fiscal_year, month: m.month - 1 }
}

/** The last fiscal month that has ended by `now` — the usual month to run depreciation for. */
export function lastEndedFiscalMonth(now: Date): FiscalMonth {
  return previousFiscalMonth(fiscalMonthOf(now))
}

/** The `count` fiscal years up to the one containing `now`, newest first. */
export function recentFiscalYears(now: Date, count: number): number[] {
  const current = fiscalMonthOf(now).fiscal_year
  return Array.from({ length: Math.max(0, count) }, (_, i) => current - i)
}

const round2 = (n: number) => Math.round((n + Number.EPSILON) * 100) / 100

// ---------------------------------------------------------------------------------------------------------------------
// Add / edit form

export interface FixedAssetFormValues {
  name: string
  category: string
  asset_tag: string
  location: string
  branch_id: string
  acquisition_date: string
  source: AcquisitionSource
  amount: string
  vat_amount: string
  payment_method: string
  supplier_id: string
  vendor_name: string
  supplier_vat_number: string
  bill_number: string
  residual_value: string
  method: DepreciationMethod
  useful_life_years: string
  rate_percent: string
  tax_pool: TaxPoolCode
  tax_useful_life_years: string
  opening_accumulated: string
  go_live_date: string
  opening_tax_wdv: string
  notes: string
}

export type FixedAssetFormErrors = Partial<Record<keyof FixedAssetFormValues, string>>

export function emptyFixedAssetForm(today: string): FixedAssetFormValues {
  const preset = ASSET_CATEGORY_PRESETS[0]
  return {
    name: "",
    category: preset.category,
    asset_tag: "",
    location: "",
    branch_id: "",
    acquisition_date: today,
    source: "cash_bank",
    amount: "",
    vat_amount: "",
    payment_method: "bank",
    supplier_id: "",
    vendor_name: "",
    supplier_vat_number: "",
    bill_number: "",
    residual_value: "",
    method: preset.method,
    useful_life_years: String(preset.life_years),
    rate_percent: String(preset.rate_percent),
    tax_pool: preset.pool,
    tax_useful_life_years: "",
    opening_accumulated: "",
    go_live_date: today,
    opening_tax_wdv: "",
    notes: "",
  }
}

/** The form for editing `asset` (only the fields an edit can change are used on save). */
export function fixedAssetFormFrom(asset: FixedAsset): FixedAssetFormValues {
  const years = asset.useful_life_months ? round2(asset.useful_life_months / 12) : null
  return {
    ...emptyFixedAssetForm(asset.acquisition_date),
    name: asset.name,
    category: asset.category,
    asset_tag: asset.asset_tag ?? "",
    location: asset.location ?? "",
    branch_id: asset.branch_id ?? "",
    source: asset.source,
    amount: String(round2(asset.cost + asset.vat_amount)),
    vat_amount: asset.vat_amount ? String(asset.vat_amount) : "",
    residual_value: asset.residual_value ? String(asset.residual_value) : "",
    method: asset.method,
    useful_life_years: years == null ? "" : String(years),
    rate_percent: asset.rate_percent == null ? "" : String(asset.rate_percent),
    tax_pool: asset.tax_pool,
    tax_useful_life_years: asset.tax_useful_life_years == null ? "" : String(asset.tax_useful_life_years),
    notes: asset.notes ?? "",
  }
}

/** Applies a category preset (pool, method, life, rate) when the user picks a known category. */
export function applyCategoryPreset(values: FixedAssetFormValues, category: string): FixedAssetFormValues {
  const preset = ASSET_CATEGORY_PRESETS.find((p) => p.category === category)
  if (!preset) return { ...values, category }
  return {
    ...values,
    category,
    tax_pool: preset.pool,
    method: preset.method,
    useful_life_years: String(preset.life_years),
    rate_percent: String(preset.rate_percent),
    tax_useful_life_years: preset.pool === "E" ? String(preset.life_years) : values.tax_useful_life_years,
  }
}

const MONEY = /^\d+(\.\d{1,2})?$/
const NUMBER = /^\d+(\.\d+)?$/

function money(raw: string): number | null {
  const v = raw.trim()
  return MONEY.test(v) ? Number(v) : null
}

/** VAT-exclusive cost the asset will carry: amount − VAT (the VAT is claimed as input VAT). */
export function assetCostOf(values: Pick<FixedAssetFormValues, "amount" | "vat_amount" | "source">): number {
  const amount = money(values.amount) ?? 0
  const vat = values.source === "opening" ? 0 : (money(values.vat_amount) ?? 0)
  return round2(amount - vat)
}

/** Field errors for the add (`mode` "create") or edit form. Empty object = valid. */
export function validateFixedAssetForm(values: FixedAssetFormValues, mode: "create" | "edit"): FixedAssetFormErrors {
  const e: FixedAssetFormErrors = {}
  if (!values.name.trim()) e.name = "Enter the asset's name."
  else if (values.name.trim().length > 200) e.name = "At most 200 characters."
  if (!values.category.trim()) e.category = "Choose or type a category."
  else if (values.category.trim().length > 100) e.category = "At most 100 characters."
  if (values.asset_tag.trim().length > 64) e.asset_tag = "At most 64 characters."
  if (values.location.trim().length > 200) e.location = "At most 200 characters."
  if (values.notes.trim().length > 1024) e.notes = "At most 1024 characters."

  const amount = money(values.amount)
  const cost = assetCostOf(values)
  if (mode === "create") {
    if (!values.acquisition_date) e.acquisition_date = "Enter the acquisition date."
    if (amount == null || amount <= 0) e.amount = "Enter the amount with at most 2 decimals."
    if (values.source !== "opening" && values.vat_amount.trim()) {
      const vat = money(values.vat_amount)
      if (vat == null) e.vat_amount = "Enter the VAT with at most 2 decimals."
      else if (amount != null && vat >= amount) e.vat_amount = "VAT must be less than the bill amount."
      else if (vat > 0 && !values.bill_number.trim()) e.bill_number = "A VAT bill needs its bill number."
      else if (vat > 0 && values.source === "cash_bank" && !values.supplier_vat_number.trim())
        e.supplier_vat_number = "A VAT bill needs the seller's VAT / PAN number."
    }
    if (values.source === "cash_bank" && !values.payment_method) e.payment_method = "Choose how it was paid."
    if (values.source === "supplier" && !values.supplier_id) e.supplier_id = "Choose the supplier the bill is owed to."
    if (values.source === "opening") {
      if (!values.go_live_date) e.go_live_date = "Enter the go-live date."
      else if (values.acquisition_date && values.go_live_date < values.acquisition_date)
        e.go_live_date = "The go-live date can't be before the acquisition date."
      const acc = values.opening_accumulated.trim() ? money(values.opening_accumulated) : 0
      if (acc == null) e.opening_accumulated = "Enter an amount with at most 2 decimals."
      else if (amount != null && acc > amount - (money(values.residual_value) ?? 0))
        e.opening_accumulated = "Depreciation to date can't exceed the cost less the residual value."
      if (values.opening_tax_wdv.trim() && money(values.opening_tax_wdv) == null)
        e.opening_tax_wdv = "Enter an amount with at most 2 decimals."
    }
  }

  if (values.residual_value.trim()) {
    const residual = money(values.residual_value)
    if (residual == null) e.residual_value = "Enter an amount with at most 2 decimals."
    else if (mode === "create" && amount != null && residual >= cost) e.residual_value = "The residual value must be below the cost."
  }

  if (values.method === "straight_line") {
    const years = NUMBER.test(values.useful_life_years.trim()) ? Number(values.useful_life_years) : NaN
    if (!(years > 0) || years > 100) e.useful_life_years = "Enter the useful life in years (up to 100)."
  } else {
    const rate = NUMBER.test(values.rate_percent.trim()) ? Number(values.rate_percent) : NaN
    if (!(rate > 0) || rate > 100) e.rate_percent = "Enter the yearly rate (above 0, up to 100%)."
  }

  if (values.tax_pool === "E") {
    const life = /^\d+$/.test(values.tax_useful_life_years.trim()) ? Number(values.tax_useful_life_years) : NaN
    if (!(life >= 1 && life <= 100)) e.tax_useful_life_years = "Pool E needs the useful life in whole years."
  }
  return e
}

export function hasFixedAssetErrors(e: FixedAssetFormErrors): boolean {
  return Object.values(e).some(Boolean)
}

const opt = (v: string) => (v.trim() ? v.trim() : null)

/** Depreciation terms shared by create and update bodies. */
function termsBody(values: FixedAssetFormValues) {
  const straight = values.method === "straight_line"
  return {
    depreciationMethod: values.method,
    taxPool: values.tax_pool,
    residualValue: money(values.residual_value) ?? 0,
    usefulLifeMonths: straight ? Math.max(1, Math.round(Number(values.useful_life_years) * 12)) : null,
    ratePercent: straight ? null : Number(values.rate_percent),
    taxUsefulLifeYears: values.tax_pool === "E" ? Number(values.tax_useful_life_years) : null,
  }
}

/** POST /accounting/fixed-assets body (dates are sent as Nepal business-date instants by the api client). */
export function createFixedAssetBody(values: FixedAssetFormValues) {
  const opening = values.source === "opening"
  return {
    name: values.name.trim(),
    category: values.category.trim(),
    amount: money(values.amount) ?? 0,
    source: values.source,
    vatAmount: opening ? 0 : (money(values.vat_amount) ?? 0),
    ...termsBody(values),
    paymentMethod: values.source === "cash_bank" ? values.payment_method : null,
    supplierId: values.source === "supplier" ? values.supplier_id : null,
    vendorName: values.source === "cash_bank" ? opt(values.vendor_name) : null,
    supplierVatNumber: opt(values.supplier_vat_number),
    billNumber: opt(values.bill_number),
    assetTag: opt(values.asset_tag),
    location: opt(values.location),
    branchId: opt(values.branch_id),
    openingAccumulatedDepreciation: opening ? (money(values.opening_accumulated) ?? 0) : 0,
    openingTaxWrittenDownValue: opening && values.opening_tax_wdv.trim() ? money(values.opening_tax_wdv) : null,
    notes: opt(values.notes),
  }
}

/** PUT /accounting/fixed-assets/{id} body. */
export function updateFixedAssetBody(id: string, values: FixedAssetFormValues) {
  return {
    id,
    name: values.name.trim(),
    category: values.category.trim(),
    ...termsBody(values),
    assetTag: opt(values.asset_tag),
    location: opt(values.location),
    notes: opt(values.notes),
  }
}

/**
 * The first year's book depreciation the form's terms give, for the dialog's hint: straight line (cost − residual −
 * depreciation to date) ÷ life; written-down value (cost − depreciation to date) × rate. 0 when the form is incomplete.
 */
export function estimatedAnnualDepreciation(values: FixedAssetFormValues): number {
  const cost = assetCostOf(values)
  const residual = money(values.residual_value) ?? 0
  const opening = values.source === "opening" ? (money(values.opening_accumulated) ?? 0) : 0
  if (cost <= 0) return 0
  if (values.method === "straight_line") {
    const years = Number(values.useful_life_years)
    return years > 0 ? round2(Math.max(0, cost - residual - opening) / years) : 0
  }
  const rate = Number(values.rate_percent)
  return rate > 0 ? round2(Math.max(0, cost - opening) * (rate / 100)) : 0
}

// ---------------------------------------------------------------------------------------------------------------------
// Disposal

export interface DisposalFormValues {
  kind: DisposalKind
  date: string
  proceeds: string
  payment_method: string
  notes: string
}

/** Gain (+) or loss (−) the disposal would book: proceeds − net book value (write-off: − net book value). */
export function disposalGainLoss(netBookValue: number, kind: DisposalKind, proceeds: string): number {
  const p = kind === "sale" ? (money(proceeds) ?? 0) : 0
  return round2(p - netBookValue)
}

export function validateDisposalForm(values: DisposalFormValues, acquisitionDate: string): Partial<Record<keyof DisposalFormValues, string>> {
  const e: Partial<Record<keyof DisposalFormValues, string>> = {}
  if (!values.date) e.date = "Enter the disposal date."
  else if (values.date < acquisitionDate) e.date = "The disposal date can't be before the acquisition date."
  if (values.kind === "sale") {
    const p = money(values.proceeds)
    if (p == null || p <= 0) e.proceeds = "Enter the sale proceeds (or record a write-off)."
    if (!values.payment_method) e.payment_method = "Choose how the proceeds were received."
  }
  if (values.notes.trim().length > 1024) e.notes = "At most 1024 characters."
  return e
}

// ---------------------------------------------------------------------------------------------------------------------
// Reports

export interface DepreciationPreviewLine {
  asset_id: string
  asset_name: string
  category: string
  branch_id: string | null
  method: DepreciationMethod
  cost: number
  accumulated_before: number
  months: number
  amount: number
  nbv_after: number
}

export interface DepreciationPreview {
  fiscal_year: number
  fiscal_year_label: string
  from_month: number
  to_month: number
  period_label: string
  period_start: string
  period_end: string
  lines: DepreciationPreviewLine[]
  branches: { branch_id: string | null; asset_count: number; amount: number }[]
  total: number
  already_posted_months: number
  can_post: boolean
  blocker: string | null
}

export interface DepreciationRun {
  id: string
  fiscal_year: number
  from_month: number
  to_month: number
  period_label: string
  branch_id: string | null
  total: number
  asset_count: number
  voucher_id: string | null
  voucher_no: string | null
  posted_at: string
  posted_by: string
  reversed_at: string | null
  reversed_by: string | null
}

export interface DepreciationScheduleRow {
  asset_id: string
  asset_name: string
  category: string
  asset_tag: string | null
  branch_id: string | null
  method: DepreciationMethod
  opening_cost: number
  additions: number
  disposals: number
  closing_cost: number
  opening_accumulated: number
  depreciation_for_year: number
  depreciation_posted: number
  accumulated_on_disposal: number
  closing_accumulated: number
  opening_nbv: number
  closing_nbv: number
  months: number[]
  posted_months: boolean[]
}

export interface DepreciationSchedule {
  fiscal_year: number
  fiscal_year_label: string
  rows: DepreciationScheduleRow[]
  total_depreciation: number
  total_posted: number
  total_closing_nbv: number
}

export interface TaxPoolRow {
  pool: TaxPoolCode
  pool_name: string
  rate_percent: number
  opening_base: number
  additions_full: number
  additions_two_thirds: number
  additions_one_third: number
  additions_included: number
  disposal_proceeds: number
  depreciation_base: number
  depreciation: number
  recapture: number
  terminal_deduction: number
  deferred_additions: number
  closing_base: number
  asset_count: number
}

export interface TaxDepreciationSchedule {
  fiscal_year: number
  fiscal_year_label: string
  pools: TaxPoolRow[]
  total_depreciation: number
  total_recapture: number
  total_terminal_deduction: number
  note: string
}

/** Register totals for the stat cards: cost, accumulated depreciation and net book value of active assets. */
export function registerTotals(assets: readonly FixedAsset[]): { count: number; cost: number; accumulated: number; nbv: number } {
  const active = assets.filter((a) => a.status === "active")
  return {
    count: active.length,
    cost: round2(active.reduce((s, a) => s + a.cost, 0)),
    accumulated: round2(active.reduce((s, a) => s + a.accumulated_depreciation, 0)),
    nbv: round2(active.reduce((s, a) => s + a.net_book_value, 0)),
  }
}

export const REGISTER_CSV_HEADERS = [
  "Asset",
  "Category",
  "Tag",
  "Location",
  "Acquired (AD)",
  "Acquired via",
  "Cost",
  "Method",
  "Life (months) / rate %",
  "Tax pool",
  "Accumulated depreciation",
  "Net book value",
  "Depreciated through",
  "Status",
] as const

export function registerCsvRows(assets: readonly FixedAsset[]): CsvValue[][] {
  return assets.map((a) => [
    a.name,
    a.category,
    a.asset_tag,
    a.location,
    a.acquisition_date,
    SOURCE_LABEL[a.source],
    a.cost.toFixed(2),
    METHOD_LABEL[a.method],
    a.method === "straight_line" ? a.useful_life_months : a.rate_percent,
    a.tax_pool,
    a.accumulated_depreciation.toFixed(2),
    a.net_book_value.toFixed(2),
    a.depreciated_through,
    a.status === "disposed" ? `Disposed ${a.disposed_on ?? ""}`.trim() : "Active",
  ])
}

export function scheduleCsvHeaders(fiscalYear: number): string[] {
  const months = Array.from({ length: 12 }, (_, i) => fiscalMonthLabel({ fiscal_year: fiscalYear, month: i + 1 }))
  return [
    "Asset",
    "Category",
    "Method",
    "Opening cost",
    "Additions",
    "Disposals",
    "Closing cost",
    "Opening accumulated",
    ...months,
    "Depreciation for year",
    "Posted",
    "Closing accumulated",
    "Closing NBV",
  ]
}

export function scheduleCsvRows(s: DepreciationSchedule): CsvValue[][] {
  return s.rows.map((r) => [
    r.asset_name,
    r.category,
    METHOD_LABEL[r.method],
    r.opening_cost.toFixed(2),
    r.additions.toFixed(2),
    r.disposals.toFixed(2),
    r.closing_cost.toFixed(2),
    r.opening_accumulated.toFixed(2),
    ...r.months.map((m) => m.toFixed(2)),
    r.depreciation_for_year.toFixed(2),
    r.depreciation_posted.toFixed(2),
    r.closing_accumulated.toFixed(2),
    r.closing_nbv.toFixed(2),
  ])
}

export const TAX_CSV_HEADERS = [
  "Pool",
  "Rate %",
  "Opening base",
  "Additions (Shrawan–Poush, full)",
  "Additions (Magh–Chaitra, 2/3)",
  "Additions (Baishakh–Ashadh, 1/3)",
  "Additions in base",
  "Disposal proceeds",
  "Depreciation base",
  "Depreciation",
  "Recapture (income)",
  "Terminal deduction",
  "Carried to next year",
  "Closing base",
] as const

export function taxCsvRows(s: TaxDepreciationSchedule): CsvValue[][] {
  const rows: CsvValue[][] = s.pools.map((p) => [
    p.pool_name,
    p.pool === "E" ? "useful life" : p.rate_percent,
    p.opening_base.toFixed(2),
    p.additions_full.toFixed(2),
    p.additions_two_thirds.toFixed(2),
    p.additions_one_third.toFixed(2),
    p.additions_included.toFixed(2),
    p.disposal_proceeds.toFixed(2),
    p.depreciation_base.toFixed(2),
    p.depreciation.toFixed(2),
    p.recapture.toFixed(2),
    p.terminal_deduction.toFixed(2),
    p.deferred_additions.toFixed(2),
    p.closing_base.toFixed(2),
  ])
  rows.push([
    "Total",
    "",
    "",
    "",
    "",
    "",
    "",
    "",
    "",
    s.total_depreciation.toFixed(2),
    s.total_recapture.toFixed(2),
    s.total_terminal_deduction.toFixed(2),
    "",
    "",
  ])
  return rows
}
