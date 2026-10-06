import { apiGetWithMeta } from "@/lib/api/client-helpers"
import { backendTarget } from "@/lib/api/backend-target"
import { dotnetClient } from "@/lib/api/dotnet-client"
import type { DotnetPagedResponse } from "@/lib/api/stock-dotnet"

export interface InventoryTransaction {
  id: string
  transaction_type: "purchase" | "sale" | "adjustment" | "return" | "expired" | "transfer" | "supplier_return"
  quantity: number
  reference_id: string | null
  reference_type: string | null
  reason_code: string | null
  notes: string | null
  transaction_date: string
  medicines: { id: string; name: string } | null
  branches: { id: string; name: string } | null
  users: { id: string; full_name: string } | null
}

export interface InventoryTransactionFilters {
  medicineId?: string
  branchId?: string
  transactionType?: string
  dateFrom?: string
  dateTo?: string
  page?: number
  limit?: number
}

/** InventoryTransactionDto from the .NET Inventory module (camelCase JSON). */
export interface DotnetInventoryTransactionDto {
  id: string
  medicineId: string
  medicineName: string | null
  branchId: string
  medicineBatchId: string | null
  batchNo: string | null
  transactionType: string
  quantityDelta: number
  unitCostPrice: number
  referenceType: string | null
  referenceId: string | null
  notes: string | null
  createdAtUtc: string
}

/** .NET InventoryTransactionType enum names mapped to the legacy transaction_type values. */
const DOTNET_TYPE_TO_LEGACY: Record<string, InventoryTransaction["transaction_type"]> = {
  Purchase: "purchase",
  Sale: "sale",
  Adjustment: "adjustment",
  // SaleReversal and Dispose are the closest .NET meanings of the legacy "return" and "expired" types.
  SaleReversal: "return",
  Dispose: "expired",
  Transfer: "transfer",
  SupplierReturn: "supplier_return",
}

/** Legacy filter values that have an exact .NET enum name. "return" and "expired" stay on the legacy path. */
const LEGACY_TYPE_TO_DOTNET: Record<string, string> = {
  purchase: "Purchase",
  sale: "Sale",
  adjustment: "Adjustment",
}

export function toInventoryTransactionType(dotnetType: string): InventoryTransaction["transaction_type"] {
  const mapped = DOTNET_TYPE_TO_LEGACY[dotnetType]
  if (!mapped) throw new Error(`Unknown inventory transaction type from .NET API: ${dotnetType}`)
  return mapped
}

/** True when the legacy type filter can be sent as a .NET TransactionType (or there is no type filter). */
export function canListTransactionsOnDotnet(filters: InventoryTransactionFilters): boolean {
  return !filters.transactionType || LEGACY_TYPE_TO_DOTNET[filters.transactionType] !== undefined
}

/** Maps an InventoryTransactionDto to the legacy row. The .NET DTO has no user, reason code or branch name. */
export function toInventoryTransaction(dto: DotnetInventoryTransactionDto): InventoryTransaction {
  return {
    id: dto.id,
    transaction_type: toInventoryTransactionType(dto.transactionType),
    quantity: dto.quantityDelta,
    reference_id: dto.referenceId ?? null,
    reference_type: dto.referenceType ?? null,
    reason_code: null,
    notes: dto.notes ?? null,
    transaction_date: dto.createdAtUtc,
    medicines: dto.medicineName ? { id: dto.medicineId, name: dto.medicineName } : null,
    branches: { id: dto.branchId, name: "" },
    users: null,
  }
}

/** Builds the GET /inventory/transactions query from the legacy filters, with the legacy page size (default 50). */
export function buildInventoryTransactionsPath(filters: InventoryTransactionFilters = {}): string {
  const p = new URLSearchParams()
  if (filters.medicineId) p.set("medicineId", filters.medicineId)
  if (filters.branchId) p.set("branchId", filters.branchId)
  if (filters.transactionType) {
    const dotnetType = LEGACY_TYPE_TO_DOTNET[filters.transactionType]
    if (!dotnetType) throw new Error(`Transaction type filter ${filters.transactionType} has no .NET equivalent`)
    p.set("transactionType", dotnetType)
  }
  if (filters.dateFrom) p.set("dateFrom", filters.dateFrom)
  if (filters.dateTo) p.set("dateTo", filters.dateTo)
  p.set("pageNumber", String(Math.max(1, filters.page ?? 1)))
  p.set("pageSize", String(Math.min(200, Math.max(1, filters.limit ?? 50))))
  return `/inventory/transactions?${p.toString()}`
}

function transactionsPath(filters: InventoryTransactionFilters): string {
  const p = new URLSearchParams()
  if (filters.medicineId) p.set("medicineId", filters.medicineId)
  if (filters.branchId) p.set("branchId", filters.branchId)
  if (filters.transactionType) p.set("transactionType", filters.transactionType)
  if (filters.dateFrom) p.set("dateFrom", filters.dateFrom)
  if (filters.dateTo) p.set("dateTo", filters.dateTo)
  if (filters.page != null) p.set("page", String(filters.page))
  if (filters.limit != null) p.set("limit", String(filters.limit))
  const q = p.toString()
  return `/api/inventory/transactions${q ? `?${q}` : ""}`
}

export const inventoryTransactionsApi = {
  list: async (filters: InventoryTransactionFilters = {}) => {
    if (backendTarget("INVENTORY") === "dotnet" && canListTransactionsOnDotnet(filters)) {
      const page = await dotnetClient.get<DotnetPagedResponse<DotnetInventoryTransactionDto>>(buildInventoryTransactionsPath(filters))
      return {
        data: page.items.map(toInventoryTransaction),
        count: page.totalCount,
        page: page.pageNumber,
        limit: page.pageSize,
        totalPages: page.totalPages,
        error: null as string | null,
      }
    }
    const { data, meta } = await apiGetWithMeta<InventoryTransaction[]>(transactionsPath(filters))
    return {
      data: data ?? [],
      count: meta?.total ?? 0,
      page: meta?.page ?? filters.page ?? 1,
      limit: meta?.limit ?? filters.limit ?? 50,
      totalPages: meta?.totalPages ?? 0,
      error: null as string | null,
    }
  },
}
