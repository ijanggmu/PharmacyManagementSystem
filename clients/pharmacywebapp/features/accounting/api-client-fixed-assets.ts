import { dotnetClient } from "@/lib/api/dotnet-client"
import { businessDateInstantUtc, nepalYmdOf } from "@/lib/utils/nepal-time"
import {
  createFixedAssetBody,
  disposalVat,
  updateFixedAssetBody,
  type AcquisitionSource,
  type DepreciationMethod,
  type DepreciationPreview,
  type DepreciationRun,
  type DepreciationSchedule,
  type DisposalFormValues,
  type DisposalKind,
  type FixedAsset,
  type FixedAssetFormValues,
  type TaxDepreciationSchedule,
  type TaxPool,
  type TaxPoolCode,
} from "@/features/accounting/lib/fixed-assets"

/** FixedAssetDto. */
export interface DotnetFixedAssetDto {
  id: string
  name: string
  category: string
  assetTag: string | null
  location: string | null
  branchId: string | null
  acquisitionDateUtc: string
  acquisitionSource: AcquisitionSource
  paymentMethod: string | null
  supplierId: string | null
  vendorName: string | null
  supplierVatNumber: string | null
  billNumber: string | null
  cost: number
  vatAmount: number
  residualValue: number
  depreciationMethod: DepreciationMethod
  usefulLifeMonths: number | null
  ratePercent: number | null
  taxPool: TaxPoolCode
  taxUsefulLifeYears: number | null
  openingAccumulatedDepreciation: number
  openingTaxWrittenDownValue: number | null
  accumulatedDepreciation: number
  netBookValue: number
  depreciatedThrough: string | null
  hasPostedDepreciation: boolean
  status: "active" | "disposed"
  disposedOnUtc: string | null
  disposalKind: DisposalKind | null
  disposalProceeds: number | null
  disposalGainLoss: number | null
  disposalVatAmount?: number | null
  notes: string | null
}

/** Maps the register row; dates become Nepal business days (yyyy-MM-dd). Pure (exported for tests). */
export function toFixedAsset(d: DotnetFixedAssetDto): FixedAsset {
  return {
    id: d.id,
    name: d.name,
    category: d.category,
    asset_tag: d.assetTag,
    location: d.location,
    branch_id: d.branchId,
    acquisition_date: nepalYmdOf(new Date(d.acquisitionDateUtc)),
    source: d.acquisitionSource,
    payment_method: d.paymentMethod,
    supplier_id: d.supplierId,
    vendor_name: d.vendorName,
    supplier_vat_number: d.supplierVatNumber,
    bill_number: d.billNumber,
    cost: d.cost,
    vat_amount: d.vatAmount,
    residual_value: d.residualValue,
    method: d.depreciationMethod,
    useful_life_months: d.usefulLifeMonths,
    rate_percent: d.ratePercent,
    tax_pool: d.taxPool,
    tax_useful_life_years: d.taxUsefulLifeYears,
    opening_accumulated_depreciation: d.openingAccumulatedDepreciation,
    opening_tax_wdv: d.openingTaxWrittenDownValue,
    accumulated_depreciation: d.accumulatedDepreciation,
    net_book_value: d.netBookValue,
    depreciated_through: d.depreciatedThrough,
    has_posted_depreciation: d.hasPostedDepreciation,
    status: d.status,
    disposed_on: d.disposedOnUtc ? nepalYmdOf(new Date(d.disposedOnUtc)) : null,
    disposal_kind: d.disposalKind,
    disposal_proceeds: d.disposalProceeds,
    disposal_gain_loss: d.disposalGainLoss,
    disposal_vat_amount: d.disposalVatAmount ?? null,
    notes: d.notes,
  }
}

interface DotnetPreviewDto {
  fiscalYear: number
  fiscalYearLabel: string
  fromMonth: number
  toMonth: number
  periodLabel: string
  periodStart: string
  periodEnd: string
  lines: {
    assetId: string
    assetName: string
    category: string
    branchId: string | null
    method: DepreciationMethod
    cost: number
    accumulatedBefore: number
    months: number
    amount: number
    netBookValueAfter: number
  }[]
  branches: { branchId: string | null; assetCount: number; amount: number }[]
  totalAmount: number
  alreadyPostedMonths: number
  canPost: boolean
  blocker: string | null
}

export function toDepreciationPreview(d: DotnetPreviewDto): DepreciationPreview {
  return {
    fiscal_year: d.fiscalYear,
    fiscal_year_label: d.fiscalYearLabel,
    from_month: d.fromMonth,
    to_month: d.toMonth,
    period_label: d.periodLabel,
    period_start: d.periodStart,
    period_end: d.periodEnd,
    lines: d.lines.map((l) => ({
      asset_id: l.assetId,
      asset_name: l.assetName,
      category: l.category,
      branch_id: l.branchId,
      method: l.method,
      cost: l.cost,
      accumulated_before: l.accumulatedBefore,
      months: l.months,
      amount: l.amount,
      nbv_after: l.netBookValueAfter,
    })),
    branches: d.branches.map((b) => ({ branch_id: b.branchId, asset_count: b.assetCount, amount: b.amount })),
    total: d.totalAmount,
    already_posted_months: d.alreadyPostedMonths,
    can_post: d.canPost,
    blocker: d.blocker,
  }
}

interface DotnetRunDto {
  id: string
  fiscalYear: number
  fromMonth: number
  toMonth: number
  periodLabel: string
  branchId: string | null
  totalAmount: number
  assetCount: number
  voucherId: string | null
  voucherNo: string | null
  postedAtUtc: string
  postedBy: string
  reversedAtUtc: string | null
  reversedBy: string | null
}

const toRun = (r: DotnetRunDto): DepreciationRun => ({
  id: r.id,
  fiscal_year: r.fiscalYear,
  from_month: r.fromMonth,
  to_month: r.toMonth,
  period_label: r.periodLabel,
  branch_id: r.branchId,
  total: r.totalAmount,
  asset_count: r.assetCount,
  voucher_id: r.voucherId,
  voucher_no: r.voucherNo,
  posted_at: r.postedAtUtc,
  posted_by: r.postedBy,
  reversed_at: r.reversedAtUtc,
  reversed_by: r.reversedBy,
})

interface DotnetScheduleDto {
  fiscalYear: number
  fiscalYearLabel: string
  rows: {
    assetId: string
    assetName: string
    category: string
    assetTag: string | null
    branchId: string | null
    method: DepreciationMethod
    openingCost: number
    additions: number
    disposals: number
    closingCost: number
    openingAccumulated: number
    depreciationForYear: number
    depreciationPosted: number
    accumulatedOnDisposal: number
    closingAccumulated: number
    openingNetBookValue: number
    closingNetBookValue: number
    months: number[]
    postedMonths: boolean[]
  }[]
  totalDepreciation: number
  totalPosted: number
  totalClosingNetBookValue: number
}

export function toDepreciationSchedule(d: DotnetScheduleDto): DepreciationSchedule {
  return {
    fiscal_year: d.fiscalYear,
    fiscal_year_label: d.fiscalYearLabel,
    rows: d.rows.map((r) => ({
      asset_id: r.assetId,
      asset_name: r.assetName,
      category: r.category,
      asset_tag: r.assetTag,
      branch_id: r.branchId,
      method: r.method,
      opening_cost: r.openingCost,
      additions: r.additions,
      disposals: r.disposals,
      closing_cost: r.closingCost,
      opening_accumulated: r.openingAccumulated,
      depreciation_for_year: r.depreciationForYear,
      depreciation_posted: r.depreciationPosted,
      accumulated_on_disposal: r.accumulatedOnDisposal,
      closing_accumulated: r.closingAccumulated,
      opening_nbv: r.openingNetBookValue,
      closing_nbv: r.closingNetBookValue,
      months: r.months,
      posted_months: r.postedMonths,
    })),
    total_depreciation: d.totalDepreciation,
    total_posted: d.totalPosted,
    total_closing_nbv: d.totalClosingNetBookValue,
  }
}

interface DotnetTaxScheduleDto {
  fiscalYear: number
  fiscalYearLabel: string
  pools: {
    pool: TaxPoolCode
    poolName: string
    ratePercent: number
    openingBase: number
    additionsFull: number
    additionsTwoThirds: number
    additionsOneThird: number
    additionsIncluded: number
    disposalProceeds: number
    depreciationBase: number
    depreciation: number
    recapture: number
    terminalDeduction: number
    deferredAdditions: number
    closingBase: number
    assetCount: number
  }[]
  totalDepreciation: number
  totalRecapture: number
  totalTerminalDeduction: number
  note: string
}

export function toTaxSchedule(d: DotnetTaxScheduleDto): TaxDepreciationSchedule {
  return {
    fiscal_year: d.fiscalYear,
    fiscal_year_label: d.fiscalYearLabel,
    pools: d.pools.map((p) => ({
      pool: p.pool,
      pool_name: p.poolName,
      rate_percent: p.ratePercent,
      opening_base: p.openingBase,
      additions_full: p.additionsFull,
      additions_two_thirds: p.additionsTwoThirds,
      additions_one_third: p.additionsOneThird,
      additions_included: p.additionsIncluded,
      disposal_proceeds: p.disposalProceeds,
      depreciation_base: p.depreciationBase,
      depreciation: p.depreciation,
      recapture: p.recapture,
      terminal_deduction: p.terminalDeduction,
      deferred_additions: p.deferredAdditions,
      closing_base: p.closingBase,
      asset_count: p.assetCount,
    })),
    total_depreciation: d.totalDepreciation,
    total_recapture: d.totalRecapture,
    total_terminal_deduction: d.totalTerminalDeduction,
    note: d.note,
  }
}

const query = (params: Record<string, string | number | null | undefined>) => {
  const p = new URLSearchParams()
  for (const [k, v] of Object.entries(params)) if (v !== null && v !== undefined && v !== "") p.set(k, String(v))
  const s = p.toString()
  return s ? `?${s}` : ""
}

export const fixedAssetsApi = {
  list: async (status?: "active" | "disposed"): Promise<FixedAsset[]> =>
    (await dotnetClient.get<DotnetFixedAssetDto[]>(`/accounting/fixed-assets${query({ status })}`)).map(toFixedAsset),

  taxPools: async (): Promise<TaxPool[]> =>
    (
      await dotnetClient.get<{ code: TaxPoolCode; name: string; ratePercent: number; perAssetUsefulLife: boolean; examples: string }[]>(
        "/accounting/fixed-assets/tax-pools"
      )
    ).map((p) => ({ code: p.code, name: p.name, rate_percent: p.ratePercent, per_asset_useful_life: p.perAssetUsefulLife, examples: p.examples })),

  /** POST /accounting/fixed-assets — adds the asset and posts its acquisition. One idempotency key per submit. */
  create: async (values: FixedAssetFormValues, idempotencyKey: string): Promise<string> =>
    String(
      await dotnetClient.post<string>(
        "/accounting/fixed-assets",
        {
          ...createFixedAssetBody(values),
          acquisitionDateUtc: businessDateInstantUtc(values.acquisition_date),
          depreciationStartDateUtc: values.source === "opening" ? businessDateInstantUtc(values.go_live_date) : null,
        },
        idempotencyKey
      )
    ),

  update: async (id: string, values: FixedAssetFormValues): Promise<string> =>
    String(await dotnetClient.put<string>(`/accounting/fixed-assets/${id}`, updateFixedAssetBody(id, values))),

  remove: async (id: string): Promise<string> => String(await dotnetClient.delete<string>(`/accounting/fixed-assets/${id}`)),

  /** POST /accounting/fixed-assets/{id}/disposal — sale or write-off; returns the voucher id. */
  dispose: async (id: string, values: DisposalFormValues, idempotencyKey: string): Promise<string> =>
    String(
      await dotnetClient.post<string>(
        `/accounting/fixed-assets/${id}/disposal`,
        {
          id,
          disposalDateUtc: businessDateInstantUtc(values.date),
          kind: values.kind,
          proceeds: values.kind === "sale" ? Number(values.proceeds) : 0,
          vatAmount: disposalVat(values),
          paymentMethod: values.kind === "sale" ? values.payment_method : null,
          notes: values.notes.trim() || null,
        },
        idempotencyKey
      )
    ),

  preview: async (fiscalYear: number, month: number | null): Promise<DepreciationPreview> =>
    toDepreciationPreview(
      await dotnetClient.get<DotnetPreviewDto>(`/accounting/fixed-assets/depreciation/preview${query({ fiscalYear, month })}`)
    ),

  /** POST /accounting/fixed-assets/depreciation/runs — idempotent per asset-month on the server too. */
  run: async (fiscalYear: number, month: number | null, idempotencyKey: string): Promise<{ total: number; vouchers: number }> => {
    const r = await dotnetClient.post<{ totalAmount: number; voucherIds: string[] }>(
      "/accounting/fixed-assets/depreciation/runs",
      { fiscalYear, month },
      idempotencyKey
    )
    return { total: r.totalAmount, vouchers: r.voucherIds.length }
  },

  runs: async (fiscalYear?: number): Promise<DepreciationRun[]> =>
    (await dotnetClient.get<DotnetRunDto[]>(`/accounting/fixed-assets/depreciation/runs${query({ fiscalYear })}`)).map(toRun),

  reverseRun: async (runId: string): Promise<string> =>
    String(await dotnetClient.post<string>(`/accounting/fixed-assets/depreciation/runs/${runId}/reverse`, {})),

  schedule: async (fiscalYear: number): Promise<DepreciationSchedule> =>
    toDepreciationSchedule(
      await dotnetClient.get<DotnetScheduleDto>(`/accounting/fixed-assets/reports/depreciation-schedule${query({ fiscalYear })}`)
    ),

  taxSchedule: async (fiscalYear: number): Promise<TaxDepreciationSchedule> =>
    toTaxSchedule(await dotnetClient.get<DotnetTaxScheduleDto>(`/accounting/fixed-assets/reports/tax-depreciation${query({ fiscalYear })}`)),
}
