import { apiGet, apiPost, getCSRFToken } from "@/lib/api/client-helpers"

export interface ExpiredBatch {
  id: string
  batch_number: string
  expiry_date: string
  quantity_remaining: number
  received_at: string
  branch_id: string
  medicines: { id: string; name: string; cost_price: number | string } | null
  branches: { id: string; name: string } | null
}

export const expiredBatchesApi = {
  list: async () => {
    const data = await apiGet<ExpiredBatch[]>("/api/inventory/expired-batches")
    return { data: data ?? [], error: null as string | null }
  },

  dispose: async (batchId: string, reason: string) => {
    const token = await getCSRFToken()
    await apiPost(`/api/inventory/batches/${encodeURIComponent(batchId)}/dispose`, { reason }, token)
    return { error: null as string | null }
  },
}
