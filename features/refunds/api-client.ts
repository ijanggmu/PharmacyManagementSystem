import {
  apiGet,
  apiGetWithMeta,
  apiPost,
  apiPut,
  apiDelete,
  getCSRFToken,
} from "@/lib/api/client-helpers"
import { ApiListResponse, BaseFilters, listApiWrapper } from "@/lib/api/utils"
import { backendTarget } from "@/lib/api/backend-target"
import {
  canListRefundsOnDotnet,
  createRefundOnDotnet,
  getRefundOnDotnet,
  getRefundsStatsOnDotnet,
  listRefundsOnDotnet,
  updateRefundOnDotnet,
} from "@/lib/api/sales-api"

export interface RefundItem {
  id: string
  refund_id: string
  sale_item_id: string
  quantity_refunded: number
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

export interface Refund {
  id: string
  refund_number: string
  credit_note_number?: string | null
  original_sale_id: string
  sale_id?: string
  customer_id: string
  refund_date: string
  refund_amount: string
  net_refund_amount: string
  total_refund_amount?: string
  refund_status: "pending" | "approved" | "rejected" | "completed"
  status?: "pending" | "approved" | "rejected" | "completed"
  refund_reason: string
  reason?: string | null
  notes: string | null
  created_at: string
  sales: {
    id: string
    sale_number: string
    total_amount: string
    invoice_number?: string | null
  } | null
  customers: {
    id: string
    first_name: string
    last_name: string
    phone: string | null
  } | null
  refund_items: RefundItem[]
}

export interface RefundsFilters extends BaseFilters {
  status?: "pending" | "approved" | "rejected" | "completed"
  customerId?: string
  saleId?: string
  dateFrom?: string
  dateTo?: string
  minAmount?: number
  maxAmount?: number
}

export interface CreateRefundData {
  sale_id: string
  customer_id: string
  refund_date: string
  status: Refund["status"]
  reason?: string
  notes?: string
  tax_refund_amount?: number
  processing_fee?: number
  refund_items: Array<{
    sale_item_id: string
    quantity_refunded: number
  }>
}

export interface UpdateRefundData {
  status?: "pending" | "approved" | "rejected" | "completed"
  refund_status?: "pending" | "approved" | "rejected" | "completed"
  reason?: string
  refund_reason?: string
  notes?: string
}

function normalizeRefund(refund: Refund): Refund {
  return {
    ...refund,
    sale_id: refund.original_sale_id,
    total_refund_amount: refund.net_refund_amount,
    status: refund.refund_status,
    reason: refund.refund_reason,
  }
}

function buildRefundsUrl(filters: RefundsFilters = {}): string {
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
  return q ? `/api/refunds?${q}` : "/api/refunds"
}

export const refundsApi = {
  getRefunds: async (filters: RefundsFilters = {}): Promise<ApiListResponse<Refund>> => {
    if (backendTarget("SALES") === "dotnet" && canListRefundsOnDotnet(filters)) {
      try {
        return { ...(await listRefundsOnDotnet(filters)), error: null }
      } catch (error) {
        return { data: [], total: 0, error: error instanceof Error ? error.message : "Failed to fetch refunds" }
      }
    }
    try {
      const { data, meta } = await apiGetWithMeta<Refund[]>(buildRefundsUrl(filters))
      return { data: (data || []).map(normalizeRefund), total: meta?.total, error: null }
    } catch (error) {
      return { data: [], total: 0, error: error instanceof Error ? error.message : "Failed to fetch refunds" }
    }
  },

  getRefund: async (id: string): Promise<ApiListResponse<Refund>> => {
    if (backendTarget("SALES") === "dotnet") {
      return listApiWrapper(async () => [await getRefundOnDotnet(id)], "Failed to fetch refund")
    }
    return listApiWrapper(async () => {
      const data = await apiGet<Refund>(`/api/refunds/${id}`)
      return data ? [normalizeRefund(data)] : []
    }, "Failed to fetch refund")
  },

  createRefund: async (refundData: CreateRefundData): Promise<ApiListResponse<Refund>> => {
    if (backendTarget("SALES") === "dotnet") {
      return listApiWrapper(
        async () => [await createRefundOnDotnet(refundData, crypto.randomUUID())],
        "Failed to create refund",
      )
    }
    return listApiWrapper(async () => {
      const token = await getCSRFToken()
      const payload = {
        original_sale_id: refundData.sale_id,
        customer_id: refundData.customer_id,
        refund_date: refundData.refund_date,
        refund_reason: refundData.reason || "general_refund",
        refund_status: refundData.status || "pending",
        notes: refundData.notes,
        tax_refund_amount: refundData.tax_refund_amount,
        processing_fee: refundData.processing_fee,
        refund_items: (refundData.refund_items || []).map((i) => ({
          sale_item_id: i.sale_item_id,
          quantity_refunded: i.quantity_refunded,
        })),
      }
      const row = await apiPost<Refund>("/api/refunds", payload, token)
      return row ? [normalizeRefund(row)] : []
    }, "Failed to create refund")
  },

  updateRefund: async (id: string, updates: UpdateRefundData): Promise<ApiListResponse<Refund>> => {
    if (backendTarget("SALES") === "dotnet") {
      return listApiWrapper(async () => [await updateRefundOnDotnet(id, updates)], "Failed to update refund")
    }
    return listApiWrapper(async () => {
      const token = await getCSRFToken()
      const updateData: Record<string, unknown> = { ...updates }
      if (updates.status) {
        updateData.refund_status = updates.status
        delete updateData.status
      }
      if (updates.reason) {
        updateData.refund_reason = updates.reason
        delete updateData.reason
      }
      const data = await apiPut<Refund>(`/api/refunds/${id}`, updateData, token)
      return data ? [normalizeRefund(data)] : []
    }, "Failed to update refund")
  },

  updateRefundStatus: async (
    id: string,
    status: "pending" | "approved" | "rejected" | "completed"
  ): Promise<ApiListResponse<Refund>> => {
    return refundsApi.updateRefund(id, { status })
  },

  deleteRefund: async (id: string): Promise<ApiListResponse<never>> => {
    return listApiWrapper(async () => {
      const token = await getCSRFToken()
      await apiDelete(`/api/refunds/${id}`, token)
      return []
    }, "Failed to delete refund")
  },

  getRefundsStats: async (): Promise<
    ApiListResponse<{
      total: number
      totalRefundAmount: number
      pending: number
      approved: number
      rejected: number
      completed: number
    }>
  > => {
    if (backendTarget("SALES") === "dotnet") {
      return listApiWrapper(async () => [await getRefundsStatsOnDotnet()], "Failed to fetch refunds statistics")
    }
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
      >("/api/refunds/stats")
      return rows ?? []
    }, "Failed to fetch refunds statistics")
  },

  getRefundsByDateRange: async (startDate: string, endDate: string): Promise<ApiListResponse<Refund>> => {
    return refundsApi.getRefunds({ dateFrom: startDate, dateTo: endDate })
  },
}

