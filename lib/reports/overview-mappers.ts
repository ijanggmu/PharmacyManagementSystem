/**
 * Pure mappers from the existing, already-.NET-wired list shapes (Sale, Medicine) to the row shapes
 * the Reports overview page's chart/table components expect. No new backend calls are made here —
 * these just reshape data that `salesApi.getSales` / `medicinesApi.getMedicines` already return.
 */
import type { Sale, SaleItem } from "@/features/sales/api-client"
import type { Medicine } from "@/features/medicines/api-client"
import type {
  DotnetCategoryPerformanceDto,
  DotnetCustomerGrowthPointDto,
  DotnetTopSellingMedicineDto,
} from "@/lib/api/reports-api"

export interface ReportsSalesRow {
  sale_date: string
  total_amount: string
}

export interface ReportsRevenueRow {
  total_amount: string
  sale_date: string
  payment_method: string
  customer_id?: string | null
}

export interface ReportsInventoryRow {
  name: string
  stock_quantity: number
  minimum_stock: number
  unit_price: string
  categories: { name: string } | null
}

/** Sales-trend chart row: one point per sale (the chart itself groups by date). */
export function mapSaleToSalesRow(sale: Sale): ReportsSalesRow {
  return { sale_date: sale.sale_date, total_amount: sale.total_amount }
}

export function mapSalesToSalesRows(sales: Sale[]): ReportsSalesRow[] {
  return sales.map(mapSaleToSalesRow)
}

/** Revenue/payment-method row: same sale, plus payment method and customer for repeat-buyer stats. */
export function mapSaleToRevenueRow(sale: Sale): ReportsRevenueRow {
  return {
    total_amount: sale.total_amount,
    sale_date: sale.sale_date,
    payment_method: sale.payment_method,
    customer_id: sale.customer_id || null,
  }
}

export function mapSalesToRevenueRows(sales: Sale[]): ReportsRevenueRow[] {
  return sales.map(mapSaleToRevenueRow)
}

/** Top-products table reads individual sale line items, so the list of sales is flattened. */
export function flattenSaleItemsForTopProducts(sales: Sale[]): SaleItem[] {
  return sales.flatMap((sale) => sale.sale_items)
}

/** Inventory/low-stock/category rows reuse the same Medicine shape the inventory page already renders. */
export function mapMedicineToInventoryRow(medicine: Medicine): ReportsInventoryRow {
  return {
    name: medicine.name,
    stock_quantity: medicine.stock_quantity,
    minimum_stock: medicine.minimum_stock,
    unit_price: medicine.unit_price,
    categories: medicine.categories,
  }
}

export function mapMedicinesToInventoryRows(medicines: Medicine[]): ReportsInventoryRow[] {
  return medicines.map(mapMedicineToInventoryRow)
}

// ---------------------------------------------------------------------------
// Whole-period chart aggregates (top products, category performance, customer growth) — map the
// .NET aggregate DTOs (computed server-side over the full date range) to the row shapes the
// existing chart components read. See lib/api/reports-api.ts for the fetch functions.
// ---------------------------------------------------------------------------

/**
 * TopProducts reads SaleItem-shaped rows and groups them by medicine name/strength/form itself.
 * Each whole-period aggregate row already carries one medicine's final totals, so it is mapped to
 * exactly one synthetic SaleItem — the component's own group-by is then a no-op per medicine.
 */
export function mapTopSellingMedicinesToSaleItems(rows: DotnetTopSellingMedicineDto[]): SaleItem[] {
  return rows.map((row) => ({
    id: row.medicineId,
    sale_id: "",
    medicine_id: row.medicineId,
    quantity: row.quantity,
    unit_price: row.quantity > 0 ? (row.revenue / row.quantity).toFixed(2) : "0.00",
    total_price: row.revenue.toFixed(2),
    medicines: { id: row.medicineId, name: row.name, strength: "", form: "" },
  }))
}

export interface CategoryPerformanceRow {
  category: string
  value: number
  items: number
}

/**
 * Category names live in the Reference module and are resolved client-side (categoriesApi), not by
 * the Inventory aggregate itself — see getCategoryPerformance's doc comment. A category id missing
 * from the lookup map, or a null categoryId, both read as "Uncategorized".
 */
export function mapCategoryPerformanceToRows(
  rows: DotnetCategoryPerformanceDto[],
  categoryNameById: Map<string, string>,
): CategoryPerformanceRow[] {
  return rows
    .map((row) => ({
      category: (row.categoryId && categoryNameById.get(row.categoryId)) || "Uncategorized",
      value: row.revenue,
      items: row.medicineCount,
    }))
    .sort((a, b) => b.value - a.value)
}

export interface CustomerGrowthChartPoint {
  month: string
  customers: number
}

/** One point per calendar month already bucketed server-side (Customer.CreatedAtUtc), in order. */
export function mapCustomerGrowthPointsToChartRows(rows: DotnetCustomerGrowthPointDto[]): CustomerGrowthChartPoint[] {
  return rows.map((row) => ({
    month: new Date(row.monthStartUtc).toLocaleString(undefined, { month: "short", year: "numeric" }),
    customers: row.newCustomers,
  }))
}
