import { ApiListResponse, BaseFilters, listApiWrapper } from "@/lib/api/utils"
import {
  createReturnOnDotnet,
  deleteReturnOnDotnet,
  getReturnOnDotnet,
  getReturnsStatsOnDotnet,
  listReturnsOnDotnet,
  updateReturnOnDotnet,
  type ReversalSettlement,
} from "@/lib/api/sales-api"

export interface ReturnItem {
  id: string
  return_id: string
  sale_item_id: string
  quantity_returned: number
  reason: string
  refund_amount: string
  packaging_condition?: "sealed" | "opened" | "damaged"
  restocked?: boolean
  sale_items: {
    id: string
    quantity: number
    unit_price: string
    total_price: string
    medicines: {
      id: string
      name: string
      strength: string
      form: string
    } | null
  } | null
}

export interface Return {
  id: string
  return_number: string
  sale_id: string
  customer_id: string
  return_date: string
  total_return_amount: string
  status: 'pending' | 'approved' | 'rejected' | 'completed'
  reason: string | null
  notes: string | null
  created_at: string
  sales: {
    id: string
    sale_number: string
    total_amount: string
  } | null
  customers: {
    id: string
    first_name: string
    last_name: string
    phone: string | null
  } | null
  return_items: ReturnItem[]
  /** Branch the return was booked at. */
  branch_id?: string | null
  /** original_payment | cash | store_credit ... */
  refund_method?: string | null
  /** How the money went back; null until completed. */
  settlement?: ReversalSettlement | null
  /** Sequential credit-note number, assigned when the return completes. */
  credit_note_number?: string | null
  fiscal_year?: string | null
}

export interface ReturnsFilters extends BaseFilters {
  status?: Return['status']
  customerId?: string
  saleId?: string
  dateFrom?: string
  dateTo?: string
  minAmount?: number
  maxAmount?: number
  /** Branch scope; omitted = the server's default for this user. */
  branchId?: string
}

export interface CreateReturnData {
  sale_id: string
  customer_id: string
  return_date: string
  status: Return['status']
  reason?: string
  notes?: string
  /** How the money goes back: original_payment | cash | card | bank | store_credit (server default cash). */
  refund_method?: string
  /** Manager approval for a cash/bank payout above the refund approval limit (403 approval_required), bound to the sale. */
  approval_tokens?: string[]
  return_items: Array<{
    sale_item_id: string
    quantity_returned: number
    reason: string
    packaging_condition?: "sealed" | "opened" | "damaged"
  }>
}

export interface UpdateReturnData {
  status?: Return['status']
  reason?: string
  notes?: string
}

export const returnsApi = {
  // Get all returns with filters
  getReturns: async (filters: ReturnsFilters = {}): Promise<ApiListResponse<Return>> => {
    try {
      return { ...(await listReturnsOnDotnet(filters)), error: null }
    } catch (error) {
      return {
        data: [],
        total: 0,
        error: error instanceof Error ? error.message : "Failed to fetch returns",
      }
    }
  },

  // Get return by ID
  getReturn: async (id: string): Promise<ApiListResponse<Return>> => {
    return listApiWrapper(async () => [await getReturnOnDotnet(id)], "Failed to fetch return")
  },

  /**
   * Create return with items. `idempotencyKey` is generated once per form submission and reused when the
   * same submission is retried (createIdempotencyKeyTracker keyed by the request body).
   */
  createReturn: async (returnData: CreateReturnData, idempotencyKey: string): Promise<ApiListResponse<Return>> => {
    return listApiWrapper(
      async () => [await createReturnOnDotnet(returnData, idempotencyKey)],
      "Failed to create return",
    )
  },

  /**
   * Same as createReturn, but throws the API error instead of folding it into `error`, so the caller can tell a
   * 403 approval_required (refund approval limit) from any other failure.
   */
  createReturnOrThrow: (returnData: CreateReturnData, idempotencyKey: string): Promise<Return> =>
    createReturnOnDotnet(returnData, idempotencyKey),

  // Update return
  updateReturn: async (id: string, updates: UpdateReturnData): Promise<ApiListResponse<Return>> => {
    return listApiWrapper(async () => [await updateReturnOnDotnet(id, updates)], "Failed to update return")
  },

  // Update return status
  updateReturnStatus: async (id: string, status: Return['status']): Promise<ApiListResponse<Return>> => {
    return returnsApi.updateReturn(id, { status })
  },

  // Delete return (with cascade handling)
  // Soft-deletes a return that has not restored stock; a completed return is refused by the server (409)
  deleteReturn: async (id: string): Promise<ApiListResponse<never>> => {
    return listApiWrapper<never>(async () => {
      await deleteReturnOnDotnet(id)
      return []
    }, 'Failed to delete return')
  },

  // Get returns statistics
  getReturnsStats: async (branchId?: string): Promise<ApiListResponse<{
    total: number
    totalRefundAmount: number
    pending: number
    approved: number
    rejected: number
    completed: number
  }>> => {
    return listApiWrapper(async () => [await getReturnsStatsOnDotnet(branchId)], "Failed to fetch returns statistics")
  },

  // Get returns by date range
  getReturnsByDateRange: async (startDate: string, endDate: string): Promise<ApiListResponse<Return>> => {
    return returnsApi.getReturns({ dateFrom: startDate, dateTo: endDate })
  }
}
