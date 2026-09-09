import { apiGet, apiPost, getCSRFToken, apiRequestErrorMessage } from "@/lib/api/client-helpers"

export interface ConsignmentPosition {
  batch_id: string
  medicine_id: string
  medicine_name: string
  batch_number: string
  supplier_id: string
  supplier_name: string
  quantity_received: number
  quantity_remaining: number
  settled_quantity: number
  unsettled_sold_quantity: number
  unit_cost: number
  unsettled_value: number
}

export interface ConsignmentSettlement {
  id: string
  supplier_id: string
  supplier_name: string
  settlement_date: string
  total_quantity: number
  total_value: number
  voucher_id: string | null
  created_at: string
}

export const consignmentApi = {
  receive: async (input: {
    medicine_id: string
    supplier_id: string
    branch_id?: string | null
    quantity: number
    unit_cost: number
    batch_number?: string | null
    expiry_date?: string | null
    rack_location?: string | null
  }): Promise<{ data: { batchId: string } | null; error: string | null }> => {
    try {
      const token = await getCSRFToken()
      const data = await apiPost<{ batchId: string }>("/api/consignment/receive", input, token)
      return { data, error: null }
    } catch (error) {
      return { data: null, error: apiRequestErrorMessage(error) || "Failed to receive consignment stock" }
    }
  },

  getPositions: async (supplierId?: string): Promise<{ data: ConsignmentPosition[]; error: string | null }> => {
    try {
      const q = supplierId ? `?supplierId=${encodeURIComponent(supplierId)}` : ""
      const data = await apiGet<ConsignmentPosition[]>(`/api/consignment/positions${q}`)
      return { data: data ?? [], error: null }
    } catch (error) {
      return { data: [], error: apiRequestErrorMessage(error) || "Failed to load consignment positions" }
    }
  },

  getSettlements: async (supplierId?: string): Promise<{ data: ConsignmentSettlement[]; error: string | null }> => {
    try {
      const q = supplierId ? `?supplierId=${encodeURIComponent(supplierId)}` : ""
      const data = await apiGet<ConsignmentSettlement[]>(`/api/consignment/settlements${q}`)
      return { data: data ?? [], error: null }
    } catch (error) {
      return { data: [], error: apiRequestErrorMessage(error) || "Failed to load settlements" }
    }
  },

  settle: async (supplierId: string, settlementDate?: string): Promise<{ data: { settlementId: string | null; totalQuantity: number; totalValue: number } | null; error: string | null }> => {
    try {
      const token = await getCSRFToken()
      const data = await apiPost<{ settlementId: string | null; totalQuantity: number; totalValue: number }>(
        "/api/consignment/settlements",
        { supplier_id: supplierId, settlement_date: settlementDate },
        token
      )
      return { data, error: null }
    } catch (error) {
      return { data: null, error: apiRequestErrorMessage(error) || "Failed to settle" }
    }
  },
}
