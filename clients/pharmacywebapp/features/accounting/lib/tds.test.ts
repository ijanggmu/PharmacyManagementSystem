import { describe, expect, it } from "vitest"
import { toTdsReport, type DotnetTdsReportDto } from "@/features/accounting/api-client-tds"
import {
  chooseTdsCategory,
  computeTds,
  EMPTY_TDS,
  effectiveTds,
  etdsCsvRows,
  ETDS_CSV_HEADERS,
  linesMissingPan,
  selectableTdsCategories,
  tdsCategoryInputs,
  tdsCategoryTotalsCsvRows,
  tdsExpenseRequest,
  tdsFieldsFrom,
  tdsPaymentRequest,
  validateTdsCategoryDrafts,
  validateTdsFields,
  type TdsCategory,
  type TdsReportLine,
} from "./tds"

const CATEGORIES: TdsCategory[] = [
  { code: "rent", name: "Rent", rate_percent: 10, is_active: true, sort_order: 0 },
  { code: "service_vat", name: "Service (VAT vendor)", rate_percent: 1.5, is_active: true, sort_order: 1 },
  { code: "interest", name: "Interest", rate_percent: 15, is_active: false, sort_order: 5 },
]

describe("computeTds", () => {
  it("rounds taxable × rate to the paisa, half away from zero", () => {
    expect(computeTds(1000, 1.5)).toBe(15)
    expect(computeTds(1234.56, 1.5)).toBe(18.52)
    expect(computeTds(10000, 10)).toBe(1000)
    expect(computeTds(0.5, 1)).toBe(0.01)
  })

  it("is zero for a missing base or rate", () => {
    expect(computeTds(0, 10)).toBe(0)
    expect(computeTds(100, 0)).toBe(0)
    expect(computeTds(Number.NaN, 10)).toBe(0)
  })
})

describe("category picking", () => {
  it("lists active categories in order, keeping an edit's current one", () => {
    expect(selectableTdsCategories(CATEGORIES).map((c) => c.code)).toEqual(["rent", "service_vat"])
    expect(selectableTdsCategories(CATEGORIES, "interest").map((c) => c.code)).toEqual(["rent", "service_vat", "interest"])
  })

  it("fills the category's rate and goes back to the worked-out amount", () => {
    const next = chooseTdsCategory({ ...EMPTY_TDS, amount: "99" }, CATEGORIES, "service_vat")
    expect(next).toEqual({ category: "service_vat", rate: "1.5", amount: "", taxable: "" })
    expect(chooseTdsCategory(next, CATEGORIES, "")).toEqual(EMPTY_TDS)
  })
})

describe("effective TDS and validation", () => {
  const rent = { category: "rent", rate: "10", amount: "", taxable: "" }

  it("works the amount out on the base excluding VAT unless typed over", () => {
    expect(effectiveTds(rent, 1000)).toBe(100)
    expect(effectiveTds({ ...rent, amount: "95.50" }, 1000)).toBe(95.5)
    expect(effectiveTds({ ...rent, taxable: "500" }, 1000)).toBe(50)
    expect(effectiveTds(EMPTY_TDS, 1000)).toBe(0)
  })

  it("accepts sensible fields and nothing at all", () => {
    expect(validateTdsFields(EMPTY_TDS, 1000)).toBeUndefined()
    expect(validateTdsFields(rent, 1000)).toBeUndefined()
  })

  it("refuses a bad rate, a TDS above the base and nothing to withhold", () => {
    expect(validateTdsFields({ ...rent, rate: "0" }, 1000)).toMatch(/rate/)
    expect(validateTdsFields({ ...rent, rate: "101" }, 1000)).toMatch(/rate/)
    expect(validateTdsFields({ ...rent, amount: "1000.01" }, 1000)).toMatch(/more than the taxable/)
    expect(validateTdsFields({ ...rent, amount: "abc" }, 1000)).toMatch(/TDS amount/)
    expect(validateTdsFields(rent, 0)).toMatch(/nothing/)
  })

  it("keeps a payment's TDS below the payment and its base within it", () => {
    expect(validateTdsFields({ ...rent, amount: "100" }, 100, { mustBeLessThan: 100 })).toMatch(/less than the payment/)
    expect(validateTdsFields({ ...rent, taxable: "150" }, 100, { mustBeLessThan: 100 })).toMatch(/more than the payment/)
    expect(validateTdsFields(rent, 100, { mustBeLessThan: 100 })).toBeUndefined()
  })
})

describe("request mapping", () => {
  it("sends the expense TDS fields, letting the API work out a blank amount", () => {
    expect(tdsExpenseRequest(EMPTY_TDS)).toEqual({ tdsCategory: null, tdsRatePercent: null, tdsAmount: null })
    expect(tdsExpenseRequest({ category: "rent", rate: "10", amount: "", taxable: "" })).toEqual({
      tdsCategory: "rent",
      tdsRatePercent: 10,
      tdsAmount: null,
    })
    expect(tdsExpenseRequest({ category: "rent", rate: "10", amount: "80", taxable: "" }).tdsAmount).toBe(80)
  })

  it("always sends a payment's amount and base (Suppliers doesn't know the rates)", () => {
    expect(tdsPaymentRequest(EMPTY_TDS, 5000)).toBeNull()
    expect(tdsPaymentRequest({ category: "service_vat", rate: "1.5", amount: "", taxable: "" }, 5000)).toEqual({
      tdsAmount: 75,
      tdsCategory: "service_vat",
      tdsRatePercent: 1.5,
      tdsTaxableAmount: 5000,
    })
    expect(tdsPaymentRequest({ category: "service_vat", rate: "1.5", amount: "", taxable: "4424.78" }, 5000)?.tdsAmount).toBe(66.37)
  })

  it("prefills an edit from the saved expense", () => {
    expect(tdsFieldsFrom({ tds_category_code: "rent", tds_rate_percent: 10, tds_amount: 100 })).toEqual({
      category: "rent",
      rate: "10",
      amount: "100.00",
      taxable: "",
    })
    expect(tdsFieldsFrom({ tds_category_code: null, tds_rate_percent: null, tds_amount: 0 })).toEqual(EMPTY_TDS)
  })
})

describe("report and e-TDS export", () => {
  const dto: DotnetTdsReportDto = {
    fromUtc: "2026-06-14T18:15:00Z",
    toUtc: "2026-07-15T18:14:59Z",
    lines: [
      {
        id: "d1",
        // 2026-06-30 00:00 NPT
        deductionDateUtc: "2026-06-29T18:15:00Z",
        sourceType: "Expense",
        sourceId: "e1",
        vendorName: "Himal Landlord",
        pan: "301234567",
        categoryCode: "rent",
        categoryName: "Rent",
        ratePercent: 10,
        taxableAmount: 10000,
        tdsAmount: 1000,
        documentReference: "R-1",
        branchId: null,
      },
      {
        id: "d2",
        deductionDateUtc: "2026-07-01T00:00:00Z",
        sourceType: "SupplierPayment",
        sourceId: "p1",
        vendorName: "Lekhapal",
        pan: null,
        categoryCode: "service_vat",
        categoryName: "Service",
        ratePercent: 1.5,
        taxableAmount: 2000,
        tdsAmount: 30,
        documentReference: null,
        branchId: null,
      },
    ],
    categoryTotals: [
      { categoryCode: "rent", categoryName: "Rent", count: 1, taxableAmount: 10000, tdsAmount: 1000 },
      { categoryCode: "service_vat", categoryName: "Service", count: 1, taxableAmount: 2000, tdsAmount: 30 },
    ],
    totalTaxableAmount: 12000,
    totalTdsAmount: 1030,
    tdsDeposited: 500,
    tdsPayableBalance: 530,
  }

  it("maps the report, dating lines on the Nepal day", () => {
    const report = toTdsReport(dto)
    expect(report.lines[0].date).toBe("2026-06-30")
    expect(report.lines[1].source_type).toBe("SupplierPayment")
    expect(report.total_tds).toBe(1030)
    expect(report.tds_payable_balance).toBe(530)
    expect(report.category_totals.map((t) => t.tds_amount)).toEqual([1000, 30])
  })

  it("flags lines without a PAN", () => {
    expect(linesMissingPan(toTdsReport(dto).lines).map((l) => l.id)).toEqual(["d2"])
  })

  it("lays rows out like the e-TDS upload: PAN, name, payment, TDS, type, BS date", () => {
    const lines: TdsReportLine[] = toTdsReport(dto).lines
    const rows = etdsCsvRows(lines)
    expect(ETDS_CSV_HEADERS[1]).toBe("Withholdee PAN")
    expect(rows[0].slice(0, 7)).toEqual([1, "301234567", "Himal Landlord", "10000.00", "1000.00", "rent", "Rent"])
    expect(String(rows[0][8])).toMatch(/^20\d\d-\d\d-\d\d$/)
    expect(rows[0][9]).toBe("2026-06-30")
    expect(rows[1][1]).toBe("")
  })

  it("appends totals per TDS type", () => {
    const rows = tdsCategoryTotalsCsvRows(toTdsReport(dto))
    expect(rows[0]).toEqual([])
    expect(rows.at(-1)).toEqual(["", "", "Total", "12000.00", "1030.00", "", "", ""])
    expect(rows).toHaveLength(5)
  })
})

describe("settings drafts", () => {
  it("validates codes, names and rates", () => {
    expect(validateTdsCategoryDrafts([{ code: "rent", name: "Rent", rate: "10", is_active: true }])).toEqual({})
    const errors = validateTdsCategoryDrafts([
      { code: "rent", name: "Rent", rate: "10", is_active: true },
      { code: "RENT", name: "Again", rate: "10", is_active: true },
      { code: "bad code", name: "x", rate: "1", is_active: true },
      { code: "x", name: "", rate: "1", is_active: true },
      { code: "y", name: "Y", rate: "0", is_active: true },
    ])
    expect(Object.keys(errors).map(Number)).toEqual([1, 2, 3, 4])
  })

  it("maps drafts to the API inputs", () => {
    expect(tdsCategoryInputs([{ code: " Royalty ", name: " Royalty ", rate: "15", is_active: false }])).toEqual([
      { code: "royalty", name: "Royalty", ratePercent: 15, isActive: false },
    ])
  })
})
