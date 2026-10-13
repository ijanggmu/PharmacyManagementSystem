import { dotnetClient } from "@/lib/api/dotnet-client"
import { businessDateInstantUtc, nepalDayEndInclusiveUtc, nepalDayStartUtc, nepalYmdOf } from "@/lib/utils/nepal-time"
import type { TdsCategory, TdsReport } from "@/features/accounting/lib/tds"

/** TdsCategoryDto. */
export interface DotnetTdsCategoryDto {
  code: string
  name: string
  ratePercent: number
  isActive: boolean
  sortOrder: number
}

/** TdsReportDto. */
export interface DotnetTdsReportDto {
  fromUtc: string
  toUtc: string
  lines: {
    id: string
    deductionDateUtc: string
    sourceType: string
    sourceId: string
    vendorName: string
    pan: string | null
    categoryCode: string
    categoryName: string
    ratePercent: number
    taxableAmount: number
    tdsAmount: number
    documentReference: string | null
    branchId: string | null
  }[]
  categoryTotals: { categoryCode: string; categoryName: string; count: number; taxableAmount: number; tdsAmount: number }[]
  totalTaxableAmount: number
  totalTdsAmount: number
  tdsDeposited: number
  tdsPayableBalance: number
}

export function toTdsCategory(dto: DotnetTdsCategoryDto): TdsCategory {
  return { code: dto.code, name: dto.name, rate_percent: dto.ratePercent, is_active: dto.isActive, sort_order: dto.sortOrder }
}

/** Maps the report; each line's date is the Nepal business day of its deduction. Pure (exported for tests). */
export function toTdsReport(dto: DotnetTdsReportDto): TdsReport {
  return {
    lines: dto.lines.map((l) => ({
      id: l.id,
      date: nepalYmdOf(new Date(l.deductionDateUtc)),
      source_type: l.sourceType,
      source_id: l.sourceId,
      vendor_name: l.vendorName,
      pan: l.pan,
      category_code: l.categoryCode,
      category_name: l.categoryName,
      rate_percent: l.ratePercent,
      taxable_amount: l.taxableAmount,
      tds_amount: l.tdsAmount,
      document_reference: l.documentReference,
    })),
    category_totals: dto.categoryTotals.map((t) => ({
      category_code: t.categoryCode,
      category_name: t.categoryName,
      count: t.count,
      taxable_amount: t.taxableAmount,
      tds_amount: t.tdsAmount,
    })),
    total_taxable: dto.totalTaxableAmount,
    total_tds: dto.totalTdsAmount,
    tds_deposited: dto.tdsDeposited,
    tds_payable_balance: dto.tdsPayableBalance,
  }
}

export const tdsApi = {
  /** The tenant's TDS categories (defaults until edited), in display order. */
  categories: async (): Promise<TdsCategory[]> =>
    (await dotnetClient.get<DotnetTdsCategoryDto[]>("/accounting/tds/categories")).map(toTdsCategory),

  /** Saves categories by code (new codes are added) and returns the full list afterwards. */
  saveCategories: async (
    categories: readonly { code: string; name: string; ratePercent: number; isActive: boolean }[],
  ): Promise<TdsCategory[]> =>
    (await dotnetClient.put<DotnetTdsCategoryDto[]>("/accounting/tds/categories", { categories: [...categories] })).map(toTdsCategory),

  /** TDS deducted between two Nepal days (inclusive), optionally for one branch. */
  report: async (from: string, to: string, branchId?: string | null): Promise<TdsReport> => {
    const p = new URLSearchParams({ fromUtc: nepalDayStartUtc(from), toUtc: nepalDayEndInclusiveUtc(to) })
    if (branchId) p.set("branchId", branchId)
    return toTdsReport(await dotnetClient.get<DotnetTdsReportDto>(`/accounting/reports/tds?${p.toString()}`))
  },

  /**
   * POST /accounting/tds/payments — TDS deposited with IRD (Dr TDS Payable / Cr Cash or Bank). The API refuses more
   * than the TDS payable on the payment date (422). One idempotency key per submit.
   */
  recordPayment: async (
    body: { payment_date: string; amount: number; payment_method: string; reference?: string | null },
    idempotencyKey: string,
  ): Promise<{ voucher_id: string }> => {
    const id = await dotnetClient.post<string>(
      "/accounting/tds/payments",
      {
        paymentDateUtc: businessDateInstantUtc(body.payment_date),
        amount: body.amount,
        paymentMethod: body.payment_method,
        reference: body.reference?.trim() || null,
      },
      idempotencyKey,
    )
    return { voucher_id: String(id) }
  },
}
