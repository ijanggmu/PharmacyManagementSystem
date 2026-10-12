import NepaliDate from "nepali-date-converter"
import { BS_MONTH_NAMES_EN } from "@/features/calendar/nepali-utils"
import type { Sale, SaleItem } from "@/features/sales/api-client"

const NEPAL_TZ = "Asia/Kathmandu"

function num(value: string | number | null | undefined): number {
  if (value === null || value === undefined || value === "") return 0
  const n = typeof value === "number" ? value : Number.parseFloat(value)
  return Number.isFinite(n) ? n : 0
}

function round2(value: number): number {
  return Math.round(value * 100) / 100
}

/** Gross (before discount) value of one line. */
export function lineGross(item: Pick<SaleItem, "quantity" | "unit_price">): number {
  return round2(item.quantity * num(item.unit_price))
}

/** Currency discount on one line; falls back to gross − line total when the API sent none. */
export function lineDiscount(item: Pick<SaleItem, "quantity" | "unit_price" | "total_price" | "discount_amount">): number {
  if (item.discount_amount !== undefined) return num(item.discount_amount)
  return Math.max(0, round2(lineGross(item) - num(item.total_price)))
}

export interface SaleTotals {
  /** Sum of qty × unit price, before discounts. */
  subtotal: number
  discount: number
  /** Taxable value excluding VAT; null on sales recorded before the VAT split was stored. */
  taxable: number | null
  vat: number
  vatRatePercent: number | null
  /** Total of VAT-exempt lines; null when not stored. */
  exempt: number | null
  /** Grand total (VAT-inclusive prices, net of discount). */
  total: number
  paid: number
  balanceDue: number
}

/**
 * Totals breakdown for the sale detail, using the VAT split stored on the sale at checkout (prices are
 * VAT-inclusive, so taxable + VAT + exempt = total). Older sales without a stored split show no
 * taxable/exempt rows.
 */
export function computeSaleTotals(sale: Sale): SaleTotals {
  const subtotal = round2(sale.sale_items.reduce((sum, item) => sum + lineGross(item), 0))
  const discount = round2(sale.sale_items.reduce((sum, item) => sum + lineDiscount(item), 0))
  const total = num(sale.total_amount)
  const balanceDue = num(sale.balance_due)
  const paid = sale.paid_amount !== undefined ? num(sale.paid_amount) : round2(total - balanceDue)
  return {
    subtotal,
    discount,
    taxable: sale.taxable_amount ?? null,
    vat: num(sale.tax_amount),
    vatRatePercent: sale.vat_rate_percent ?? null,
    exempt: sale.exempt_amount ?? null,
    total,
    paid,
    balanceDue,
  }
}

export interface SaleMargin {
  /** Cost of goods sold: Σ qty × unit cost at sale time. */
  cost: number
  /** Revenue excluding VAT (prices are VAT-inclusive). */
  netRevenue: number
  /** netRevenue − cost. */
  profit: number
  /** profit / netRevenue × 100, or null when there is no revenue. */
  marginPercent: number | null
}

/**
 * Gross margin on a sale. Null when no line carries a unit cost (payloads recorded before cost was
 * stored), so the UI never shows a fake 100% margin.
 */
export function computeSaleMargin(sale: Sale): SaleMargin | null {
  const hasCost = sale.sale_items.some((item) => num(item.unit_cost_price) > 0)
  if (!hasCost) return null
  const cost = round2(sale.sale_items.reduce((sum, item) => sum + item.quantity * num(item.unit_cost_price), 0))
  const netRevenue = round2(num(sale.total_amount) - num(sale.tax_amount))
  const profit = round2(netRevenue - cost)
  return {
    cost,
    netRevenue,
    profit,
    marginPercent: netRevenue > 0 ? Math.round((profit / netRevenue) * 1000) / 10 : null,
  }
}

/** "500mg · Tablet", or "" when neither is known. */
export function medicineDetail(medicines: SaleItem["medicines"]): string {
  if (!medicines) return ""
  return [medicines.strength, medicines.form].filter((part) => part && part.trim()).join(" · ")
}

/** The calendar day an instant falls on in Nepal, as yyyy-mm-dd. */
export function nepalYmd(iso: string): string | null {
  const date = new Date(iso)
  if (Number.isNaN(date.getTime())) return null
  const parts = new Intl.DateTimeFormat("en-CA", { timeZone: NEPAL_TZ, year: "numeric", month: "2-digit", day: "2-digit" })
    .formatToParts(date)
  const get = (type: string) => parts.find((p) => p.type === type)?.value ?? ""
  return `${get("year")}-${get("month")}-${get("day")}`
}

/** AD and BS labels of a sale instant in Nepal time, e.g. { ad: "5 Oct 2026, 11:45 AM", bs: "19 Ashwin 2083" }. */
export function formatSaleDate(iso: string): { ad: string; bs: string } {
  const date = new Date(iso)
  if (Number.isNaN(date.getTime())) return { ad: "", bs: "" }
  const ad = date.toLocaleString("en-GB", {
    timeZone: NEPAL_TZ,
    day: "numeric",
    month: "short",
    year: "numeric",
    hour: "numeric",
    minute: "2-digit",
    hour12: true,
  })
  const ymd = nepalYmd(iso)
  let bs = ""
  if (ymd) {
    try {
      const [y, m, d] = ymd.split("-").map(Number)
      const nd = NepaliDate.fromAD(new Date(y, m - 1, d))
      bs = `${nd.getDate()} ${BS_MONTH_NAMES_EN[nd.getMonth()]} ${nd.getYear()} BS`
    } catch {
      bs = ""
    }
  }
  return { ad, bs }
}

const METHOD_LABELS: Record<string, string> = {
  cash: "Cash",
  card: "Card",
  insurance: "Insurance",
  fonepay: "Fonepay",
  esewa: "eSewa",
  khalti: "Khalti",
  bank: "Bank transfer",
  credit: "Credit (on account)",
  mixed: "Split payment",
  other: "Other",
}

export function paymentMethodLabel(method: string): string {
  return METHOD_LABELS[method.toLowerCase()] ?? method
}

/** Any sale that isn't cancelled can take a return; on a credit sale the server cancels what is still owed first. */
export function canReturnSale(sale: Pick<Sale, "status">): boolean {
  return sale.status !== "cancelled"
}
