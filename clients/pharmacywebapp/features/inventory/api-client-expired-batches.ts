import { dotnetClient } from "@/lib/api/dotnet-client"
import { dotnetGetAllPages, dotnetMutate, stockErrorMessage, type DotnetPagedResponse } from "@/lib/api/stock-dotnet"

export interface ExpiredBatch {
  id: string
  batch_number: string
  expiry_date: string
  quantity_remaining: number
  received_at: string
  branch_id: string
  medicines: { id: string; name: string; cost_price: number | string } | null
  branches: { id: string; name: string } | null
  /** True when the lot was separately recalled (never write-offs stock) — distinct from an ordinary expiry. */
  is_recalled: boolean
}

/** ExpiredBatchDto from the .NET Inventory module. */
export interface DotnetExpiredBatchDto {
  batchId: string
  medicineId: string
  medicineName: string
  batchNo: string
  expiryDate: string
  quantityOnHand: number
  costPrice: number
  receivedAtUtc: string
  branchId: string
  rackLocation: string | null
  isRecalled: boolean
}

/** Maps a .NET expired batch to the legacy row. The DTO has only the branch id: screens resolve the name from the branch list. */
export function toExpiredBatch(dto: DotnetExpiredBatchDto): ExpiredBatch {
  return {
    id: dto.batchId,
    batch_number: dto.batchNo,
    expiry_date: dto.expiryDate,
    quantity_remaining: dto.quantityOnHand,
    received_at: dto.receivedAtUtc,
    branch_id: dto.branchId,
    medicines: { id: dto.medicineId, name: dto.medicineName, cost_price: dto.costPrice },
    branches: null,
    is_recalled: dto.isRecalled,
  }
}

export const expiredBatchesApi = {
  /**
   * One page of expired batches. `isRecalled` optionally narrows to just recalled-and-expired
   * batches (true) or plain expired ones (false); omitted (default) returns both, undifferentiated
   * other than the `is_recalled` flag on each row. The .NET endpoint pages for real
   * (`PagedResponse<ExpiredBatchDto>`), so only the requested page is fetched.
   */
  list: async (
    isRecalled?: boolean,
    pageNumber = 1,
    pageSize = 10,
    branchId?: string,
  ): Promise<{ data: ExpiredBatch[]; totalCount: number; totalPages: number; pageNumber: number; error: string | null }> => {
    try {
      const sp = new URLSearchParams({ pageNumber: String(pageNumber), pageSize: String(pageSize) })
      if (isRecalled !== undefined) sp.set("isRecalled", String(isRecalled))
      if (branchId) sp.set("branchId", branchId)
      const page = await dotnetClient.get<DotnetPagedResponse<DotnetExpiredBatchDto>>(`/inventory/reports/expired-batches?${sp}`)
      return {
        data: page.items.map(toExpiredBatch),
        totalCount: page.totalCount,
        totalPages: page.totalPages,
        pageNumber: page.pageNumber,
        error: null,
      }
    } catch (error) {
      return { data: [], totalCount: 0, totalPages: 1, pageNumber, error: stockErrorMessage(error, "Failed to load expired batches") }
    }
  },

  dispose: async (batchId: string, reason: string) => {
    await dotnetMutate(`/inventory/batches/${encodeURIComponent(batchId)}/dispose`, { reason })
    return { error: null as string | null }
  },

  /**
   * Every expired batch for the filter, fetched page by page. Used only for the page's
   * "value at cost" stat, which needs a sum across the whole filtered set, not just the visible page.
   */
  listAll: async (isRecalled?: boolean, branchId?: string): Promise<{ data: ExpiredBatch[]; error: string | null }> => {
    try {
      const query: Record<string, string | undefined> = {}
      if (isRecalled !== undefined) query.isRecalled = String(isRecalled)
      if (branchId) query.branchId = branchId
      const rows = await dotnetGetAllPages<DotnetExpiredBatchDto>("/inventory/reports/expired-batches", query)
      return { data: rows.map(toExpiredBatch), error: null }
    } catch (error) {
      return { data: [], error: stockErrorMessage(error, "Failed to load expired batches") }
    }
  },
}
