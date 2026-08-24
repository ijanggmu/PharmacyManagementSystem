import { apiGet, apiPost, getCSRFToken, apiRequestErrorMessage } from "@/lib/api/client-helpers"

export interface StockTransfer {
  id: string
  transfer_number: string
  status: "in_transit" | "completed" | "cancelled"
  notes: string | null
  created_at: string
  received_at?: string | null
  cancelled_at?: string | null
  cancellation_reason?: string | null
  from_branch: { id: string; name: string; code: string } | null
  to_branch: { id: string; name: string; code: string } | null
  stock_transfer_items: {
    id: string
    medicine_id: string
    quantity: number
    medicines: { id: string; name: string; strength: string; form: string } | null
  }[]
}

export const stockTransfersApi = {
  list: async (params?: { branchId?: string; limit?: number }): Promise<{ data: StockTransfer[]; error: string | null }> => {
    try {
      const sp = new URLSearchParams()
      if (params?.branchId) sp.set("branchId", params.branchId)
      if (params?.limit != null) sp.set("limit", String(params.limit))
      const q = sp.toString()
      const data = await apiGet<StockTransfer[]>(`/api/stock-transfers${q ? `?${q}` : ""}`)
      return { data: data ?? [], error: null }
    } catch (error) {
      return { data: [], error: apiRequestErrorMessage(error) || "Failed to load stock transfers" }
    }
  },

  create: async (input: {
    from_branch_id: string
    to_branch_id: string
    notes?: string | null
    items: Array<{ medicine_id: string; quantity: number }>
  }): Promise<{ data: { id: string } | null; error: string | null }> => {
    try {
      const token = await getCSRFToken()
      const data = await apiPost<{ id: string }>("/api/stock-transfers", input, token)
      return { data, error: null }
    } catch (error) {
      return { data: null, error: apiRequestErrorMessage(error) || "Failed to create stock transfer" }
    }
  },

  receive: async (id: string): Promise<{ error: string | null }> => {
    try {
      const token = await getCSRFToken()
      await apiPost(`/api/stock-transfers/${encodeURIComponent(id)}/receive`, {}, token)
      return { error: null }
    } catch (error) {
      return { error: apiRequestErrorMessage(error) || "Failed to receive stock transfer" }
    }
  },

  cancel: async (id: string, reason: string): Promise<{ error: string | null }> => {
    try {
      const token = await getCSRFToken()
      await apiPost(`/api/stock-transfers/${encodeURIComponent(id)}/cancel`, { reason }, token)
      return { error: null }
    } catch (error) {
      return { error: apiRequestErrorMessage(error) || "Failed to cancel stock transfer" }
    }
  },
}
