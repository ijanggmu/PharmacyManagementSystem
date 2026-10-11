import { ApiListResponse, BaseFilters, listApiWrapper } from "@/lib/api/utils"
import {
  createRefundOnDotnet,
  deleteRefundOnDotnet,
  getRefundOnDotnet,
  getRefundsStatsOnDotnet,
  listRefundsOnDotnet,
  updateRefundOnDotnet,
  type ReversalSettlement,
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
  medicine_id?: string
  /** False for a VAT-exempt line. */
  is_taxable?: boolean
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
  /** original_payment | cash | card | bank | store_credit … */
  refund_method?: string
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
  branch_id?: string | null
  /** "2083/84" — fiscal year of the sequential credit-note number. */
  fiscal_year?: string | null
  /** VAT breakdown of the refunded lines (from the original sale); null on older refunds. */
  vat_rate_percent?: number | null
  taxable_amount?: number | null
  vat_amount?: number | null
  exempt_amount?: number | null
  /** Times the credit note has been printed (detail reads only). */
  print_count?: number
  /** How the money went back; null until completed. */
  settlement?: ReversalSettlement | null
}

export interface RefundsFilters extends BaseFilters {
  status?: "pending" | "approved" | "rejected" | "completed"
  customerId?: string
  saleId?: string
  dateFrom?: string
  dateTo?: string
  minAmount?: number
  maxAmount?: number
  /** Branch scope; omitted = the server's default for this user. */
  branchId?: string
}

export interface CreateRefundData {
  sale_id: string
  customer_id: string
  refund_date: string
  status: Refund["status"]
  reason?: string
  notes?: string
  /** Ignored: prices are VAT-inclusive, so the server never refunds VAT on top of the items. */
  tax_refund_amount?: number
  processing_fee?: number
  /** full_refund | partial_refund | exchange */
  refund_type?: string
  /** original_payment | cash | card | bank | store_credit */
  refund_method?: string
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

export const refundsApi = {
  getRefunds: async (filters: RefundsFilters = {}): Promise<ApiListResponse<Refund>> => {
    try {
      return { ...(await listRefundsOnDotnet(filters)), error: null }
    } catch (error) {
      return { data: [], total: 0, error: error instanceof Error ? error.message : "Failed to fetch refunds" }
    }
  },

  getRefund: async (id: string): Promise<ApiListResponse<Refund>> => {
    return listApiWrapper(async () => [await getRefundOnDotnet(id)], "Failed to fetch refund")
  },

  /** `idempotencyKey`: one per form submission, reused when the same submission is retried. */
  createRefund: async (refundData: CreateRefundData, idempotencyKey: string): Promise<ApiListResponse<Refund>> => {
    return listApiWrapper(
      async () => [await createRefundOnDotnet(refundData, idempotencyKey)],
      "Failed to create refund",
    )
  },

  updateRefund: async (id: string, updates: UpdateRefundData): Promise<ApiListResponse<Refund>> => {
    return listApiWrapper(async () => [await updateRefundOnDotnet(id, updates)], "Failed to update refund")
  },

  updateRefundStatus: async (
    id: string,
    status: "pending" | "approved" | "rejected" | "completed"
  ): Promise<ApiListResponse<Refund>> => {
    return refundsApi.updateRefund(id, { status })
  },

  /** Soft-deletes an unposted refund; a posted refund is refused by the server (409). */
  deleteRefund: async (id: string): Promise<ApiListResponse<never>> => {
    return listApiWrapper<never>(async () => {
      await deleteRefundOnDotnet(id)
      return []
    }, "Failed to delete refund")
  },

  getRefundsStats: async (branchId?: string): Promise<
    ApiListResponse<{
      total: number
      totalRefundAmount: number
      pending: number
      approved: number
      rejected: number
      completed: number
    }>
  > => {
    return listApiWrapper(async () => [await getRefundsStatsOnDotnet(branchId)], "Failed to fetch refunds statistics")
  },

  getRefundsByDateRange: async (startDate: string, endDate: string): Promise<ApiListResponse<Refund>> => {
    return refundsApi.getRefunds({ dateFrom: startDate, dateTo: endDate })
  },
}
