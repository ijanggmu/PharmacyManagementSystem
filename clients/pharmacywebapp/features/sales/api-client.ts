import { ApiListResponse, BaseFilters, listApiWrapper } from "@/lib/api/utils"
import {
  cancelSaleOnDotnet,
  createSaleOnDotnet,
  deleteSaleOnDotnet,
  getSaleOnDotnet,
  getSalesSummaryOnDotnet,
  listSalesOnDotnet,
  updateSaleOnDotnet,
} from "@/lib/api/sales-api"

export interface SaleItem {
  id: string
  sale_id: string
  medicine_id: string
  quantity: number
  unit_price: string
  total_price: string
  discount_percent?: string | number
  /** Line discount in currency (absolute + percent part). */
  discount_amount?: string
  /** False for a VAT-exempt line (Medicine.IsTaxable at sale time). Absent on legacy rows = taxable. */
  is_taxable?: boolean
  /** Cost of goods per unit at sale time (FEFO lot cost); absent on legacy payloads. */
  unit_cost_price?: string
  /** Units of this line already returned / refunded (list and detail reads; absent = 0). */
  returned_quantity?: number
  refunded_quantity?: number
  /** Set when the line was sold in packs (`quantity` is still base units): see soldQuantityNote. */
  sold_units_per_pack?: number | null
  sold_pack_label?: string | null
  base_unit_label?: string | null
  medicines: {
    id: string
    name: string
    strength: string
    form: string
    generic_name?: string | null
  } | null
}

export interface SalePayment {
  id: string
  payment_method: string
  amount: string
  /** Tender reference (card slip, wallet transaction id); null when none was captured. */
  reference?: string | null
}

export interface Sale {
  id: string
  tenant_id?: string
  branch_id?: string | null
  sale_number: string
  invoice_number?: string | null
  /** "2083/84" — fiscal year of the sequential IRD invoice number. */
  fiscal_year?: string | null
  /** VAT breakdown stored at sale time; null on sales recorded before it was stored. */
  vat_rate_percent?: number | null
  taxable_amount?: number | null
  exempt_amount?: number | null
  /** Times the invoice has been printed (detail reads only). */
  print_count?: number
  /** Buyer name / PAN recorded for the tax invoice (IRD); null = the customer's name / no PAN. */
  buyer_name?: string | null
  buyer_pan?: string | null
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
  status?: "completed" | "cancelled"
  cancelled_at?: string | null
  cancellation_reason?: string | null
  sale_date: string
  notes: string | null
  created_at: string
  /** Amount actually received (non-credit legs). */
  paid_amount?: string
  /** Amount still owed on account. */
  balance_due?: string
  cashier_user_id?: string | null
  /** Prescription this sale dispensed, when it was sold against one. */
  prescription_id?: string | null
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

/** Payment-status filter values: the sale's payment state, plus "cancelled" for cancelled sales. */
export type SalePaymentStatusFilter = Sale["payment_status"] | "cancelled"

/** Sort keys the sales list understands (see SALES_SORT_FIELDS in lib/api/sales-api). */
export type SalesSortField = "sale_date" | "created_at" | "total_amount" | "invoice_number" | "balance_due"

export interface SalesFilters extends BaseFilters {
  paymentStatus?: SalePaymentStatusFilter
  paymentMethod?: Sale["payment_method"]
  paymentStatuses?: SalePaymentStatusFilter[]
  paymentMethods?: Sale["payment_method"][]
  customerId?: string
  /** Only sales containing a line of this medicine. */
  medicineId?: string
  /** Explicit branch; omitted = the signed-in user's current branch (server default). */
  branchId?: string
  /** Only sales rung up by this cashier (user id). */
  cashierUserId?: string
  /** Only sales with a balance still owed. */
  onlyWithBalanceDue?: boolean
  dateFrom?: string
  dateTo?: string
  minAmount?: number
  maxAmount?: number
}

export interface CreateSaleData {
  sale_number: string
  customer_id: string
  prescription_id?: string | null
  total_amount: string
  discount_amount: string
  tax_amount: string
  payments: { method: string; amount: number; reference?: string | null }[]
  payment_status: Sale["payment_status"]
  sale_date: string
  notes?: string
  /** Per-checkout-attempt key for the .NET path; a retry of the same cart must reuse it. */
  idempotency_key?: string
  /** A manager approved taking the customer past their credit limit (needs Sales.OverrideCreditLimit). */
  override_credit_limit?: boolean
  /** Loyalty points spent on this sale; their value is part of discount_amount. */
  redeem_loyalty_points?: number
  /** Resubmission after the cashier reviewed a drug-interaction / allergy warning (409 SafetyWarning). */
  acknowledge_warnings?: boolean
  /** Buyer's name / PAN for the tax invoice (IRD); needed above the abbreviated-invoice limit. */
  buyer_name?: string | null
  buyer_pan?: string | null
  sale_items: (Omit<SaleItem, "id" | "sale_id" | "medicines" | "discount_amount"> & {
    discount_amount?: string | number
    /** "pack" when sold in packs: `quantity` is still base units and must equal pack_count × units per pack. */
    sale_unit?: "base" | "pack"
    pack_count?: number
  })[]
}

export interface UpdateSaleData {
  payment_status?: Sale["payment_status"]
  notes?: string
}

export const salesApi = {
  getSales: async (
    filters: SalesFilters = {}
  ): Promise<ApiListResponse<Sale> & { total?: number }> => {
    try {
      return { ...(await listSalesOnDotnet(filters)), error: null }
    } catch (error) {
      return {
        data: [],
        total: 0,
        error: error instanceof Error ? error.message : "Failed to fetch sales",
      }
    }
  },

  getSale: async (id: string): Promise<ApiListResponse<Sale>> => {
    return listApiWrapper(async () => [await getSaleOnDotnet(id)], "Failed to fetch sale")
  },

  createSale: async (saleData: CreateSaleData): Promise<ApiListResponse<Sale>> => {
    const key = saleData.idempotency_key ?? crypto.randomUUID()
    return listApiWrapper(async () => [await createSaleOnDotnet(saleData, key)], "Failed to create sale")
  },

  updateSale: async (id: string, updates: UpdateSaleData): Promise<ApiListResponse<Sale>> => {
    return listApiWrapper(async () => [await updateSaleOnDotnet(id, updates)], "Failed to update sale")
  },

  /** Payment status is derived from the balance due on the .NET API and cannot be set directly. */
  updateSalePaymentStatus: async (
    _id: string,
    _paymentStatus: Sale["payment_status"]
  ): Promise<ApiListResponse<Sale>> => {
    return { data: [], error: "Payment status is derived from the balance due and cannot be changed directly" }
  },

  /** Always refused by the server (409): sales are cancelled, never deleted. */
  deleteSale: async (id: string): Promise<ApiListResponse<never>> => {
    return listApiWrapper<never>(async () => {
      await deleteSaleOnDotnet(id)
      return []
    }, "Failed to delete sale")
  },

  /** Restores stock, reverses the posted voucher, and marks the sale cancelled.
   *  Fails server-side if the sale is already IRD-locked — use a return/refund
   *  instead once that's the case. */
  /** Throws on failure (e.g. 409 when the sale already has returns/refunds) so mutation onError runs. */
  cancelSale: async (id: string, reason: string): Promise<void> => {
    await cancelSaleOnDotnet(id, reason)
  },

  getSalesStats: async (): Promise<
    ApiListResponse<{
      total: number
      totalRevenue: number
      todaySales: number
      todayRevenue: number
      pendingPayments: number
      completedPayments: number
      cancelledCount: number
    }>
  > => {
    return listApiWrapper(async () => [await getSalesSummaryOnDotnet()], "Failed to fetch sales statistics")
  },

  getSalesByDateRange: async (startDate: string, endDate: string): Promise<ApiListResponse<Sale>> => {
    return salesApi.getSales({ dateFrom: startDate, dateTo: endDate })
  },
}
