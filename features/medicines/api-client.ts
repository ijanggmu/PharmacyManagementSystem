import {
  apiGet,
  apiGetWithMeta,
  apiPost,
  apiPut,
  apiDelete,
  apiRequestErrorMessage,
  getCSRFToken,
} from "@/lib/api/client-helpers"

export interface Medicine {
  id: string
  name: string
  generic_name: string | null
  brand_name: string | null
  strength: string
  form: string
  unit_price: string
  cost_price: string
  /** Tenant-wide total across all branches (maintained aggregate). */
  stock_quantity: number
  /** This medicine's stock at the viewer's currently-selected branch, when known. */
  branch_stock_quantity?: number
  minimum_stock: number
  maximum_stock: number
  expiry_date: string | null
  category_id: string | null
  supplier_id: string | null
  description: string | null
  controlled_substance: boolean
  prescription_required: boolean
  dosage: string | null
  side_effects: string | null
  storage_instructions: string | null
  barcode: string | null
  created_at: string
  updated_at: string
  categories: {
    id: string
    name: string
  } | null
  suppliers: {
    id: string
    name: string
  } | null
}

export interface MedicinesFilters {
  search?: string
  category?: string
  categoryIds?: string[]
  stockStatus?: "all" | "in" | "low" | "out"
  stockStatuses?: ("in" | "low" | "out")[]
  expiryStatus?: "all" | "expiring" | "expired"
  expiryStatuses?: ("expiring" | "expired")[]
  page?: number
  limit?: number
  sortBy?: string
  sortOrder?: "asc" | "desc"
}

export interface MedicinesResponse {
  data: Medicine[]
  total?: number
  error: string | null
}

function medicinesListPath(filters?: MedicinesFilters): string {
  const p = new URLSearchParams()
  if (filters?.search?.trim()) p.set("search", filters.search.trim())
  if (filters?.category && filters.category !== "all") p.set("category", filters.category)
  if (filters?.categoryIds?.length) p.set("categoryIds", filters.categoryIds.join(","))
  if (filters?.stockStatus && filters.stockStatus !== "all") p.set("stockStatus", filters.stockStatus)
  if (filters?.stockStatuses?.length) p.set("stockStatuses", filters.stockStatuses.join(","))
  if (filters?.expiryStatus && filters.expiryStatus !== "all") p.set("expiryStatus", filters.expiryStatus)
  if (filters?.expiryStatuses?.length) p.set("expiryStatuses", filters.expiryStatuses.join(","))
  if (filters?.page != null) p.set("page", String(filters.page))
  if (filters?.limit != null) p.set("limit", String(filters.limit))
  if (filters?.sortBy) p.set("sortBy", filters.sortBy)
  if (filters?.sortOrder) p.set("sortOrder", filters.sortOrder)
  const q = p.toString()
  return `/api/medicines${q ? `?${q}` : ""}`
}

export interface MedicineInventoryStats {
  total: number
  lowStock: number
  expiringSoon: number
  expired: number
  totalValue: number
}

export const medicinesApi = {
  /** Lightweight counts for the Inventory page's stat cards — avoids fetching
   *  every medicine row just to derive 4 numbers. */
  getInventoryStats: async (): Promise<{ data: MedicineInventoryStats | null; error: string | null }> => {
    try {
      const data = await apiGet<MedicineInventoryStats>("/api/medicines/stats")
      return { data, error: null }
    } catch (error) {
      return {
        data: null,
        error: error instanceof Error ? error.message : "Failed to fetch inventory stats",
      }
    }
  },

  getMedicines: async (filters?: MedicinesFilters): Promise<MedicinesResponse> => {
    try {
      const { data, meta } = await apiGetWithMeta<Medicine[]>(medicinesListPath(filters))
      return {
        data: data ?? [],
        total: meta?.total,
        error: null,
      }
    } catch (error) {
      return {
        data: [],
        error: error instanceof Error ? error.message : "Failed to fetch medicines",
      }
    }
  },

  getMedicine: async (id: string): Promise<{ data: Medicine | null; error: string | null }> => {
    try {
      const data = await apiGet<Medicine>(`/api/medicines/${encodeURIComponent(id)}`)
      return { data, error: null }
    } catch (error) {
      return {
        data: null,
        error: error instanceof Error ? error.message : "Failed to fetch medicine",
      }
    }
  },

  createMedicine: async (
    medicine: Omit<
      Medicine,
      "id" | "created_at" | "updated_at" | "categories" | "suppliers" | "unit_price" | "cost_price"
    > & { unit_price: number; cost_price: number }
  ): Promise<{ data: Medicine | null; error: string | null }> => {
    try {
      const token = await getCSRFToken()
      const data = await apiPost<Medicine>("/api/medicines", medicine, token)
      return { data, error: null }
    } catch (error) {
      return {
        data: null,
        error: apiRequestErrorMessage(error) || "Failed to create medicine",
      }
    }
  },

  updateMedicine: async (
    id: string,
    updates: Partial<Medicine>
  ): Promise<{ data: Medicine | null; error: string | null }> => {
    try {
      const token = await getCSRFToken()
      const data = await apiPut<Medicine>(
        `/api/medicines/${encodeURIComponent(id)}`,
        updates,
        token
      )
      return { data, error: null }
    } catch (error) {
      return {
        data: null,
        error: apiRequestErrorMessage(error) || "Failed to update medicine",
      }
    }
  },

  deleteMedicine: async (id: string): Promise<{ error: string | null }> => {
    try {
      const token = await getCSRFToken()
      await apiDelete(`/api/medicines/${encodeURIComponent(id)}`, token)
      return { error: null }
    } catch (error) {
      return {
        error: error instanceof Error ? error.message : "Failed to delete medicine",
      }
    }
  },
}
