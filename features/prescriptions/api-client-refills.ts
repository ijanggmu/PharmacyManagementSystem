import { apiGet, apiPost, getCSRFToken } from "@/lib/api/client-helpers"

export interface PrescriptionRefill {
  id: string
  prescription_id: string
  refill_number: number
  quantity_dispensed: number
  refill_date: string
  next_refill_date: string | null
  status: "pending" | "filled" | "cancelled"
  created_at: string
}

export interface DueRefillRow extends PrescriptionRefill {
  prescriptions: {
    id: string
    prescription_number?: string
    customers?: {
      id: string
      first_name?: string
      last_name?: string
      phone?: string
      email?: string
    } | null
  } | null
}

export const prescriptionRefillsApi = {
  getRefills: async (prescriptionId: string) => {
    const data = await apiGet<PrescriptionRefill[]>("/api/prescription-refills", { prescriptionId })
    return { data: data || [], error: null }
  },

  createRefill: async (refillData: {
    prescription_id: string
    quantity_dispensed: number
    refill_date: string
    next_refill_date?: string
  }) => {
    const token = await getCSRFToken()
    const data = await apiPost<PrescriptionRefill>("/api/prescription-refills", refillData, token)
    return { data, error: null }
  },

  getDueRefills: async (daysAhead: number = 7) => {
    const data = await apiGet<DueRefillRow[]>("/api/prescription-refills/due", { daysAhead })
    return { data: data || [], error: null }
  },
}

