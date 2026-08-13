import {
  apiGet,
  apiGetWithMeta,
  apiPost,
  apiPut,
  apiDelete,
  getCSRFToken,
} from "@/lib/api/client-helpers"
import { ApiListResponse, BaseFilters, listApiWrapper } from "@/lib/api/utils"

export interface PrescriptionItem {
  id: string
  prescription_id: string
  medicine_id: string
  quantity_prescribed: number
  quantity_dispensed: number
  dosage_instructions: string
  medicines: {
    id: string
    name: string
    strength: string
    form: string
  } | null
}

export interface Prescription {
  id: string
  prescription_number: string
  customer_id: string
  doctor_name: string
  prescribed_date: string
  expiry_date: string | null
  status: "pending" | "filled" | "partially_filled" | "cancelled"
  notes: string | null
  created_at: string
  customers: {
    id: string
    first_name: string
    last_name: string
    phone: string | null
  } | null
  prescription_items: PrescriptionItem[]
}

export interface PrescriptionsFilters extends BaseFilters {
  status?: Prescription["status"]
  statuses?: Prescription["status"][]
  customerId?: string
  doctorName?: string
  dateFrom?: string
  dateTo?: string
}

export interface CreatePrescriptionData {
  prescription_number: string
  customer_id: string
  doctor_name: string
  prescribed_date: string
  expiry_date?: string | null
  status: Prescription["status"]
  notes?: string
  prescription_items: Omit<PrescriptionItem, "id" | "prescription_id" | "medicines">[]
}

export interface UpdatePrescriptionData {
  doctor_name?: string
  status?: Prescription["status"]
  notes?: string
}

function buildPrescriptionsUrl(filters: PrescriptionsFilters = {}): string {
  const sp = new URLSearchParams()
  if (filters.search) sp.set("search", filters.search)
  if (filters.statuses?.length) filters.statuses.forEach((s) => sp.append("status", s))
  else if (filters.status) sp.set("status", filters.status)
  if (filters.customerId) sp.set("customerId", filters.customerId)
  if (filters.doctorName) sp.set("doctorName", filters.doctorName)
  if (filters.dateFrom) sp.set("dateFrom", filters.dateFrom)
  if (filters.dateTo) sp.set("dateTo", filters.dateTo)
  sp.set("page", String(filters.page ?? 1))
  sp.set("limit", String(filters.limit ?? 50))
  sp.set("sortBy", filters.sortBy || "created_at")
  sp.set("sortOrder", filters.sortOrder || "desc")
  const q = sp.toString()
  return q ? `/api/prescriptions?${q}` : "/api/prescriptions"
}

export const prescriptionsApi = {
  getPrescriptions: async (
    filters: PrescriptionsFilters = {}
  ): Promise<ApiListResponse<Prescription> & { total?: number }> => {
    try {
      const { data, meta } = await apiGetWithMeta<Prescription[]>(buildPrescriptionsUrl(filters))
      return { data: data ?? [], total: meta?.total, error: null }
    } catch (error) {
      return {
        data: [],
        total: 0,
        error: error instanceof Error ? error.message : "Failed to fetch prescriptions",
      }
    }
  },

  getPrescription: async (id: string): Promise<ApiListResponse<Prescription>> => {
    return listApiWrapper(async () => {
      const data = await apiGet<Prescription>(`/api/prescriptions/${id}`)
      return data ? [data] : []
    }, "Failed to fetch prescription")
  },

  createPrescription: async (prescriptionData: CreatePrescriptionData): Promise<ApiListResponse<Prescription>> => {
    return listApiWrapper(async () => {
      const token = await getCSRFToken()
      const payload = {
        customer_id: prescriptionData.customer_id,
        doctor_name: prescriptionData.doctor_name,
        issue_date: prescriptionData.prescribed_date,
        expiry_date: prescriptionData.expiry_date,
        notes: prescriptionData.notes,
        prescription_items: prescriptionData.prescription_items.map((i) => ({
          medicine_id: i.medicine_id,
          quantity_prescribed: i.quantity_prescribed,
          dosage_instructions: i.dosage_instructions,
        })),
      }
      const row = await apiPost<Prescription>("/api/prescriptions", payload, token)
      return row ? [row] : []
    }, "Failed to create prescription")
  },

  updatePrescription: async (
    id: string,
    updates: UpdatePrescriptionData
  ): Promise<ApiListResponse<Prescription>> => {
    return listApiWrapper(async () => {
      const token = await getCSRFToken()
      const data = await apiPut<Prescription>(`/api/prescriptions/${id}`, updates, token)
      return data ? [data] : []
    }, "Failed to update prescription")
  },

  updatePrescriptionStatus: async (
    id: string,
    status: Prescription["status"]
  ): Promise<ApiListResponse<Prescription>> => {
    return prescriptionsApi.updatePrescription(id, { status })
  },

  deletePrescription: async (id: string): Promise<ApiListResponse<never>> => {
    return listApiWrapper(async () => {
      const token = await getCSRFToken()
      await apiDelete(`/api/prescriptions/${id}`, token)
      return []
    }, "Failed to delete prescription")
  },

  getPrescriptionStats: async (): Promise<
    ApiListResponse<{
      total: number
      pending: number
      filled: number
      partially_filled: number
      cancelled: number
    }>
  > => {
    return listApiWrapper(async () => {
      const rows = await apiGet<
        {
          total: number
          pending: number
          filled: number
          partially_filled: number
          cancelled: number
        }[]
      >("/api/prescriptions/stats")
      return rows ?? []
    }, "Failed to fetch prescription statistics")
  },
}

