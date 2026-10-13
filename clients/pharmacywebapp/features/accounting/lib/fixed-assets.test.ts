import { describe, expect, it } from "vitest"
import { toDepreciationPreview, toFixedAsset, toTaxSchedule, type DotnetFixedAssetDto } from "@/features/accounting/api-client-fixed-assets"
import {
  applyCategoryPreset,
  assetCostOf,
  createFixedAssetBody,
  disposalGainLoss,
  emptyFixedAssetForm,
  estimatedAnnualDepreciation,
  fiscalMonthLabel,
  fiscalMonthOf,
  fiscalYearText,
  fixedAssetFormFrom,
  hasFixedAssetErrors,
  lastEndedFiscalMonth,
  previousFiscalMonth,
  recentFiscalYears,
  registerCsvRows,
  registerTotals,
  scheduleCsvHeaders,
  taxCsvRows,
  updateFixedAssetBody,
  validateDisposalForm,
  validateFixedAssetForm,
  type FixedAssetFormValues,
} from "./fixed-assets"

const form = (patch: Partial<FixedAssetFormValues> = {}): FixedAssetFormValues => ({
  ...emptyFixedAssetForm("2026-07-20"),
  name: "Dell laptop",
  amount: "113000",
  vat_amount: "13000",
  bill_number: "INV-77",
  supplier_vat_number: "601111222",
  ...patch,
})

const dto: DotnetFixedAssetDto = {
  id: "a1",
  name: "Fridge",
  category: "Refrigeration & medical equipment",
  assetTag: "FA-1",
  location: null,
  branchId: null,
  acquisitionDateUtc: "2025-07-20T00:00:00Z",
  acquisitionSource: "cash_bank",
  paymentMethod: "bank",
  supplierId: null,
  vendorName: null,
  supplierVatNumber: null,
  billNumber: null,
  cost: 80000,
  vatAmount: 0,
  residualValue: 0,
  depreciationMethod: "straight_line",
  usefulLifeMonths: 96,
  ratePercent: null,
  taxPool: "D",
  taxUsefulLifeYears: null,
  openingAccumulatedDepreciation: 0,
  openingTaxWrittenDownValue: null,
  accumulatedDepreciation: 2500,
  netBookValue: 77500,
  depreciatedThrough: "Ashwin 2082",
  hasPostedDepreciation: true,
  status: "active",
  disposedOnUtc: null,
  disposalKind: null,
  disposalProceeds: null,
  disposalGainLoss: null,
  notes: null,
}

describe("fiscal months", () => {
  it("labels Shrawan–Chaitra with the start year and Baishakh–Ashadh with the next", () => {
    expect(fiscalMonthLabel({ fiscal_year: 2083, month: 1 })).toBe("Shrawan 2083")
    expect(fiscalMonthLabel({ fiscal_year: 2083, month: 9 })).toBe("Chaitra 2083")
    expect(fiscalMonthLabel({ fiscal_year: 2083, month: 10 })).toBe("Baishakh 2084")
    expect(fiscalYearText(2083)).toBe("2083/84")
    expect(fiscalYearText(2099)).toBe("2099/00")
  })

  it("finds the fiscal month of a day (1 Shrawan 2083 = 17 Jul 2026)", () => {
    expect(fiscalMonthOf(new Date(2026, 6, 17))).toEqual({ fiscal_year: 2083, month: 1 })
    expect(fiscalMonthOf(new Date(2026, 6, 16))).toEqual({ fiscal_year: 2082, month: 12 })
    expect(fiscalMonthOf(new Date(2026, 3, 14))).toEqual({ fiscal_year: 2082, month: 10 })
  })

  it("steps back across the year boundary", () => {
    expect(previousFiscalMonth({ fiscal_year: 2083, month: 1 })).toEqual({ fiscal_year: 2082, month: 12 })
    expect(lastEndedFiscalMonth(new Date(2026, 9, 13))).toEqual({ fiscal_year: 2083, month: 2 })
    expect(recentFiscalYears(new Date(2026, 9, 13), 3)).toEqual([2083, 2082, 2081])
  })
})

describe("asset form", () => {
  it("accepts a complete paid-now VAT bill and splits the VAT out of the cost", () => {
    expect(hasFixedAssetErrors(validateFixedAssetForm(form(), "create"))).toBe(false)
    expect(assetCostOf(form())).toBe(100000)
  })

  it("asks for the VAT bill details, the supplier, and a useful life or rate", () => {
    expect(validateFixedAssetForm(form({ bill_number: "" }), "create").bill_number).toBeTruthy()
    expect(validateFixedAssetForm(form({ supplier_vat_number: "" }), "create").supplier_vat_number).toBeTruthy()
    expect(validateFixedAssetForm(form({ source: "supplier", supplier_id: "" }), "create").supplier_id).toBeTruthy()
    expect(validateFixedAssetForm(form({ useful_life_years: "" }), "create").useful_life_years).toBeTruthy()
    expect(validateFixedAssetForm(form({ method: "written_down_value", rate_percent: "0" }), "create").rate_percent).toBeTruthy()
    expect(validateFixedAssetForm(form({ vat_amount: "113000" }), "create").vat_amount).toBeTruthy()
    expect(validateFixedAssetForm(form({ residual_value: "100000" }), "create").residual_value).toBeTruthy()
    expect(validateFixedAssetForm(form({ tax_pool: "E", tax_useful_life_years: "" }), "create").tax_useful_life_years).toBeTruthy()
  })

  it("checks an opening asset's go-live date and depreciation to date", () => {
    const opening = form({ source: "opening", vat_amount: "", amount: "80000", acquisition_date: "2022-07-20", go_live_date: "2022-01-01" })
    expect(validateFixedAssetForm(opening, "create").go_live_date).toBeTruthy()
    expect(validateFixedAssetForm({ ...opening, go_live_date: "2025-07-17", opening_accumulated: "90000" }, "create").opening_accumulated).toBeTruthy()
    expect(hasFixedAssetErrors(validateFixedAssetForm({ ...opening, go_live_date: "2025-07-17", opening_accumulated: "40000" }, "create"))).toBe(false)
  })

  it("builds the create body: life in months, VAT only for a bill, nothing for the other sources", () => {
    const body = createFixedAssetBody(form({ useful_life_years: "3" }))
    expect(body).toMatchObject({
      amount: 113000,
      vatAmount: 13000,
      source: "cash_bank",
      depreciationMethod: "straight_line",
      usefulLifeMonths: 36,
      ratePercent: null,
      taxPool: "B",
      paymentMethod: "bank",
      supplierId: null,
      openingAccumulatedDepreciation: 0,
    })
    const wdv = createFixedAssetBody(form({ method: "written_down_value", rate_percent: "20", source: "supplier", supplier_id: "s1" }))
    expect(wdv).toMatchObject({ usefulLifeMonths: null, ratePercent: 20, paymentMethod: null, supplierId: "s1", vendorName: null })
    const opening = createFixedAssetBody(form({ source: "opening", opening_accumulated: "40000", opening_tax_wdv: "35000" }))
    expect(opening).toMatchObject({ vatAmount: 0, openingAccumulatedDepreciation: 40000, openingTaxWrittenDownValue: 35000 })
  })

  it("round-trips an existing asset into the edit body", () => {
    const asset = toFixedAsset(dto)
    const values = fixedAssetFormFrom(asset)
    expect(values.useful_life_years).toBe("8")
    expect(updateFixedAssetBody("a1", values)).toMatchObject({ id: "a1", usefulLifeMonths: 96, taxPool: "D", residualValue: 0 })
    expect(hasFixedAssetErrors(validateFixedAssetForm(values, "edit"))).toBe(false)
  })

  it("applies a category preset's pool, method and life", () => {
    const v = applyCategoryPreset(form(), "Vehicles")
    expect(v).toMatchObject({ category: "Vehicles", tax_pool: "C", method: "written_down_value", rate_percent: "20" })
    expect(applyCategoryPreset(form(), "Something else").tax_pool).toBe("B")
  })

  it("estimates the first year's depreciation for the hint", () => {
    expect(estimatedAnnualDepreciation(form({ useful_life_years: "4" }))).toBe(25000)
    expect(estimatedAnnualDepreciation(form({ method: "written_down_value", rate_percent: "25" }))).toBe(25000)
    expect(estimatedAnnualDepreciation(form({ amount: "" }))).toBe(0)
  })
})

describe("disposal", () => {
  it("computes the gain or loss against the book value", () => {
    expect(disposalGainLoss(33000, "sale", "35000")).toBe(2000)
    expect(disposalGainLoss(33000, "sale", "30000")).toBe(-3000)
    expect(disposalGainLoss(33000, "write_off", "35000")).toBe(-33000)
  })

  it("needs proceeds and a method for a sale, and a date on/after acquisition", () => {
    const base = { kind: "sale" as const, date: "2025-10-20", proceeds: "", payment_method: "cash", notes: "" }
    expect(validateDisposalForm(base, "2025-07-20").proceeds).toBeTruthy()
    expect(validateDisposalForm({ ...base, proceeds: "100", date: "2025-01-01" }, "2025-07-20").date).toBeTruthy()
    expect(validateDisposalForm({ ...base, kind: "write_off" }, "2025-07-20")).toEqual({})
  })
})

describe("reports", () => {
  it("maps the register row with Nepal business dates", () => {
    const a = toFixedAsset(dto)
    expect(a.acquisition_date).toBe("2025-07-20")
    expect(a.net_book_value).toBe(77500)
    expect(registerTotals([a, { ...a, id: "a2", status: "disposed", cost: 999, net_book_value: 0 }])).toEqual({
      count: 1,
      cost: 80000,
      accumulated: 2500,
      nbv: 77500,
    })
    expect(registerCsvRows([a])[0]).toEqual([
      "Fridge",
      "Refrigeration & medical equipment",
      "FA-1",
      null,
      "2025-07-20",
      "Paid now",
      "80000.00",
      "Straight line",
      96,
      "D",
      "2500.00",
      "77500.00",
      "Ashwin 2082",
      "Active",
    ])
  })

  it("labels the schedule's month columns from Shrawan", () => {
    const headers = scheduleCsvHeaders(2083)
    expect(headers).toContain("Shrawan 2083")
    expect(headers).toContain("Ashadh 2084")
  })

  it("maps the preview and the tax schedule, with a totals row in the CSV", () => {
    const preview = toDepreciationPreview({
      fiscalYear: 2082,
      fiscalYearLabel: "2082/83",
      fromMonth: 1,
      toMonth: 1,
      periodLabel: "Shrawan 2082",
      periodStart: "2025-07-17",
      periodEnd: "2025-08-16",
      lines: [],
      branches: [],
      totalAmount: 0,
      alreadyPostedMonths: 3,
      canPost: false,
      blocker: "Depreciation for this period is already posted.",
    })
    expect(preview).toMatchObject({ already_posted_months: 3, can_post: false, period_end: "2025-08-16" })

    const tax = toTaxSchedule({
      fiscalYear: 2082,
      fiscalYearLabel: "2082/83",
      pools: [
        {
          pool: "B",
          poolName: "Pool B",
          ratePercent: 25,
          openingBase: 0,
          additionsFull: 0,
          additionsTwoThirds: 90000,
          additionsOneThird: 0,
          additionsIncluded: 60000,
          disposalProceeds: 0,
          depreciationBase: 60000,
          depreciation: 15000,
          recapture: 0,
          terminalDeduction: 0,
          deferredAdditions: 30000,
          closingBase: 75000,
          assetCount: 1,
        },
      ],
      totalDepreciation: 15000,
      totalRecapture: 0,
      totalTerminalDeduction: 0,
      note: "confirm",
    })
    const rows = taxCsvRows(tax)
    expect(rows[0]).toEqual(["Pool B", 25, "0.00", "0.00", "90000.00", "0.00", "60000.00", "0.00", "60000.00", "15000.00", "0.00", "0.00", "30000.00", "75000.00"])
    expect(rows.at(-1)?.[0]).toBe("Total")
    expect(rows.at(-1)?.[9]).toBe("15000.00")
  })
})
