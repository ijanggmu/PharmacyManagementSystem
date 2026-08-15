import {
  apiGet,
  apiGetWithMeta,
  apiPost,
  apiPatch,
  apiDelete,
  getCSRFToken,
} from "@/lib/api/client-helpers"
import {
  ApiListResponse,
  BaseFilters,
  listApiWrapper,
} from "@/lib/api/utils"

export interface SaleItem {
  id: string
  sale_id: string
  medicine_id: string
  quantity: number
  unit_price: string
  total_price: string
  discount_percent?: string | number
  medicines: {
    id: string
    name: string
    strength: string
    form: string
  } | null
}

export interface SalePayment {
  id: string
  payment_method: string
  amount: string
}

export interface Sale {
  id: string
  tenant_id?: string
  branch_id?: string | null
  sale_number: string
  invoice_number?: string | null
  customer_id: string
  total_amount: string
  discount_amount: string
  tax_amount: string
  payment_method:
    | "cash"
    | "card"
    | "insurance"
    | "fonepay"
    | "esewa"
    | "khalti"
    | "bank"
    | "credit"
    | "mixed"
    | "other"
  payment_status: "pending" | "paid" | "completed" | "failed" | "refunded"
  sale_date: string
  notes: string | null
  created_at: string
  customers: {
    id: string
    first_name: string
    last_name: string
    phone: string | null
    email: string | null
  } | null
  sale_items: SaleItem[]
  sale_payments?: SalePayment[]
}

export interface SalesFilters extends BaseFilters {
  paymentStatus?: Sale["payment_status"]
  paymentMethod?: Sale["payment_method"]
  paymentStatuses?: Sale["payment_status"][]
  paymentMethods?: Sale["payment_method"][]
  customerId?: string
  dateFrom?: string
  dateTo?: string
  minAmount?: number
  maxAmount?: number
}

export interface CreateSaleData {
  sale_number: string
  customer_id: string
  total_amount: string
  discount_amount: string
  tax_amount: string
  payments: { method: string; amount: number }[]
  payment_status: Sale["payment_status"]
  sale_date: string
  notes?: string
  sale_items: Omit<SaleItem, "id" | "sale_id" | "medicines">[]
}

export interface UpdateSaleData {
  payment_status?: Sale["payment_status"]
  notes?: string
}

function buildSalesListUrl(filters: SalesFilters): string {
  const sp = new URLSearchParams()
  if (filters.search) sp.set("search", filters.search)
  if (filters.customerId) sp.set("customerId", filters.customerId)
  if (filters.dateFrom) sp.set("dateFrom", filters.dateFrom)
  if (filters.dateTo) sp.set("dateTo", filters.dateTo)
  if (filters.minAmount != null) sp.set("minAmount", String(filters.minAmount))
  if (filters.maxAmount != null) sp.set("maxAmount", String(filters.maxAmount))

  if (filters.paymentStatuses?.length) {
    filters.paymentStatuses.forEach((s) => sp.append("paymentStatus", s))
  } else if (filters.paymentStatus) {
    sp.append("paymentStatus", filters.paymentStatus)
  }

  if (filters.paymentMethods?.length) {
    filters.paymentMethods.forEach((m) => sp.append("paymentMethod", m))
  } else if (filters.paymentMethod) {
    sp.append("paymentMethod", filters.paymentMethod)
  }

  const page = filters.page ?? 1
  const limit = filters.limit ?? 50
  sp.set("page", String(page))
  sp.set("limit", String(limit))
  sp.set("sortBy", filters.sortBy || "sale_date")
  sp.set("sortOrder", filters.sortOrder || "desc")

  const q = sp.toString()
  return q ? `/api/sales?${q}` : "/api/sales"
}

function mapCreateSaleToApiBody(saleData: CreateSaleData) {
  return {
    customer_id: saleData.customer_id,
    items: saleData.sale_items.map((item) => ({
      medicine_id: item.medicine_id,
      quantity: item.quantity,
      unit_price: parseFloat(String(item.unit_price)),
      discount: item.discount_percent != null ? parseFloat(String(item.discount_percent)) : undefined,
    })),
    payments: saleData.payments,
    discount_amount: parseFloat(String(saleData.discount_amount)),
    notes: saleData.notes,
  }
}

export const salesApi = {
  getSales: async (
    filters: SalesFilters = {}
  ): Promise<ApiListResponse<Sale> & { total?: number }> => {
    try {
      const url = buildSalesListUrl(filters)
      const { data, meta } = await apiGetWithMeta<Sale[]>(url)
      return {
        data: data || [],
        total: meta?.total,
        error: null,
      }
    } catch (error) {
      return {
        data: [],
        total: 0,
        error: error instanceof Error ? error.message : "Failed to fetch sales",
      }
    }
  },

  getSale: async (id: string): Promise<ApiListResponse<Sale>> => {
    return listApiWrapper(async () => {
      const sale = await apiGet<Sale>(`/api/sales/${id}`)
      return sale ? [sale] : []
    }, "Failed to fetch sale")
  },

  createSale: async (saleData: CreateSaleData): Promise<ApiListResponse<Sale>> => {
    return listApiWrapper(async () => {
      const token = await getCSRFToken()
      const body = mapCreateSaleToApiBody(saleData)
      const sale = await apiPost<Sale>("/api/sales", body, token)
      return sale ? [sale] : []
    }, "Failed to create sale")
  },

  updateSale: async (id: string, updates: UpdateSaleData): Promise<ApiListResponse<Sale>> => {
    return listApiWrapper(async () => {
      const token = await getCSRFToken()
      const sale = await apiPatch<Sale>(`/api/sales/${id}`, updates, token)
      return sale ? [sale] : []
    }, "Failed to update sale")
  },

  updateSalePaymentStatus: async (
    id: string,
    paymentStatus: Sale["payment_status"]
  ): Promise<ApiListResponse<Sale>> => {
    return salesApi.updateSale(id, { payment_status: paymentStatus })
  },

  deleteSale: async (id: string): Promise<ApiListResponse<never>> => {
    return listApiWrapper(async () => {
      const token = await getCSRFToken()
      await apiDelete(`/api/sales/${id}`, token)
      return []
    }, "Failed to delete sale")
  },

  getSalesStats: async (): Promise<
    ApiListResponse<{
      total: number
      totalRevenue: number
      todaySales: number
      todayRevenue: number
      pendingPayments: number
      completedPayments: number
    }>
  > => {
    return listApiWrapper(async () => {
      const rows = await apiGet<
        {
          total: number
          totalRevenue: number
          todaySales: number
          todayRevenue: number
          pendingPayments: number
          completedPayments: number
        }[]
      >("/api/sales/stats")
      return rows ?? []
    }, "Failed to fetch sales statistics")
  },

  getSalesByDateRange: async (startDate: string, endDate: string): Promise<ApiListResponse<Sale>> => {
    return salesApi.getSales({ dateFrom: startDate, dateTo: endDate })
  },
}
