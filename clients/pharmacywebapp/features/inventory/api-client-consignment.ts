import { DotnetApiError, dotnetClient } from "@/lib/api/dotnet-client"
import { dotnetMutate, stockErrorMessage, type DotnetPagedResponse } from "@/lib/api/stock-dotnet"

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
  branch_id: string | null
}

export interface ConsignmentSettlement {
  id: string
  supplier_id: string
  supplier_name: string
  settlement_date: string
  /** Not stored on .NET settlements, so this is null for every row. */
  total_quantity: number | null
  total_value: number
  voucher_id: string | null
  created_at: string
  branch_id: string | null
}

/** ConsignmentPositionDto from the .NET Inventory module. */
export interface DotnetConsignmentPositionDto {
  id: string
  supplierId: string
  branchId: string | null
  medicineId: string
  medicineName: string | null
  batchId: string
  batchNo: string
  quantityReceived: number
  quantityRemaining: number
  quantitySold: number
  unitCostPrice: number
  settledQuantity: number
  amountOwed: number
  receivedDateUtc: string
}

/** ConsignmentSettlementDto from the .NET Inventory module. */
export interface DotnetConsignmentSettlementDto {
  id: string
  supplierId: string
  branchId: string | null
  totalAmount: number
  positionsSettledCount: number
  settlementDateUtc: string
  settledBy: string
  createdAtUtc: string
  /** Null when the supplier cannot be resolved. */
  supplierName: string | null
}

/**
 * Maps a .NET consignment position to the legacy shape. The .NET DTO has no supplier name, so
 * supplier_name is empty. unsettled_sold_quantity is derived as sold minus settled, and
 * unsettled_value is the .NET amountOwed.
 */
export function toConsignmentPosition(dto: DotnetConsignmentPositionDto): ConsignmentPosition {
  return {
    batch_id: dto.batchId,
    medicine_id: dto.medicineId,
    medicine_name: dto.medicineName ?? "",
    batch_number: dto.batchNo,
    supplier_id: dto.supplierId,
    supplier_name: "",
    quantity_received: dto.quantityReceived,
    quantity_remaining: dto.quantityRemaining,
    settled_quantity: dto.settledQuantity,
    unsettled_sold_quantity: dto.quantitySold - dto.settledQuantity,
    unit_cost: dto.unitCostPrice,
    unsettled_value: dto.amountOwed,
    branch_id: dto.branchId ?? null,
  }
}

/** Maps a .NET settlement to the legacy row. The .NET DTO has no quantity or voucher. */
export function toConsignmentSettlement(dto: DotnetConsignmentSettlementDto): ConsignmentSettlement {
  return {
    id: dto.id,
    supplier_id: dto.supplierId,
    supplier_name: dto.supplierName ?? "",
    settlement_date: dto.settlementDateUtc.slice(0, 10),
    total_quantity: null,
    total_value: dto.totalAmount,
    voucher_id: null,
    created_at: dto.createdAtUtc,
    branch_id: dto.branchId ?? null,
  }
}

/** True when the .NET settle command refused because nothing is owed (404 no positions, 409 nothing sold). */
function isNothingToSettle(error: unknown): boolean {
  return error instanceof DotnetApiError && (error.normalized.status === 404 || error.normalized.status === 409)
}

export const consignmentApi = {
  /**
   * Receives consignment stock. The .NET command takes the batch number, expiry and selling price as
   * optional: a missing batch number is generated, a missing expiry means no expiry, and a missing selling
   * price falls back to the medicine's default. branch_id is not sent because .NET uses the current branch.
   */
  receive: async (input: {
    medicine_id: string
    supplier_id: string
    branch_id?: string | null
    quantity: number
    unit_cost: number
    batch_number?: string | null
    expiry_date?: string | null
    rack_location?: string | null
  },
  /** One per user action, reused when that action is retried (lib/api/idempotency.ts). */
  idempotencyKey?: string,
  ): Promise<{ data: { positionId: string } | null; error: string | null }> => {
    try {
      const positionId = await dotnetMutate<string>(
        "/inventory/consignment/receipts",
        {
          supplierId: input.supplier_id,
          medicineId: input.medicine_id,
          batchNo: input.batch_number?.trim() || null,
          expiryDate: input.expiry_date || null,
          quantity: input.quantity,
          unitCostPrice: input.unit_cost,
          rackLocation: input.rack_location?.trim() || null,
        },
        idempotencyKey,
      )
      return { data: { positionId }, error: null }
    } catch (error) {
      return { data: null, error: stockErrorMessage(error, "Failed to receive consignment stock") }
    }
  },

  /**
   * One page of consignment positions. The .NET endpoint pages for real (`PagedResponse<ConsignmentPositionDto>`),
   * so this requests only the current page — it does not walk every page into memory.
   */
  getPositions: async (params?: {
    supplierId?: string
    branchId?: string
    pageNumber?: number
    pageSize?: number
  }): Promise<{ data: ConsignmentPosition[]; totalCount: number; totalPages: number; pageNumber: number; error: string | null }> => {
    const pageNumber = params?.pageNumber ?? 1
    const pageSize = params?.pageSize ?? 50
    try {
      const sp = new URLSearchParams({ pageNumber: String(pageNumber), pageSize: String(pageSize) })
      if (params?.supplierId) sp.set("supplierId", params.supplierId)
      if (params?.branchId) sp.set("branchId", params.branchId)
      const page = await dotnetClient.get<DotnetPagedResponse<DotnetConsignmentPositionDto>>(`/inventory/consignment/positions?${sp}`)
      return {
        data: page.items.map(toConsignmentPosition),
        totalCount: page.totalCount,
        totalPages: page.totalPages,
        pageNumber: page.pageNumber,
        error: null,
      }
    } catch (error) {
      return { data: [], totalCount: 0, totalPages: 1, pageNumber, error: stockErrorMessage(error, "Failed to load consignment positions") }
    }
  },

  /**
   * One page of settlement history, newest first. The .NET endpoint pages for real
   * (`PagedResponse<ConsignmentSettlementDto>`, replacing the old `Limit` cap), so this requests only
   * the current page — it does not walk every page into memory.
   */
  getSettlements: async (params?: {
    supplierId?: string
    branchId?: string
    pageNumber?: number
    pageSize?: number
  }): Promise<{ data: ConsignmentSettlement[]; totalCount: number; totalPages: number; pageNumber: number; error: string | null }> => {
    const pageNumber = params?.pageNumber ?? 1
    const pageSize = params?.pageSize ?? 50
    try {
      const sp = new URLSearchParams({ pageNumber: String(pageNumber), pageSize: String(pageSize) })
      if (params?.supplierId) sp.set("supplierId", params.supplierId)
      if (params?.branchId) sp.set("branchId", params.branchId)
      const page = await dotnetClient.get<DotnetPagedResponse<DotnetConsignmentSettlementDto>>(`/inventory/consignment/settlements?${sp}`)
      return {
        data: page.items.map(toConsignmentSettlement),
        totalCount: page.totalCount,
        totalPages: page.totalPages,
        pageNumber: page.pageNumber,
        error: null,
      }
    } catch (error) {
      return { data: [], totalCount: 0, totalPages: 1, pageNumber, error: stockErrorMessage(error, "Failed to load consignment settlements") }
    }
  },

  /**
   * Settles everything owed to the supplier. The .NET side returns the settlement id and total amount but
   * not a quantity, so totalQuantity is null for a new settlement. Nothing owed (404/409) is a success with a
   * null settlementId, matching the legacy response.
   */
  settle: async (
    supplierId: string,
    settlementDate?: string,
    idempotencyKey?: string,
  ): Promise<{ data: { settlementId: string | null; totalQuantity: number | null; totalValue: number } | null; error: string | null }> => {
    try {
      const settlement = await dotnetMutate<DotnetConsignmentSettlementDto>(
        "/inventory/consignment/settlements",
        {
          supplierId,
          settlementDateUtc: settlementDate ? `${settlementDate}T00:00:00Z` : undefined,
        },
        idempotencyKey,
      )
      return { data: { settlementId: settlement.id, totalQuantity: null, totalValue: settlement.totalAmount }, error: null }
    } catch (error) {
      if (isNothingToSettle(error)) return { data: { settlementId: null, totalQuantity: 0, totalValue: 0 }, error: null }
      return { data: null, error: stockErrorMessage(error, "Failed to settle consignment") }
    }
  },
}
