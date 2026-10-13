import { describe, expect, it } from "vitest"
import { toVatReturnReport, type DotnetVatReturnReportDto } from "@/lib/api/accounting-reports-api"
import { bsMonthOfRange, bsMonthRangeOf, recentBsMonths } from "./date-presets"
import {
  irdReconciliationRows,
  irdReconciliationWarning,
  irdReturnCsvRows,
  irdReturnPrintRows,
  irdTurnoverSections,
  irdVatComputation,
  mapVatIrdReturn,
  type VatIrdReturn,
} from "./vat-ird-return"
import { formatLocalDateYmd } from "@/lib/utils/date"

const dto = (over: Partial<DotnetVatReturnReportDto> = {}): DotnetVatReturnReportDto => ({
  fromUtc: "2026-09-16T18:15:00Z",
  toUtc: "2026-10-17T18:14:59.999Z",
  vatCollected: 130,
  vatRefundedOrAdjusted: 13,
  netVatPayable: 117,
  inputVat: 39,
  netVatDue: 78,
  vatSettled: 0,
  sales: {
    taxableSales: 1000,
    outputVat: 130,
    exemptSales: 400,
    exportSales: 0,
    unclassifiedSales: 0,
    returnsTaxable: 100,
    returnsExempt: 0,
    returnsVat: 13,
    netTaxableSales: 900,
    netExemptSales: 400,
    netOutputVat: 117,
    netTotalSales: 1300,
    invoiceCount: 12,
    creditNoteCount: 1,
  },
  purchases: {
    taxablePurchases: 400,
    inputVat: 52,
    exemptPurchases: 200,
    importPurchases: 0,
    importVat: 0,
    debitNotesTaxable: 100,
    debitNotesExempt: 0,
    debitNotesVat: 13,
    netTaxablePurchases: 300,
    netExemptPurchases: 200,
    netInputVat: 39,
    netTotalPurchases: 500,
    billCount: 4,
    debitNoteCount: 1,
  },
  carryForward: {
    openingPosition: -30,
    creditBroughtForward: 30,
    unpaidVatBroughtForward: 0,
    netVatForPeriod: 78,
    vatPayable: 48,
    creditCarriedForward: 0,
    vatPaidInPeriod: 0,
    closingPosition: 48,
  },
  reconciliation: {
    registerOutputVat: 117,
    ledgerOutputVat: 117,
    outputVatDifference: 0,
    registerInputVat: 39,
    ledgerInputVat: 39,
    inputVatDifference: 0,
    hasDifference: false,
  },
  ...over,
})

const ledger = { output_vat_gl: 130, output_vat_adjustments: 13, input_vat_gl: 39 }
const fmt = (n: number) => n.toFixed(2)
const ird = (over: Partial<DotnetVatReturnReportDto> = {}): VatIrdReturn => {
  const mapped = mapVatIrdReturn(dto(over))
  if (!mapped) throw new Error("expected IRD sections")
  return mapped
}

describe("mapVatIrdReturn", () => {
  it("maps every section to snake_case", () => {
    const r = ird()
    expect(r.sales.net_total).toBe(1300)
    expect(r.sales.invoice_count).toBe(12)
    expect(r.purchases.debit_notes_vat).toBe(13)
    expect(r.carry_forward.credit_brought_forward).toBe(30)
    expect(r.reconciliation.has_difference).toBe(false)
  })

  it("returns null for an API build without the IRD sections", () => {
    expect(mapVatIrdReturn({ sales: dto().sales })).toBeNull()
  })
})

describe("toVatReturnReport", () => {
  it("fills the register cross-check from the reconciliation (ledger − registers)", () => {
    const report = toVatReturnReport(
      dto({
        reconciliation: {
          registerOutputVat: 117,
          ledgerOutputVat: 217,
          outputVatDifference: -100,
          registerInputVat: 39,
          ledgerInputVat: 39,
          inputVatDifference: 0,
          hasDifference: true,
        },
      }),
      "2026-09-17",
      "2026-10-17",
      true,
    )
    expect(report.output_vat_operational).toBe(117)
    expect(report.gl_vs_operational_output_diff).toBe(100)
    expect(report.net_vat_payable).toBe(78)
    expect(report.ird?.reconciliation.has_difference).toBe(true)
  })

  it("keeps working without the IRD sections", () => {
    const { sales: _s, purchases: _p, carryForward: _c, reconciliation: _r, ...old } = dto()
    const report = toVatReturnReport(old, "2026-09-17", "2026-10-17", false)
    expect(report.ird).toBeNull()
    expect(report.output_vat_operational).toBe(0)
    expect(report.trial_balance_ok).toBe(false)
  })
})

describe("irdTurnoverSections", () => {
  it("lists sales and purchases in IRD order with deductions that add up to each total", () => {
    const [sales, purchases] = irdTurnoverSections(ird())
    expect(sales.rows.map((r) => r.key)).toEqual([
      "taxable_sales",
      "exempt_sales",
      "export_sales",
      "sales_returns_taxable",
      "sales_returns_exempt",
    ])
    const sum = (rows: { value: number }[]) => rows.reduce((s, r) => s + r.value, 0)
    const sumVat = (rows: { vat: number | null }[]) => rows.reduce((s, r) => s + (r.vat ?? 0), 0)
    expect(sum(sales.rows)).toBe(sales.total.value)
    expect(sumVat(sales.rows)).toBe(sales.total.vat)
    expect(sum(purchases.rows)).toBe(purchases.total.value)
    expect(sumVat(purchases.rows)).toBe(purchases.total.vat)
    expect(purchases.rows.find((r) => r.key === "debit_notes_taxable")?.vat).toBe(-13)
  })

  it("adds a review line only when sales lack a VAT breakdown", () => {
    const withUnclassified = ird({ sales: { ...dto().sales!, unclassifiedSales: 75, netTotalSales: 1375 } })
    const [sales] = irdTurnoverSections(withUnclassified)
    expect(sales.rows.some((r) => r.key === "unclassified_sales")).toBe(true)
    expect(irdTurnoverSections(ird())[0].rows.some((r) => r.key === "unclassified_sales")).toBe(false)
  })

  it("shows fixed asset sales with VAT on their own line, out of the register's taxable sales", () => {
    // The API folds a 500 + 65 VAT asset sale into taxable sales / output VAT / invoice count.
    const withAssetSale = ird({
      sales: {
        ...dto().sales!,
        taxableSales: 1500,
        outputVat: 195,
        netTaxableSales: 1400,
        netOutputVat: 182,
        netTotalSales: 1800,
        invoiceCount: 13,
        fixedAssetSales: 500,
        fixedAssetSalesVat: 65,
        fixedAssetSaleCount: 1,
      },
    })
    const [sales] = irdTurnoverSections(withAssetSale)
    expect(sales.rows.map((r) => r.key).slice(0, 2)).toEqual(["taxable_sales", "fixed_asset_sales"])
    const register = sales.rows.find((r) => r.key === "taxable_sales")!
    expect(register.value).toBe(1000)
    expect(register.vat).toBe(130)
    expect(register.note).toContain("12 invoice(s)")
    const assets = sales.rows.find((r) => r.key === "fixed_asset_sales")!
    expect(assets.value).toBe(500)
    expect(assets.vat).toBe(65)
    const sum = (rows: { value: number }[]) => rows.reduce((s, r) => s + r.value, 0)
    const sumVat = (rows: { vat: number | null }[]) => rows.reduce((s, r) => s + (r.vat ?? 0), 0)
    expect(sum(sales.rows)).toBe(sales.total.value)
    expect(sumVat(sales.rows)).toBe(sales.total.vat)
  })
})

describe("irdVatComputation", () => {
  it("sets the credit brought forward against the net VAT", () => {
    const c = irdVatComputation(ledger, ird())
    expect(c.lines.map((l) => l.key)).toEqual(["output", "adjustments", "input", "net", "credit_bf"])
    expect(c.lines.find((l) => l.key === "credit_bf")?.amount).toBe(-30)
    expect(c.outcome).toBe("payable")
    expect(c.result.amount).toBe(48)
  })

  it("carries an unused credit forward", () => {
    const c = irdVatComputation(
      ledger,
      ird({
        carryForward: {
          openingPosition: -100,
          creditBroughtForward: 100,
          unpaidVatBroughtForward: 0,
          netVatForPeriod: 78,
          vatPayable: 0,
          creditCarriedForward: 22,
          vatPaidInPeriod: 0,
          closingPosition: -22,
        },
      }),
    )
    expect(c.outcome).toBe("credit")
    expect(c.result.key).toBe("credit_cf")
    expect(c.result.amount).toBe(22)
  })

  it("is a nil return when nothing is payable or carried", () => {
    const c = irdVatComputation(
      { output_vat_gl: 0, input_vat_gl: 0 },
      ird({
        carryForward: {
          openingPosition: 0,
          creditBroughtForward: 0,
          unpaidVatBroughtForward: 0,
          netVatForPeriod: 0,
          vatPayable: 0,
          creditCarriedForward: 0,
          vatPaidInPeriod: 0,
          closingPosition: 0,
        },
      }),
    )
    expect(c.outcome).toBe("nil")
    expect(c.lines.some((l) => l.key === "adjustments")).toBe(false)
  })
})

describe("reconciliation", () => {
  it("flags only the side that differs", () => {
    const r = ird({
      reconciliation: {
        registerOutputVat: 117,
        ledgerOutputVat: 217,
        outputVatDifference: -100,
        registerInputVat: 39,
        ledgerInputVat: 39,
        inputVatDifference: 0,
        hasDifference: true,
      },
    })
    expect(irdReconciliationRows(r).map((x) => x.matches)).toEqual([false, true])
    expect(irdReconciliationWarning(r, fmt)).toBe("Output VAT: registers 117.00 vs ledger 217.00 (difference -100.00)")
    expect(irdReconciliationWarning(ird(), fmt)).toBeNull()
  })
})

describe("CSV and print", () => {
  it("exports every section, the computation, carry-forward and reconciliation", () => {
    const rows = irdReturnCsvRows(ledger, ird())
    expect(rows).toContainEqual(["Sales", "Taxable sales", "1000.00", "130.00", "12 invoice(s) in the IRD sales register"])
    expect(rows).toContainEqual(["Purchases", "Total purchases", "500.00", "39.00", ""])
    expect(rows).toContainEqual(["VAT computation", "VAT payable for this return", "48.00", "", "Net VAT − credit brought forward"])
    expect(rows).toContainEqual(["Reconciliation", "Output VAT difference", "0.00", "", "Matches"])
    expect(rows.every((r) => r.length === 5)).toBe(true)
  })

  it("marks section and subtotal rows for print", () => {
    const { rows, sectionRowIndexes } = irdReturnPrintRows(ledger, ird(), fmt)
    expect(rows[sectionRowIndexes[0]]).toEqual(["Sales", null, null])
    expect(sectionRowIndexes.map((i) => rows[i][0])).toContain("Total purchases")
    expect(rows.every((r) => r.length === 3)).toBe(true)
  })
})

describe("BS month periods", () => {
  it("round-trips a BS month to its exact range", () => {
    const month = { year: 2083, month0: 5 } // Ashwin 2083
    const range = bsMonthRangeOf(month)
    expect(formatLocalDateYmd(range.from)).toBe("2026-09-17")
    expect(formatLocalDateYmd(range.to)).toBe("2026-10-17")
    expect(bsMonthOfRange(range)).toEqual(month)
    expect(bsMonthOfRange({ from: range.from, to: new Date(2026, 9, 10) })).toBeNull()
  })

  it("lists recent months newest first across the year boundary", () => {
    const months = recentBsMonths(new Date(2026, 4, 1), 3) // Baisakh 2083
    expect(months).toEqual([
      { year: 2083, month0: 0 },
      { year: 2082, month0: 11 },
      { year: 2082, month0: 10 },
    ])
  })
})
