/**
 * POS data rules (pure, unit-tested): which stock the till may sell, how the customer picker searches,
 * and which checkout rejections mean the screen's prices/stock are stale.
 */

import type { CustomersFilters } from "@/features/customers/api-client"

/** React Query keys for the POS screen. Under "medicines"/"prescriptions" so every sale invalidates them. */
export const posMedicinesQueryKey = (branchId: string | null | undefined) => ["medicines", "pos", branchId ?? ""] as const
export const posPrescriptionsQueryKey = (branchId: string | null | undefined) =>
  ["prescriptions", "pos", branchId ?? ""] as const
export const posCustomerSearchQueryKey = (query: string) => ["customers", "pos-search", query] as const

/** How many customers the picker shows per search (the server clamps list pages at 200). */
export const POS_CUSTOMER_SEARCH_LIMIT = 50

interface StockRow {
  stock_quantity: number
  branch_stock_quantity?: number
  branch_sellable_stock_quantity?: number
}

/**
 * What the till can sell at this branch: the branch's SELLABLE quantity (not recalled, not expired),
 * falling back to its on-hand quantity, then the tenant total for payloads without branch figures.
 */
export function posSellableQuantity(row: StockRow): number {
  return row.branch_sellable_stock_quantity ?? row.branch_stock_quantity ?? row.stock_quantity
}

/** Medicines with their sellable branch stock as stock_quantity; nothing sellable is left out. */
export function toPosMedicines<T extends StockRow>(rows: readonly T[]): T[] {
  return rows.map((m) => ({ ...m, stock_quantity: posSellableQuantity(m) })).filter((m) => m.stock_quantity > 0)
}

/** Server-side customer search for the picker: active customers only, a small page, by name. */
export function posCustomerSearchFilters(query: string): CustomersFilters {
  const search = query.trim()
  return {
    ...(search ? { search } : {}),
    activity: "active",
    limit: POS_CUSTOMER_SEARCH_LIMIT,
    sortBy: "first_name",
    sortOrder: "asc",
  }
}

/**
 * True when the server refused the checkout because the payments don't match ITS total — the server
 * prices from the current FEFO lot, so the screen's prices (or stock) are stale and must be reloaded.
 */
export function isTotalMismatchError(error: unknown): boolean {
  const message = error instanceof Error ? error.message : typeof error === "string" ? error : ""
  return /sale total|exceeds the sale total|insufficient stock|not enough stock/i.test(message)
}
