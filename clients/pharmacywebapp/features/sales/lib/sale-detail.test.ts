import { describe, expect, it } from "vitest"
import type { Sale } from "@/features/sales/api-client"
import { computeSaleMargin, computeSaleTotals, formatSaleDate, lineDiscount, medicineDetail, nepalYmd, paymentMethodLabel } from "./sale-detail"

function sale(overrides: Partial<Sale> = {}): Sale {
  return {
    id: "s1",
    sale_number: "INV-1",
    customer_id: "",
    total_amount: "283.00",
    discount_amount: "17.00",
    tax_amount: "13.00",
    payment_method: "cash",
    payment_status: "pending",
    sale_date: "2026-10-05T06:00:00Z",
    notes: null,
    created_at: "2026-10-05T06:00:00Z",
    customers: null,
    vat_rate_percent: 13,
    taxable_amount: 100,
    exempt_amount: 170,
    paid_amount: "200.00",
    balance_due: "83.00",
    sale_items: [
      // 1 × 113 taxable, no discount
      { id: "i1", sale_id: "s1", medicine_id: "m1", quantity: 1, unit_price: "113.00", total_price: "113.00", discount_amount: "0.00", is_taxable: true, medicines: null },
      // 2 × 93.50 exempt, 17 off → 170
      { id: "i2", sale_id: "s1", medicine_id: "m2", quantity: 2, unit_price: "93.50", total_price: "170.00", discount_amount: "17.00", is_taxable: false, medicines: null },
    ],
    ...overrides,
  }
}

describe("computeSaleTotals", () => {
  it("breaks the total into subtotal, discount and the stored VAT split", () => {
    expect(computeSaleTotals(sale())).toEqual({
      subtotal: 300,
      discount: 17,
      taxable: 100,
      vat: 13,
      vatRatePercent: 13,
      exempt: 170,
      total: 283,
      paid: 200,
      balanceDue: 83,
    })
  })

  it("shows no taxable or exempt split on sales recorded before it was stored", () => {
    const totals = computeSaleTotals(sale({ taxable_amount: null, exempt_amount: null, vat_rate_percent: null, tax_amount: "0.00" }))
    expect(totals.taxable).toBeNull()
    expect(totals.exempt).toBeNull()
    expect(totals.vat).toBe(0)
  })

  it("derives paid from total and balance when the paid amount is absent", () => {
    expect(computeSaleTotals(sale({ paid_amount: undefined })).paid).toBe(200)
  })
})

describe("line helpers", () => {
  it("falls back to gross minus line total when no line discount was sent", () => {
    expect(lineDiscount({ quantity: 2, unit_price: "50.00", total_price: "90.00" })).toBe(10)
    expect(lineDiscount({ quantity: 2, unit_price: "50.00", total_price: "90.00", discount_amount: "4.00" })).toBe(4)
  })

  it("joins the strength and form that are known", () => {
    expect(medicineDetail({ id: "m", name: "ORS", strength: "", form: "Powder" })).toBe("Powder")
    expect(medicineDetail({ id: "m", name: "Paracetamol", strength: "500mg", form: "Tablet" })).toBe("500mg · Tablet")
    expect(medicineDetail(null)).toBe("")
  })

  it("labels payment methods, passing unknown ones through", () => {
    expect(paymentMethodLabel("Fonepay")).toBe("Fonepay")
    expect(paymentMethodLabel("mixed")).toBe("Split payment")
    expect(paymentMethodLabel("voucher")).toBe("voucher")
  })
})

describe("Nepal-time dates", () => {
  it("puts an instant on its Nepal calendar day (UTC+05:45)", () => {
    expect(nepalYmd("2026-10-04T18:14:00Z")).toBe("2026-10-04")
    expect(nepalYmd("2026-10-04T18:15:00Z")).toBe("2026-10-05")
  })

  it("formats the AD and BS dates of a sale", () => {
    const { ad, bs } = formatSaleDate("2026-10-05T06:00:00Z")
    expect(ad).toContain("2026")
    expect(bs).toMatch(/^\d{1,2} [A-Za-z]+ 208\d BS$/)
  })
})

describe("computeSaleMargin", () => {
  it("is null when no line carries a cost", () => {
    expect(computeSaleMargin(sale())).toBeNull()
  })

  it("compares cost with revenue net of VAT", () => {
    const withCost = sale({
      sale_items: sale().sale_items.map((item) => ({ ...item, unit_cost_price: "50.00" })),
    })
    // cost 3 × 50 = 150; net revenue 283 − 13 = 270; profit 120; 44.4%
    expect(computeSaleMargin(withCost)).toEqual({ cost: 150, netRevenue: 270, profit: 120, marginPercent: 44.4 })
  })
})
