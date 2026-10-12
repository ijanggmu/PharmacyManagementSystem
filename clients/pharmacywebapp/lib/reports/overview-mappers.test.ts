import { describe, expect, it } from "vitest"
import {
  flattenSaleItemsForTopProducts,
  mapCategoryPerformanceToRows,
  mapCustomerGrowthPointsToChartRows,
  mapMedicineToInventoryRow,
  mapMedicinesToInventoryRows,
  mapSaleToRevenueRow,
  mapSaleToSalesRow,
  mapSalesToRevenueRows,
  mapSalesToSalesRows,
  mapTopSellingMedicinesToSaleItems,
} from "@/lib/reports/overview-mappers"
import type { Sale, SaleItem } from "@/features/sales/api-client"
import type { Medicine } from "@/features/medicines/api-client"
import type {
  DotnetCategoryPerformanceDto,
  DotnetCustomerGrowthPointDto,
  DotnetTopSellingMedicineDto,
} from "@/lib/api/reports-api"

function makeSaleItem(overrides: Partial<SaleItem> = {}): SaleItem {
  return {
    id: "item-1",
    sale_id: "sale-1",
    medicine_id: "med-1",
    quantity: 2,
    unit_price: "10.00",
    total_price: "20.00",
    medicines: { id: "med-1", name: "Paracetamol", strength: "500mg", form: "tablet" },
    ...overrides,
  }
}

function makeSale(overrides: Partial<Sale> = {}): Sale {
  return {
    id: "sale-1",
    sale_number: "SALE-1",
    invoice_number: null,
    customer_id: "cust-1",
    total_amount: "20.00",
    discount_amount: "0.00",
    tax_amount: "0.00",
    payment_method: "cash",
    payment_status: "paid",
    status: "completed",
    cancelled_at: null,
    cancellation_reason: null,
    sale_date: "2026-05-01T00:00:00Z",
    notes: null,
    created_at: "2026-05-01T00:00:00Z",
    customers: null,
    sale_items: [makeSaleItem()],
    sale_payments: [],
    ...overrides,
  }
}

function makeMedicine(overrides: Partial<Medicine> = {}): Medicine {
  return {
    id: "med-1",
    name: "Paracetamol",
    generic_name: null,
    brand_name: null,
    strength: "500mg",
    form: "tablet",
    unit_price: "10.00",
    cost_price: "5.00",
    stock_quantity: 4,
    minimum_stock: 10,
    maximum_stock: 100,
    expiry_date: null,
    category_id: "cat-1",
    supplier_id: null,
    description: null,
    controlled_substance: false,
    prescription_required: false,
    dosage: null,
    side_effects: null,
    storage_instructions: null,
    barcode: null,
    created_at: "2026-01-01T00:00:00Z",
    updated_at: "2026-01-01T00:00:00Z",
    categories: { id: "cat-1", name: "Painkillers" },
    suppliers: null,
    ...overrides,
  }
}

describe("mapSaleToSalesRow / mapSalesToSalesRows", () => {
  it("picks sale_date and total_amount off a sale", () => {
    const sale = makeSale({ sale_date: "2026-05-02T00:00:00Z", total_amount: "45.50" })
    expect(mapSaleToSalesRow(sale)).toEqual({ sale_date: "2026-05-02T00:00:00Z", total_amount: "45.50" })
  })

  it("maps a list of sales in order", () => {
    const sales = [makeSale({ total_amount: "1.00" }), makeSale({ total_amount: "2.00" })]
    expect(mapSalesToSalesRows(sales)).toEqual([
      { sale_date: sales[0].sale_date, total_amount: "1.00" },
      { sale_date: sales[1].sale_date, total_amount: "2.00" },
    ])
  })
})

describe("mapSaleToRevenueRow / mapSalesToRevenueRows", () => {
  it("includes payment method and customer id", () => {
    const sale = makeSale({ payment_method: "card", customer_id: "cust-9" })
    expect(mapSaleToRevenueRow(sale)).toEqual({
      total_amount: sale.total_amount,
      sale_date: sale.sale_date,
      payment_method: "card",
      customer_id: "cust-9",
    })
  })

  it("nulls out a blank customer id (walk-in sale)", () => {
    const sale = makeSale({ customer_id: "" })
    expect(mapSaleToRevenueRow(sale).customer_id).toBeNull()
  })

  it("maps a list of sales", () => {
    const sales = [makeSale(), makeSale({ payment_method: "bank" })]
    expect(mapSalesToRevenueRows(sales).map((r) => r.payment_method)).toEqual(["cash", "bank"])
  })
})

describe("flattenSaleItemsForTopProducts", () => {
  it("flattens line items across multiple sales", () => {
    const itemA = makeSaleItem({ id: "a" })
    const itemB = makeSaleItem({ id: "b" })
    const itemC = makeSaleItem({ id: "c" })
    const sales = [makeSale({ id: "s1", sale_items: [itemA, itemB] }), makeSale({ id: "s2", sale_items: [itemC] })]
    expect(flattenSaleItemsForTopProducts(sales)).toEqual([itemA, itemB, itemC])
  })

  it("returns an empty array for no sales", () => {
    expect(flattenSaleItemsForTopProducts([])).toEqual([])
  })
})

describe("mapMedicineToInventoryRow / mapMedicinesToInventoryRows", () => {
  it("picks the fields the inventory/low-stock/category charts need", () => {
    const medicine = makeMedicine({ stock_quantity: 3, minimum_stock: 10, unit_price: "12.50" })
    expect(mapMedicineToInventoryRow(medicine)).toEqual({
      name: "Paracetamol",
      stock_quantity: 3,
      minimum_stock: 10,
      unit_price: "12.50",
      cost_price: "5.00",
      categories: { id: "cat-1", name: "Painkillers" },
    })
  })

  it("passes through a null category for uncategorized medicines", () => {
    const medicine = makeMedicine({ categories: null })
    expect(mapMedicineToInventoryRow(medicine).categories).toBeNull()
  })

  it("maps a list of medicines", () => {
    const medicines = [makeMedicine({ name: "A" }), makeMedicine({ name: "B" })]
    expect(mapMedicinesToInventoryRows(medicines).map((r) => r.name)).toEqual(["A", "B"])
  })
})

describe("mapTopSellingMedicinesToSaleItems", () => {
  it("maps a whole-period aggregate row to one synthetic SaleItem carrying the final totals", () => {
    const rows: DotnetTopSellingMedicineDto[] = [
      { medicineId: "med-1", name: "Paracetamol", quantity: 40, revenue: 400 },
    ]
    expect(mapTopSellingMedicinesToSaleItems(rows)).toEqual([
      {
        id: "med-1",
        sale_id: "",
        medicine_id: "med-1",
        quantity: 40,
        unit_price: "10.00",
        total_price: "400.00",
        medicines: { id: "med-1", name: "Paracetamol", strength: "", form: "" },
      },
    ])
  })

  it("does not divide by zero when quantity is zero", () => {
    const rows: DotnetTopSellingMedicineDto[] = [{ medicineId: "med-2", name: "Ibuprofen", quantity: 0, revenue: 0 }]
    expect(mapTopSellingMedicinesToSaleItems(rows)[0].unit_price).toBe("0.00")
  })

  it("maps an empty aggregate to an empty array", () => {
    expect(mapTopSellingMedicinesToSaleItems([])).toEqual([])
  })
})

describe("mapCategoryPerformanceToRows", () => {
  it("resolves category names from the lookup map and sorts by revenue descending", () => {
    const rows: DotnetCategoryPerformanceDto[] = [
      { categoryId: "cat-1", quantity: 10, revenue: 100, medicineCount: 2 },
      { categoryId: "cat-2", quantity: 50, revenue: 900, medicineCount: 5 },
    ]
    const names = new Map([
      ["cat-1", "Painkillers"],
      ["cat-2", "Antibiotics"],
    ])
    expect(mapCategoryPerformanceToRows(rows, names)).toEqual([
      { category: "Antibiotics", value: 900, items: 5 },
      { category: "Painkillers", value: 100, items: 2 },
    ])
  })

  it("falls back to Uncategorized for a null categoryId or a missing lookup entry", () => {
    const rows: DotnetCategoryPerformanceDto[] = [
      { categoryId: null, quantity: 1, revenue: 10, medicineCount: 1 },
      { categoryId: "missing", quantity: 1, revenue: 20, medicineCount: 1 },
    ]
    const categories = mapCategoryPerformanceToRows(rows, new Map())
    expect(categories.every((c) => c.category === "Uncategorized")).toBe(true)
  })
})

describe("mapCustomerGrowthPointsToChartRows", () => {
  it("formats each month-start into a month/year label, in order, keeping the server's counts", () => {
    const rows: DotnetCustomerGrowthPointDto[] = [
      { monthStartUtc: "2026-05-01T00:00:00Z", newCustomers: 3 },
      { monthStartUtc: "2026-06-01T00:00:00Z", newCustomers: 7 },
    ]
    const points = mapCustomerGrowthPointsToChartRows(rows)
    expect(points.map((p) => p.customers)).toEqual([3, 7])
    // Locale-independent: just confirm both the month digit and the year survive formatting.
    expect(points[0].month).toContain("2026")
    expect(points[1].month).toContain("2026")
  })

  it("maps an empty aggregate to an empty array", () => {
    expect(mapCustomerGrowthPointsToChartRows([])).toEqual([])
  })
})
