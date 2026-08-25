import { apiGetWithMeta } from "@/lib/api/client-helpers"

export interface InventoryTransaction {
  id: string
  transaction_type: "purchase" | "sale" | "adjustment" | "return" | "expired"
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
