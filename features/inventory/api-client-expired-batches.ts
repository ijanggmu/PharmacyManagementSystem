import { apiGet, apiPost, getCSRFToken } from "@/lib/api/client-helpers"
import { backendTarget } from "@/lib/api/backend-target"
import { dotnetMutate } from "@/lib/api/stock-dotnet"

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
  /** Legacy only: the .NET expired-batches report (ExpiringBatchDto) has no cost price, received date or branch. */
  list: async () => {
    const data = await apiGet<ExpiredBatch[]>("/api/inventory/expired-batches")
    return { data: data ?? [], error: null as string | null }
  },

  dispose: async (batchId: string, reason: string) => {
    if (backendTarget("INVENTORY") === "dotnet") {
      await dotnetMutate(`/inventory/batches/${encodeURIComponent(batchId)}/dispose`, { reason })
      return { error: null as string | null }
    }
    const token = await getCSRFToken()
    await apiPost(`/api/inventory/batches/${encodeURIComponent(batchId)}/dispose`, { reason }, token)
    return { error: null as string | null }
  },
}
