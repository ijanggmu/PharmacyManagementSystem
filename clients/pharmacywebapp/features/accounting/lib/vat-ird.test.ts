import { describe, expect, it } from "vitest"
import type { IrdPurchaseRegisterRow, IrdSalesRegisterRow } from "@/lib/api/ird-api"
import {
  ANNEX_14_COLUMNS,
  IRD_REGISTERS,
  PURCHASE_REGISTER_COLUMNS,
  SALES_REGISTER_COLUMNS,
  humanizeStatus,
  irdColumnTotals,
  irdDate,
  irdRegisterMeta,
  irdRegisterTable,
  irdTableCsvRows,
  vatRegisterCrossCheck,
} from "./ird-registers"
import { buildTaxReportPrintHtml } from "./ird-print"
import {
  hasOperationalCrossCheck,
  vatComputationLines,
  vatPosition,
  vatPositionCopy,
  vatSummaryCsvRows,
  type VatReturnFigures,
} from "./vat-summary"

const vat = (over: Partial<VatReturnFigures> = {}): VatReturnFigures => ({
  period_from: "2026-09-17",
  period_to: "2026-10-16",
  output_vat_gl: 1300,
  input_vat_gl: 400,
  net_vat_payable: 900,
  output_vat_operational: 0,
  input_vat_operational: 0,
  gl_vs_operational_output_diff: 0,
  gl_vs_operational_input_diff: 0,
  trial_balance_ok: true,
  ...over,
})

const sale = (over: Partial<IrdSalesRegisterRow> = {}): IrdSalesRegisterRow => ({
  id: "s1",
  sale_number: null,
  invoice_number: "INV-1",
  sale_date: "2026-10-01",
  total_amount: 113,
  tax_amount: 13,
  discount_amount: 0,
  taxable_amount: 100,
  exempt_amount: 0,
  payment_method: "cash",
  ird_status: "Synced",
  customer_id: null,
  customer_name: "Walk-in",
  customer_phone: "",
  customer_email: "",
  ...over,
})

const purchase = (over: Partial<IrdPurchaseRegisterRow> = {}): IrdPurchaseRegisterRow => ({
  id: "p1",
  order_number: "p1",
  purchase_number: "p1",
  order_date: "2026-10-02",
  status: "PartiallyReceived",
  total_amount: 500.555,
  taxable_amount: 443,
  exempt_amount: 0,
  tax_amount: 57.555,
  supplier_name: "Acme",
  supplier_tax_invoice_numbers: "",
  ...over,
})

describe("vat-summary", () => {
  it("classifies the net VAT position", () => {
    expect(vatPosition(900)).toBe("payable")
    expect(vatPosition(-50)).toBe("refundable")
    expect(vatPosition(0.004)).toBe("nil")
    expect(vatPositionCopy("refundable").netLabel).toBe("Net VAT refundable")
  })

  it("builds the computation with input VAT as a deduction", () => {
    const { lines, net } = vatComputationLines(vat())
    expect(lines.map((l) => l.amount)).toEqual([1300, -400])
    expect(net.amount).toBe(900)
    expect(net.label).toBe("Net VAT payable")
  })

  it("shows returns/adjustments as their own line so the computation adds up to the net", () => {
    const { lines, net } = vatComputationLines(vat({ output_vat_gl: 1300, output_vat_adjustments: 130, input_vat_gl: 400, net_vat_payable: 770 }))
    expect(lines.map((l) => l.key)).toEqual(["output", "adjustments", "input"])
    expect(lines.map((l) => l.amount)).toEqual([1300, -130, -400])
    expect(lines.reduce((s, l) => s + l.amount, 0)).toBe(net.amount)
  })

  it("lists VAT paid to IRD in the CSV as a settlement, outside the computation", () => {
    const csv = vatSummaryCsvRows(vat({ vat_settled: 500 }))
    expect(csv).toContainEqual(["VAT paid to IRD in the period", "Settlement, not part of the return", "500.00"])
    expect(vatComputationLines(vat({ vat_settled: 500 })).lines.map((l) => l.amount)).toEqual([1300, -400])
  })

  it("hides the operational cross-check when the API reports none", () => {
    expect(hasOperationalCrossCheck(vat())).toBe(false)
    expect(hasOperationalCrossCheck(vat({ output_vat_operational: 10 }))).toBe(true)
    const csv = vatSummaryCsvRows(vat())
    expect(csv.some((r) => r[0].includes("per sales records"))).toBe(false)
    expect(csv).toContainEqual(["Status", "", "Payable to IRD"])
    expect(csv).toContainEqual(["Trial balance", "", "Balanced"])
  })
})

describe("ird-registers", () => {
  it("lists four registers with lookups", () => {
    expect(IRD_REGISTERS).toHaveLength(4)
    expect(irdRegisterMeta("annex-13").badge).toBe("Annex 13")
    expect(irdRegisterMeta("purchase-register").side).toBe("purchase")
  })

  it("formats dates and statuses", () => {
    expect(irdDate("2026-10-01")).toBe("2026-10-01")
    expect(irdDate("")).toBe("")
    expect(humanizeStatus("PartiallyReceived")).toBe("Partially received")
    expect(humanizeStatus("not_sent")).toBe("Not sent")
  })

  it("totals only money columns and skips null amounts", () => {
    const rows = [sale(), sale({ id: "s2", tax_amount: null, taxable_amount: null, total_amount: 50, discount_amount: 5 })]
    const totals = irdColumnTotals(rows, SALES_REGISTER_COLUMNS)
    const at = (key: string) => totals[SALES_REGISTER_COLUMNS.findIndex((c) => c.key === key)]
    expect(at("total_amount")).toBe(163)
    expect(at("tax_amount")).toBe(13)
    expect(at("taxable_amount")).toBe(100)
    expect(at("exempt_amount")).toBe(0)
    expect(at("discount_amount")).toBe(5)
    expect(at("customer_name")).toBeNull()
  })

  it("builds a table with a labelled totals row and CSV money at 2 dp", () => {
    const table = irdRegisterTable([purchase(), purchase({ id: "p2", total_amount: 99.445 })], ANNEX_14_COLUMNS)
    expect(table.headers[0]).toBe("Date")
    expect(table.totals[0]).toBe("Total (2)")
    expect(table.totals[table.totals.length - 1]).toBe(600)
    const csv = irdTableCsvRows(table, ANNEX_14_COLUMNS.map((c) => c.kind))
    expect(csv).toHaveLength(3)
    expect(csv[2][csv[2].length - 1]).toBe("600.00")
    expect(csv[0][3]).toBeNull()
  })

  it("totals the purchase register's taxable value and VAT", () => {
    const table = irdRegisterTable(
      [purchase({ total_amount: 113, taxable_amount: 100, tax_amount: 13 }), purchase({ id: "p2", total_amount: 226, taxable_amount: 200, tax_amount: 26 })],
      PURCHASE_REGISTER_COLUMNS,
    )
    const at = (key: string) => table.totals[PURCHASE_REGISTER_COLUMNS.findIndex((c) => c.key === key)]
    expect(at("taxable_amount")).toBe(300)
    expect(at("tax_amount")).toBe(39)
    expect(at("total_amount")).toBe(339)
  })

  it("totals exempt purchases separately from taxable ones, net of void reversals and debit notes", () => {
    const rows = [
      purchase({ total_amount: 213, taxable_amount: 100, exempt_amount: 100, tax_amount: 13 }),
      purchase({ id: "p2", source: "DirectGoodsReceiptVoid", total_amount: -113, taxable_amount: -100, exempt_amount: 0, tax_amount: -13 }),
      purchase({ id: "p3", source: "DebitNote", total_amount: -40, taxable_amount: 0, exempt_amount: -40, tax_amount: 0 }),
    ]
    for (const columns of [PURCHASE_REGISTER_COLUMNS, ANNEX_14_COLUMNS]) {
      const table = irdRegisterTable(rows, columns)
      const at = (key: string) => table.totals[columns.findIndex((c) => c.key === key)]
      expect(at("taxable_amount")).toBe(0)
      expect(at("exempt_amount")).toBe(60)
      expect(at("tax_amount")).toBe(0)
      expect(at("total_amount")).toBe(60)
    }
  })

  it("labels void reversals and debit notes in the purchase register status", () => {
    const status = PURCHASE_REGISTER_COLUMNS.find((c) => c.key === "status")!
    expect(status.value(purchase({ source: "DirectGoodsReceiptVoid", status: "Voided" }))).toBe("Void reversal")
    expect(status.value(purchase({ source: "DebitNote", status: "DebitNote" }))).toBe("Debit note")
  })

  it("cross-checks register VAT against the ledger", () => {
    expect(vatRegisterCrossCheck(130, 130.004).matches).toBe(true)
    const off = vatRegisterCrossCheck(130, 117)
    expect(off.matches).toBe(false)
    expect(off.difference).toBe(13)
  })
})

describe("ird-print", () => {
  it("escapes values and renders totals", () => {
    const html = buildTaxReportPrintHtml({
      title: "Sales <book>",
      organisation: "R&D Pharmacy",
      subtitle: ["Period: x"],
      headers: ["Customer", "Total"],
      numeric: [false, true],
      rows: [["<script>", "1.00"]],
      totals: ["Total (1)", "1.00"],
      printedAt: new Date(2026, 9, 9),
    })
    expect(html).toContain("Sales &lt;book&gt;")
    expect(html).toContain("R&amp;D Pharmacy")
    expect(html).toContain("&lt;script&gt;")
    expect(html).not.toContain("<script>")
    expect(html).toContain("<tfoot>")
    expect(html).toContain('<td class="r">1.00</td>')
  })
})
