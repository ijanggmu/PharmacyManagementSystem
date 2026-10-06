import { apiGet, apiPost, getCSRFToken, apiRequestErrorMessage } from "@/lib/api/client-helpers"
import { backendTarget } from "@/lib/api/backend-target"
import { dotnetClient } from "@/lib/api/dotnet-client"
import { dotnetMutate, stockErrorMessage, type DotnetPagedResponse } from "@/lib/api/stock-dotnet"

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

/** StockTransferDto from the .NET Inventory module (camelCase JSON, enums as strings). */
export interface DotnetStockTransferDto {
  id: string
  transferNumber: string
  fromLocationId: string
  toLocationId: string
  fromBranchId: string
  toBranchId: string
  status: string
  notes: string | null
  createdAtUtc: string
  receivedAtUtc: string | null
  cancelledAtUtc: string | null
  cancellationReason: string | null
  items: { medicineId: string; medicineName: string | null; quantity: number }[]
}

const DOTNET_STATUS: Record<string, StockTransfer["status"]> = {
  InTransit: "in_transit",
  Completed: "completed",
  Cancelled: "cancelled",
}

export function toStockTransferStatus(status: string): StockTransfer["status"] {
  const mapped = DOTNET_STATUS[status]
  if (!mapped) throw new Error(`Unknown stock transfer status from .NET API: ${status}`)
  return mapped
}

/**
 * Maps a .NET transfer to the legacy UI shape. The .NET DTO carries branch and medicine ids only,
 * so branch names/codes and medicine strength/form are not available and come back empty.
 */
export function toStockTransfer(dto: DotnetStockTransferDto): StockTransfer {
  const branch = (id: string) => ({ id, name: "", code: "" })
  return {
    id: dto.id,
    transfer_number: dto.transferNumber,
    status: toStockTransferStatus(dto.status),
    notes: dto.notes,
    created_at: dto.createdAtUtc,
    received_at: dto.receivedAtUtc,
    cancelled_at: dto.cancelledAtUtc,
    cancellation_reason: dto.cancellationReason,
    from_branch: branch(dto.fromBranchId),
    to_branch: branch(dto.toBranchId),
    stock_transfer_items: dto.items.map((item) => ({
      id: `${dto.id}:${item.medicineId}`,
      medicine_id: item.medicineId,
      quantity: item.quantity,
      medicines: item.medicineName ? { id: item.medicineId, name: item.medicineName, strength: "", form: "" } : null,
    })),
  }
}

export const stockTransfersApi = {
  list: async (params?: { branchId?: string; limit?: number }): Promise<{ data: StockTransfer[]; error: string | null }> => {
    if (backendTarget("INVENTORY") === "dotnet") {
      try {
        // Legacy returns the newest `limit` rows in one list, so this is a single page, not a full crawl.
        const sp = new URLSearchParams({ pageNumber: "1", pageSize: String(params?.limit ?? 50) })
        if (params?.branchId) sp.set("branchId", params.branchId)
        const page = await dotnetClient.get<DotnetPagedResponse<DotnetStockTransferDto>>(`/inventory/stock-transfers?${sp}`)
        return { data: page.items.map(toStockTransfer), error: null }
      } catch (error) {
        return { data: [], error: stockErrorMessage(error, "Failed to load stock transfers") }
      }
    }
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

  /** Legacy only: .NET needs ToLocationId/FromLocationId, and the UI has branch ids but no location mapping. */
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
    if (backendTarget("INVENTORY") === "dotnet") {
      try {
        await dotnetMutate(`/inventory/stock-transfers/${encodeURIComponent(id)}/receive`, {})
        return { error: null }
      } catch (error) {
        return { error: stockErrorMessage(error, "Failed to receive stock transfer") }
      }
    }
    try {
      const token = await getCSRFToken()
      await apiPost(`/api/stock-transfers/${encodeURIComponent(id)}/receive`, {}, token)
      return { error: null }
    } catch (error) {
      return { error: apiRequestErrorMessage(error) || "Failed to receive stock transfer" }
    }
  },

  cancel: async (id: string, reason: string): Promise<{ error: string | null }> => {
    if (backendTarget("INVENTORY") === "dotnet") {
      try {
        await dotnetMutate(`/inventory/stock-transfers/${encodeURIComponent(id)}/cancel`, { reason })
        return { error: null }
      } catch (error) {
        return { error: stockErrorMessage(error, "Failed to cancel stock transfer") }
      }
    }
    try {
      const token = await getCSRFToken()
      await apiPost(`/api/stock-transfers/${encodeURIComponent(id)}/cancel`, { reason }, token)
      return { error: null }
    } catch (error) {
      return { error: apiRequestErrorMessage(error) || "Failed to cancel stock transfer" }
    }
  },
}
