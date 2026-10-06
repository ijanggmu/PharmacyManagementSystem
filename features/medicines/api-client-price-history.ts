import { apiGet, apiPost, apiDelete, getCSRFToken, apiRequestErrorMessage } from "@/lib/api/client-helpers"
import { backendTarget } from "@/lib/api/backend-target"
import { catalogDotnetApi } from "@/lib/api/catalog-api"

export interface MedicinePriceHistoryRow {
  id: string
  medicine_id: string
  unit_price: number
  cost_price: number | null
  effective_from: string
  effective_to: string | null
  status: "scheduled" | "active" | "superseded" | "cancelled"
  source: "trigger" | "manual"
  reason: string | null
  created_at: string
}

export const priceHistoryApi = {
  list: async (medicineId: string): Promise<{ data: MedicinePriceHistoryRow[]; error: string | null }> => {
    try {
      if (backendTarget("CATALOG") === "dotnet") return { data: await catalogDotnetApi.listPriceHistory(medicineId), error: null }
      const data = await apiGet<MedicinePriceHistoryRow[]>(`/api/medicines/${encodeURIComponent(medicineId)}/price-history`)
      return { data: data ?? [], error: null }
    } catch (error) {
      return { data: [], error: apiRequestErrorMessage(error) || "Failed to load price history" }
    }
  },

  schedule: async (
    medicineId: string,
    input: { unit_price: number; effective_from: string; cost_price?: number | null; reason?: string | null }
  ): Promise<{ data: { id: string } | null; error: string | null }> => {
    try {
      if (backendTarget("CATALOG") === "dotnet") {
        return { data: await catalogDotnetApi.schedulePriceChange(medicineId, input), error: null }
      }
      const token = await getCSRFToken()
      const data = await apiPost<{ id: string }>(`/api/medicines/${encodeURIComponent(medicineId)}/price-history`, input, token)
      return { data, error: null }
    } catch (error) {
      return { data: null, error: apiRequestErrorMessage(error) || "Failed to schedule price change" }
    }
  },

  cancelScheduled: async (medicineId: string, historyId: string): Promise<{ error: string | null }> => {
    try {
      if (backendTarget("CATALOG") === "dotnet") {
        await catalogDotnetApi.cancelScheduledPrice(medicineId, historyId)
        return { error: null }
      }
      const token = await getCSRFToken()
      await apiDelete(`/api/medicines/${encodeURIComponent(medicineId)}/price-history/${encodeURIComponent(historyId)}`, token)
      return { error: null }
    } catch (error) {
      return { error: apiRequestErrorMessage(error) || "Failed to cancel scheduled price change" }
    }
  },
}
