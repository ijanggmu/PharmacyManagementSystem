/**
 * Physical stock counts on the .NET Inventory module (/inventory/stock-counts). HTTP only, through the BFF
 * proxy. Reading needs Inventory.Batches.View; every write needs Inventory.Batches.AdjustStock.
 */

import { dotnetClient } from "@/lib/api/dotnet-client"
import type { DotnetPagedResponse } from "@/lib/api/stock-dotnet"
import type { StockCountDetail, StockCountSession, StockCountStatus } from "@/features/stock-counts/lib/stock-count"

export interface CreateStockCountInput {
  title?: string | null
  categoryId?: string | null
  rackLocation?: string | null
  supplierId?: string | null
  notes?: string | null
}

/**
 * One counted figure: `lineId` for a lot already on the sheet, or a found lot (`medicineId` with an existing
 * `batchId`, or a new `batchNo` + `expiryDate`). `countedQuantity: null` clears a line's count.
 */
export interface StockCountEntry {
  lineId?: string | null
  countedQuantity: number | null
  note?: string | null
  medicineId?: string | null
  batchId?: string | null
  batchNo?: string | null
  expiryDate?: string | null
  rackLocation?: string | null
}

export type StockCountTransition = "SubmitForReview" | "Reopen" | "Cancel"

export interface StockCountListFilters {
  page?: number
  pageSize?: number
  status?: StockCountStatus | "all"
}

export function stockCountsListPath(filters: StockCountListFilters = {}): string {
  const params = new URLSearchParams()
  params.set("pageNumber", String(filters.page ?? 1))
  params.set("pageSize", String(filters.pageSize ?? 20))
  if (filters.status && filters.status !== "all") params.set("status", filters.status)
  return `/inventory/stock-counts?${params}`
}

const base = (id: string) => `/inventory/stock-counts/${encodeURIComponent(id)}`

export const stockCountsApi = {
  list: (filters: StockCountListFilters = {}) =>
    dotnetClient.get<DotnetPagedResponse<StockCountSession>>(stockCountsListPath(filters)),
  get: (id: string) => dotnetClient.get<StockCountDetail>(base(id)),
  create: (input: CreateStockCountInput, idempotencyKey?: string) =>
    dotnetClient.post<string>("/inventory/stock-counts", input, idempotencyKey),
  start: (id: string) => dotnetClient.post<string>(`${base(id)}/start`),
  record: (id: string, entries: StockCountEntry[]) =>
    dotnetClient.post<string[]>(`${base(id)}/counts`, { entries }),
  transition: (id: string, transition: StockCountTransition) =>
    dotnetClient.post<string>(`${base(id)}/status`, { transition }),
  post: (id: string, idempotencyKey?: string) =>
    dotnetClient.post<StockCountSession>(`${base(id)}/post`, {}, idempotencyKey),
}

export const stockCountKeys = {
  all: ["stock-counts"] as const,
  list: (filters: StockCountListFilters) => ["stock-counts", "list", filters] as const,
  detail: (id: string) => ["stock-counts", "detail", id] as const,
}
