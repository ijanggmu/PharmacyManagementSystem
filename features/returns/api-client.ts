import {
  apiGet,
  apiGetWithMeta,
  apiPost,
  apiPut,
  apiDelete,
  getCSRFToken,
} from "@/lib/api/client-helpers"
import { ApiListResponse, BaseFilters, listApiWrapper } from "@/lib/api/utils"

export interface ReturnItem {
  id: string
  return_id: string
  sale_item_id: string
  quantity_returned: number
  reason: string
  refund_amount: string
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
}

export interface ReturnsFilters extends BaseFilters {
  status?: Return['status']
  customerId?: string
  saleId?: string
  dateFrom?: string
  dateTo?: string
  minAmount?: number
  maxAmount?: number
}

export interface CreateReturnData {
  sale_id: string
  customer_id: string
  return_date: string
  status: Return['status']
  reason?: string
  notes?: string
  return_items: Array<{
    sale_item_id: string
    quantity_returned: number
    reason: string
  }>
}

export interface UpdateReturnData {
  status?: Return['status']
  reason?: string
  notes?: string
}

function buildReturnsUrl(filters: ReturnsFilters = {}): string {
  const sp = new URLSearchParams()
  if (filters.search) sp.set("search", filters.search)
  if (filters.status) sp.set("status", filters.status)
  if (filters.customerId) sp.set("customerId", filters.customerId)
  if (filters.saleId) sp.set("saleId", filters.saleId)
  if (filters.dateFrom) sp.set("dateFrom", filters.dateFrom)
  if (filters.dateTo) sp.set("dateTo", filters.dateTo)
  if (filters.minAmount != null) sp.set("minAmount", String(filters.minAmount))
  if (filters.maxAmount != null) sp.set("maxAmount", String(filters.maxAmount))
  sp.set("page", String(filters.page ?? 1))
  sp.set("limit", String(filters.limit ?? 50))
  sp.set("sortBy", filters.sortBy || "created_at")
  sp.set("sortOrder", filters.sortOrder || "desc")
  const q = sp.toString()
  return q ? `/api/returns?${q}` : "/api/returns"
}

export const returnsApi = {
  // Get all returns with filters
  getReturns: async (filters: ReturnsFilters = {}): Promise<ApiListResponse<Return>> => {
    try {
      const { data, meta } = await apiGetWithMeta<Return[]>(buildReturnsUrl(filters))
      return { data: data ?? [], total: meta?.total, error: null }
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
    return listApiWrapper(async () => {
      const data = await apiGet<Return>(`/api/returns/${id}`)
      return data ? [data] : []
    }, 'Failed to fetch return')
  },

  // Create return with items
  createReturn: async (returnData: CreateReturnData): Promise<ApiListResponse<Return>> => {
    return listApiWrapper(async () => {
      const token = await getCSRFToken()
      const payload = {
        sale_id: returnData.sale_id,
        customer_id: returnData.customer_id,
        return_date: returnData.return_date,
        status: returnData.status,
        reason: returnData.reason,
        notes: returnData.notes,
        return_items: returnData.return_items.map((i) => ({
          sale_item_id: i.sale_item_id,
          quantity_returned: i.quantity_returned,
          reason: i.reason,
        })),
      }
      const row = await apiPost<Return>("/api/returns", payload, token)
      return row ? [row] : []
    }, 'Failed to create return')
  },

  // Update return
  updateReturn: async (id: string, updates: UpdateReturnData): Promise<ApiListResponse<Return>> => {
    return listApiWrapper(async () => {
      const token = await getCSRFToken()
      const data = await apiPut<Return>(`/api/returns/${id}`, updates, token)
      return data ? [data] : []
    }, 'Failed to update return')
  },

  // Update return status
  updateReturnStatus: async (id: string, status: Return['status']): Promise<ApiListResponse<Return>> => {
    return returnsApi.updateReturn(id, { status })
  },

  // Delete return (with cascade handling)
  deleteReturn: async (id: string): Promise<ApiListResponse<never>> => {
    return listApiWrapper(async () => {
      const token = await getCSRFToken()
      await apiDelete(`/api/returns/${id}`, token)
      return []
    }, 'Failed to delete return')
  },

  // Get returns statistics
  getReturnsStats: async (): Promise<ApiListResponse<{
    total: number
    totalRefundAmount: number
    pending: number
    approved: number
    rejected: number
    completed: number
  }>> => {
    return listApiWrapper(async () => {
      const rows = await apiGet<
        {
          total: number
          totalRefundAmount: number
          pending: number
          approved: number
          rejected: number
          completed: number
        }[]
      >("/api/returns/stats")
      return rows ?? []
    }, 'Failed to fetch returns statistics')
  },

  // Get returns by date range
  getReturnsByDateRange: async (startDate: string, endDate: string): Promise<ApiListResponse<Return>> => {
    return returnsApi.getReturns({ dateFrom: startDate, dateTo: endDate })
  }
}
