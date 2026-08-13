import { apiPost, getCSRFToken } from "@/lib/api/client-helpers"

export interface SupplierPaymentResult {
  ledger_entry_id: string
  voucher_id: string
}

export const supplierPaymentsApi = {
  post: async (body: {
    supplier_id: string
    amount: number
    payment_method: "cash" | "bank"
    payment_date: string
    reference_note?: string | null
    allow_overpayment?: boolean
  }) => {
    const token = await getCSRFToken()
    return apiPost<SupplierPaymentResult>("/api/supplier-payments", body, token)
  },
}
