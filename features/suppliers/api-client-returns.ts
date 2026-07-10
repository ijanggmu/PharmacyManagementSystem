import { apiPost, getCSRFToken } from "@/lib/api/client-helpers"

export interface CreateSupplierReturnInput {
  supplier_id: string
  notes?: string
  items: Array<{
    medicine_id: string
    quantity: number
    unit_cost: number
    return_reason: string
    notes?: string
  }>
}

export const supplierReturnsApi = {
  async create(input: CreateSupplierReturnInput): Promise<{ data: unknown | null; error: string | null }> {
    try {
      const token = await getCSRFToken()
      const data = await apiPost("/api/supplier-returns", input, token)
      return { data, error: null }
    } catch (error) {
      return {
        data: null,
        error: error instanceof Error ? error.message : "Failed to create supplier return",
      }
    }
  },
}

