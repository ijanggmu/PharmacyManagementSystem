import { createClient } from "@/lib/supabase/client"
import { 
  ApiListResponse, 
  BaseFilters, 
  apiWrapper, 
  listApiWrapper,
  buildSearchFilter,
  applySorting,
  applyPagination
} from "./utils"

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
  status: 'pending' | 'filled' | 'partially_filled' | 'cancelled'
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
  status?: Prescription['status']
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
  status: Prescription['status']
  notes?: string
  prescription_items: Omit<PrescriptionItem, 'id' | 'prescription_id'>[]
}

export interface UpdatePrescriptionData {
  doctor_name?: string
  status?: Prescription['status']
  notes?: string
}

export const prescriptionsApi = {
  // Get all prescriptions with filters
  getPrescriptions: async (filters: PrescriptionsFilters = {}): Promise<ApiListResponse<Prescription>> => {
    return listApiWrapper(async () => {
      const supabase = createClient()
      
      let query = supabase
        .from("prescriptions")
        .select(`
          *,
          customers (id, first_name, last_name, phone),
          prescription_items (
            id,
            quantity_prescribed,
            quantity_dispensed,
            dosage_instructions,
            medicines (id, name, strength, form)
          )
        `)

      // Apply filters
      if (filters.search) {
        const searchFields = [
          'prescription_number',
          'doctor_name',
          'customers.first_name',
          'customers.last_name'
        ]
        query = buildSearchFilter(query, filters.search, searchFields)
      }

      if (filters.status) {
        query = query.eq('status', filters.status)
      }

      if (filters.customerId) {
        query = query.eq('customer_id', filters.customerId)
      }

      if (filters.doctorName) {
        query = query.ilike('doctor_name', `%${filters.doctorName}%`)
      }

      if (filters.dateFrom) {
        query = query.gte('prescribed_date', filters.dateFrom)
      }

      if (filters.dateTo) {
        query = query.lte('prescribed_date', filters.dateTo)
      }

      // Apply sorting and pagination
      query = applySorting(query, filters.sortBy || 'created_at', filters.sortOrder)
      
      if (filters.page && filters.limit) {
        query = applyPagination(query, filters.page, filters.limit)
      }

      const { data, error } = await query

      if (error) {
        throw new Error(error.message)
      }

      return data || []
    }, 'Failed to fetch prescriptions')
  },

  // Get prescription by ID
  getPrescription: async (id: string): Promise<ApiListResponse<Prescription>> => {
    return listApiWrapper(async () => {
      const supabase = createClient()
      
      const { data, error } = await supabase
        .from("prescriptions")
        .select(`
          *,
          customers (id, first_name, last_name, phone),
          prescription_items (
            id,
            quantity_prescribed,
            quantity_dispensed,
            dosage_instructions,
            medicines (id, name, strength, form)
          )
        `)
        .eq("id", id)
        .single()

      if (error) {
        throw new Error(error.message)
      }

      return data ? [data] : []
    }, 'Failed to fetch prescription')
  },

  // Create prescription with items
  createPrescription: async (prescriptionData: CreatePrescriptionData): Promise<ApiListResponse<Prescription>> => {
    return listApiWrapper(async () => {
      const supabase = createClient()
      
      // Start a transaction-like operation
      const { data: prescription, error: prescriptionError } = await supabase
        .from("prescriptions")
        .insert([{
          prescription_number: prescriptionData.prescription_number,
          customer_id: prescriptionData.customer_id,
          doctor_name: prescriptionData.doctor_name,
          prescribed_date: prescriptionData.prescribed_date,
          status: prescriptionData.status,
          notes: prescriptionData.notes
        }])
        .select()
        .single()

      if (prescriptionError) {
        throw new Error(prescriptionError.message)
      }

      // Insert prescription items
      if (prescriptionData.prescription_items.length > 0) {
        const itemsToInsert = prescriptionData.prescription_items.map(item => ({
          prescription_id: prescription.id,
          medicine_id: item.medicine_id,
          quantity_prescribed: item.quantity_prescribed,
          quantity_dispensed: item.quantity_dispensed,
          dosage_instructions: item.dosage_instructions
        }))

        const { error: itemsError } = await supabase
          .from("prescription_items")
          .insert(itemsToInsert)

        if (itemsError) {
          throw new Error(itemsError.message)
        }
      }

      // Fetch the complete prescription with items
      const { data: completePrescription, error: fetchError } = await supabase
        .from("prescriptions")
        .select(`
          *,
          customers (id, first_name, last_name, phone),
          prescription_items (
            id,
            quantity_prescribed,
            quantity_dispensed,
            dosage_instructions,
            medicines (id, name, strength, form)
          )
        `)
        .eq("id", prescription.id)
        .single()

      if (fetchError) {
        throw new Error(fetchError.message)
      }

      return completePrescription ? [completePrescription] : []
    }, 'Failed to create prescription')
  },

  // Update prescription
  updatePrescription: async (id: string, updates: UpdatePrescriptionData): Promise<ApiListResponse<Prescription>> => {
    return listApiWrapper(async () => {
      const supabase = createClient()
      
      const { data, error } = await supabase
        .from("prescriptions")
        .update(updates)
        .eq("id", id)
        .select(`
          *,
          customers (id, first_name, last_name, phone),
          prescription_items (
            id,
            quantity_prescribed,
            quantity_dispensed,
            dosage_instructions,
            medicines (id, name, strength, form)
          )
        `)
        .single()

      if (error) {
        throw new Error(error.message)
      }

      return data ? [data] : []
    }, 'Failed to update prescription')
  },

  // Update prescription status
  updatePrescriptionStatus: async (id: string, status: Prescription['status']): Promise<ApiListResponse<Prescription>> => {
    return prescriptionsApi.updatePrescription(id, { status })
  },

  // Delete prescription (with cascade handling)
  deletePrescription: async (id: string): Promise<ApiListResponse<never>> => {
    return listApiWrapper(async () => {
      const supabase = createClient()
      
      // Delete prescription items first (due to foreign key constraints)
      const { error: itemsError } = await supabase
        .from("prescription_items")
        .delete()
        .eq("prescription_id", id)

      if (itemsError) {
        throw new Error(itemsError.message)
      }

      // Delete the prescription
      const { error: prescriptionError } = await supabase
        .from("prescriptions")
        .delete()
        .eq("id", id)

      if (prescriptionError) {
        throw new Error(prescriptionError.message)
      }

      return []
    }, 'Failed to delete prescription')
  },

  // Get prescription statistics
  getPrescriptionStats: async (): Promise<ApiListResponse<{
    total: number
    pending: number
    filled: number
    partially_filled: number
    cancelled: number
  }>> => {
    return listApiWrapper(async () => {
      const supabase = createClient()
      
      const { data, error } = await supabase
        .from("prescriptions")
        .select('status')

      if (error) {
        throw new Error(error.message)
      }

      const stats = {
        total: data?.length || 0,
        pending: data?.filter(p => p.status === 'pending').length || 0,
        filled: data?.filter(p => p.status === 'filled').length || 0,
        partially_filled: data?.filter(p => p.status === 'partially_filled').length || 0,
        cancelled: data?.filter(p => p.status === 'cancelled').length || 0,
      }

      return [stats]
    }, 'Failed to fetch prescription statistics')
  }
}

