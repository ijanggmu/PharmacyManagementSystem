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

/** Web status -> .NET StockTransferStatus name for the list filter. */
const STATUS_TO_DOTNET: Record<StockTransfer["status"], string> = {
  in_transit: "InTransit",
  completed: "Completed",
  cancelled: "Cancelled",
}

/** Query string for GET /inventory/stock-transfers (only set filters are sent). */
export function stockTransfersListQuery(params?: {
  branchId?: string
  status?: StockTransfer["status"]
  pageNumber?: number
  pageSize?: number
}): URLSearchParams {
  const sp = new URLSearchParams({
    pageNumber: String(Math.max(1, params?.pageNumber ?? 1)),
    pageSize: String(Math.min(200, Math.max(1, params?.pageSize ?? 50))),
  })
  if (params?.branchId) sp.set("branchId", params.branchId)
  if (params?.status) sp.set("status", STATUS_TO_DOTNET[params.status])
  return sp
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

/**
 * Fills the from/to branch names and codes the .NET DTO leaves out, from the tenant's branch list.
 * A branch that is no longer in the list (deleted) shows as "Unknown branch" instead of a blank cell.
 */
export function withBranchNames(
  transfer: StockTransfer,
  branches: ReadonlyArray<{ id: string; name: string; code: string }>,
): StockTransfer {
  const resolve = (branch: StockTransfer["from_branch"]) => {
    if (!branch) return branch
    const match = branches.find((b) => b.id === branch.id)
    return match ? { id: branch.id, name: match.name, code: match.code } : { ...branch, name: branch.name || "Unknown branch" }
  }
  return { ...transfer, from_branch: resolve(transfer.from_branch), to_branch: resolve(transfer.to_branch) }
}

export const stockTransfersApi = {
  list: async (params?: {
    branchId?: string
    /** Only transfers in this status; omitted = every status. */
    status?: StockTransfer["status"]
    pageNumber?: number
    pageSize?: number
    /** @deprecated use pageSize */
    limit?: number
  }): Promise<{
    data: StockTransfer[]
    meta: { pageNumber: number; pageSize: number; totalCount: number; totalPages: number }
    error: string | null
  }> => {
    const pageSize = params?.pageSize ?? params?.limit ?? 50
    const pageNumber = params?.pageNumber ?? 1
    try {
      const sp = stockTransfersListQuery({ branchId: params?.branchId, status: params?.status, pageNumber, pageSize })
      const page = await dotnetClient.get<DotnetPagedResponse<DotnetStockTransferDto>>(`/inventory/stock-transfers?${sp}`)
      return {
        data: page.items.map(toStockTransfer),
        meta: { pageNumber: page.pageNumber, pageSize: page.pageSize, totalCount: page.totalCount, totalPages: page.totalPages },
        error: null,
      }
    } catch (error) {
      return {
        data: [],
        meta: { pageNumber, pageSize, totalCount: 0, totalPages: 1 },
        error: stockErrorMessage(error, "Failed to load stock transfers"),
      }
    }
  },

  /** Number of transfers matching the filters (reads totalCount from a one-row page). */
  count: async (params?: { branchId?: string; status?: StockTransfer["status"] }): Promise<number> => {
    const sp = stockTransfersListQuery({ ...params, pageNumber: 1, pageSize: 1 })
    const page = await dotnetClient.get<DotnetPagedResponse<DotnetStockTransferDto>>(`/inventory/stock-transfers?${sp}`)
    return page.totalCount
  },

  /**
   * Dispatches a transfer from the current branch to another branch. Each branch is one stock location on
   * .NET, so the branch ids are sent as-is. The API rejects a from-branch that is not the caller's current branch.
   */
  create: async (
    input: {
      from_branch_id: string
      to_branch_id: string
      notes?: string | null
      items: Array<{ medicine_id: string; quantity: number }>
    },
    /** One per user action, reused when that action is retried (lib/api/idempotency.ts). */
    idempotencyKey?: string,
  ): Promise<{ data: { id: string } | null; error: string | null }> => {
    try {
      const id = await dotnetMutate<string>(
        "/inventory/stock-transfers",
        {
          fromBranchId: input.from_branch_id,
          toBranchId: input.to_branch_id,
          notes: input.notes ?? null,
          items: input.items.map((item) => ({ medicineId: item.medicine_id, quantity: item.quantity })),
        },
        idempotencyKey,
      )
      return { data: { id }, error: null }
    } catch (error) {
      return { data: null, error: stockErrorMessage(error, "Failed to create stock transfer") }
    }
  },

  receive: async (id: string, idempotencyKey?: string): Promise<{ error: string | null }> => {
    try {
      await dotnetMutate(`/inventory/stock-transfers/${encodeURIComponent(id)}/receive`, {}, idempotencyKey)
      return { error: null }
    } catch (error) {
      return { error: stockErrorMessage(error, "Failed to receive stock transfer") }
    }
  },

  cancel: async (id: string, reason: string, idempotencyKey?: string): Promise<{ error: string | null }> => {
    try {
      await dotnetMutate(`/inventory/stock-transfers/${encodeURIComponent(id)}/cancel`, { reason }, idempotencyKey)
      return { error: null }
    } catch (error) {
      return { error: stockErrorMessage(error, "Failed to cancel stock transfer") }
    }
  },
}
