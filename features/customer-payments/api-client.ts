import { apiPost, getCSRFToken } from "@/lib/api/client-helpers"

export const customerPaymentsApi = {
  post: async (body: {
    customer_id: string
    amount: number
    payment_method: "cash" | "bank"
    payment_date: string
    reference_note?: string | null
    allocations?: Array<{ sale_id: string; amount: number }> | null
  }) => {
    const token = await getCSRFToken()
    return apiPost<{ payment_id: string }>("/api/customer-payments", body, token)
  },
}

