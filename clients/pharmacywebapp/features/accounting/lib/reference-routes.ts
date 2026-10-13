/**
 * Maps a voucher's source document (reference_type / reference_id) to where it lives in the app.
 *
 * The .NET API posts system vouchers with PascalCase reference types (see the accounting
 * integration-event handlers): Sale, Return, Refund, PurchaseOrder, DirectGoodsReceipt,
 * MedicineStockReceipt, InventoryOpeningStock, InventoryStockPurchase, InventoryAdjustment, CustomerPayment, SupplierPayment,
 * ConsignmentSettlement, Expense, BankDeposit, VatPayment, TdsPayment, StockTransferIn/StockTransferOut, SupplierReturn, SaleCancellation,
 * FixedAsset, FixedAssetDisposal, DepreciationRun, Onboarding, Migration*, OpeningBalance, CustomerOpeningBalance, SupplierOpeningBalance; reversals use "reversal" with the
 * original voucher's id.
 *
 * None of the target pages accept a record id in the URL yet, so links go to the list page the
 * document appears on, and the UI shows the reference id with a copy button so it can be searched.
 */

export type ReferenceTarget =
  | { kind: "voucher"; label: string; voucherId: string }
  | { kind: "page"; label: string; href: string; deepLink: false }
  | { kind: "none"; label: string }

/** Opening balances live on Chart of accounts › Opening balances (the old settings URL only redirects there). */
export const OPENING_BALANCES_HREF = "/dashboard/reports/accounting/chart-of-accounts?view=opening-balances"

interface RouteEntry {
  label: string
  href: string
}

const ROUTES: Record<string, RouteEntry> = {
  sale: { label: "Sale", href: "/dashboard/sales" },
  salecancellation: { label: "Sale cancellation", href: "/dashboard/sales" },
  return: { label: "Sales return", href: "/dashboard/returns" },
  salereturn: { label: "Sales return", href: "/dashboard/returns" },
  refund: { label: "Refund", href: "/dashboard/refunds" },
  supplierreturn: { label: "Purchase return", href: "/dashboard/returns?tab=supplier" },
  purchaseorder: { label: "Purchase order", href: "/dashboard/purchases" },
  directgoodsreceipt: { label: "Goods receipt", href: "/dashboard/purchases" },
  medicinestockreceipt: { label: "Stock receipt", href: "/dashboard/purchases" },
  customerpayment: { label: "Customer receipt", href: "/dashboard/customers" },
  supplierpayment: { label: "Supplier payment", href: "/dashboard/suppliers" },
  consignmentsettlement: { label: "Consignment settlement", href: "/dashboard/inventory/consignment" },
  inventoryopeningstock: { label: "Opening stock", href: "/dashboard/inventory" },
  inventorystockpurchase: { label: "Stock purchase (no supplier bill)", href: "/dashboard/inventory" },
  inventoryadjustment: { label: "Stock adjustment", href: "/dashboard/inventory" },
  expense: { label: "Expense", href: "/dashboard/expenses" },
  stocktransferin: { label: "Stock transfer in", href: "/dashboard/stock-transfers" },
  stocktransferout: { label: "Stock transfer out", href: "/dashboard/stock-transfers" },
  stocktransfer: { label: "Stock transfer", href: "/dashboard/stock-transfers" },
  bankdeposit: { label: "Bank deposit", href: "/dashboard/reports/accounting/cash" },
  vatpayment: { label: "VAT payment", href: "/dashboard/reports/accounting/vat" },
  tdspayment: { label: "TDS deposit", href: "/dashboard/reports/accounting/vat?view=tds" },
  onboarding: { label: "Opening balances", href: OPENING_BALANCES_HREF },
  openingbalance: { label: "Opening balances", href: OPENING_BALANCES_HREF },
  customeropeningbalance: { label: "Customer opening balance", href: OPENING_BALANCES_HREF },
  supplieropeningbalance: { label: "Supplier opening balance", href: OPENING_BALANCES_HREF },
  fixedasset: { label: "Fixed asset", href: "/dashboard/reports/accounting/fixed-assets" },
  fixedassetdisposal: { label: "Fixed asset disposal", href: "/dashboard/reports/accounting/fixed-assets" },
  depreciationrun: { label: "Depreciation run", href: "/dashboard/reports/accounting/fixed-assets?view=depreciation" },
  fiscalyearclose: { label: "Year-end close", href: "/dashboard/reports/accounting/statements?view=balance-sheet" },
}

/** "PurchaseOrder", "purchase_order" and "purchase-order" all normalise to "purchaseorder". */
export function normaliseReferenceType(type: string | null | undefined): string {
  return (type ?? "").toLowerCase().replace(/[\s_-]+/g, "")
}

/** Human label for a reference type, e.g. "PurchaseOrder" -> "Purchase order". */
export function referenceTypeLabel(type: string | null | undefined): string {
  const key = normaliseReferenceType(type)
  if (!key) return "—"
  if (key === "reversal") return "Reversal of voucher"
  if (key.startsWith("migrationopening")) return "Opening balances (migration)"
  const known = ROUTES[key]
  if (known) return known.label
  // Split PascalCase / snake_case into words.
  const words = String(type)
    .replace(/([a-z])([A-Z])/g, "$1 $2")
    .replace(/[_-]+/g, " ")
    .trim()
    .toLowerCase()
  return words.charAt(0).toUpperCase() + words.slice(1)
}

export function resolveReference(
  referenceType: string | null | undefined,
  referenceId: string | null | undefined,
): ReferenceTarget {
  const key = normaliseReferenceType(referenceType)
  if (!key) return { kind: "none", label: "Manual entry" }
  const label = referenceTypeLabel(referenceType)
  if (key === "reversal") {
    return referenceId ? { kind: "voucher", label, voucherId: referenceId } : { kind: "none", label }
  }
  if (key.startsWith("migrationopening")) {
    return { kind: "page", label, href: OPENING_BALANCES_HREF, deepLink: false }
  }
  const route = ROUTES[key]
  if (route) return { kind: "page", label, href: route.href, deepLink: false }
  return { kind: "none", label }
}
