import { apiGet, apiPost, getCSRFToken, apiRequestErrorMessage } from "@/lib/api/client-helpers"
import { backendTarget } from "@/lib/api/backend-target"
import { dotnetGetAllPages, stockErrorMessage } from "@/lib/api/stock-dotnet"

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
  }
}

export const consignmentApi = {
  /** Legacy only: the .NET receive command also requires a selling price and batch number, which this form does not collect. */
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
    if (backendTarget("INVENTORY") === "dotnet") {
      try {
        // Legacy returns every position in one list, so walk all .NET pages.
        const items = await dotnetGetAllPages<DotnetConsignmentPositionDto>("/inventory/consignment/positions", { supplierId })
        return { data: items.map(toConsignmentPosition), error: null }
      } catch (error) {
        return { data: [], error: stockErrorMessage(error, "Failed to load consignment positions") }
      }
    }
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

  /** Legacy only: the .NET settle command returns just the settlement id, not the totals this UI shows. */
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
