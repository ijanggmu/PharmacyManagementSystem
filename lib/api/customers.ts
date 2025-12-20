import { createClient } from "@/lib/supabase/client"
import { applyPagination, applySorting } from "./utils"

export interface Customer {
  id: string
  first_name: string
  last_name: string
  email: string | null
  phone: string | null
  address: string | null
  date_of_birth: string | null
  insurance_provider: string | null
  insurance_number: string | null
  created_at: string
  prescriptions: { id: string }[]
  sales: { id: string; total_amount: string }[]
}

export interface CustomersFilters {
  search?: string
  status?: "all" | "active" | "inactive"
  page?: number
  limit?: number
  sortBy?: string
  sortOrder?: 'asc' | 'desc'
}

export interface CustomersResponse {
  data: Customer[]
  total?: number
  error: string | null
}

export const customersApi = {
  // Get all customers with optional filters
  getCustomers: async (filters?: CustomersFilters): Promise<CustomersResponse> => {
    try {
      const supabase = createClient()
      
      let query = supabase
        .from("customers")
        .select(`
          *,
          prescriptions (id),
          sales (id, total_amount)
        `)
        .order("created_at", { ascending: false })

      // Apply filters
      if (filters?.search) {
        query = query.or(`first_name.ilike.%${filters.search}%,last_name.ilike.%${filters.search}%,email.ilike.%${filters.search}%,phone.ilike.%${filters.search}%`)
      }

      // Apply sorting
      query = applySorting(query, filters?.sortBy || "created_at", filters?.sortOrder || "desc")

      // Status filter requires client-side filtering, so fetch all first
      const needsClientSideFilter = filters?.status && filters.status !== "all"
      
      // Get total count
      let totalCount: number | undefined
      if (!needsClientSideFilter) {
        const countQuery = supabase
          .from("customers")
          .select("*", { count: "exact", head: true })
        
        if (filters?.search) {
          countQuery.or(`first_name.ilike.%${filters.search}%,last_name.ilike.%${filters.search}%,email.ilike.%${filters.search}%,phone.ilike.%${filters.search}%`)
        }
        
        const { count } = await countQuery
        totalCount = count || 0
      }
      
      if (!needsClientSideFilter && filters?.page && filters?.limit) {
        query = applyPagination(query, filters.page, filters.limit)
      }

      const { data, error } = await query

      if (error) {
        throw new Error(error.message)
      }

      // Apply status filter in memory if needed
      let filteredData = data || []
      if (filters?.status && filters.status !== "all") {
        filteredData = filteredData.filter((customer: Customer) => {
          const hasRecentActivity = customer.prescriptions.length > 0 || customer.sales.length > 0
          return filters.status === "active" ? hasRecentActivity : !hasRecentActivity
        })
        
        // For client-side filtering, total is the filtered length
        totalCount = filteredData.length
        
        // Apply pagination after client-side filtering
        if (filters?.page && filters?.limit) {
          const startIndex = (filters.page - 1) * filters.limit
          filteredData = filteredData.slice(startIndex, startIndex + filters.limit)
        }
      }

      return { data: filteredData, total: totalCount, error: null }
    } catch (error) {
      return { 
        data: [], 
        error: error instanceof Error ? error.message : "Failed to fetch customers" 
      }
    }
  },

  // Get customer by ID
  getCustomer: async (id: string): Promise<{ data: Customer | null; error: string | null }> => {
    try {
      const supabase = createClient()
      
      const { data, error } = await supabase
        .from("customers")
        .select(`
          *,
          prescriptions (id),
          sales (id, total_amount)
        `)
        .eq("id", id)
        .single()

      if (error) {
        throw new Error(error.message)
      }

      return { data, error: null }
    } catch (error) {
      return { 
        data: null, 
        error: error instanceof Error ? error.message : "Failed to fetch customer" 
      }
    }
  },

  // Create customer
  createCustomer: async (customer: Omit<Customer, "id" | "created_at" | "prescriptions" | "sales">): Promise<{ data: Customer | null; error: string | null }> => {
    try {
      const supabase = createClient()
      
      const { data, error } = await supabase
        .from("customers")
        .insert([customer])
        .select(`
          *,
          prescriptions (id),
          sales (id, total_amount)
        `)
        .single()

      if (error) {
        throw new Error(error.message)
      }

      return { data, error: null }
    } catch (error) {
      return { 
        data: null, 
        error: error instanceof Error ? error.message : "Failed to create customer" 
      }
    }
  },

  // Update customer
  updateCustomer: async (id: string, updates: Partial<Customer>): Promise<{ data: Customer | null; error: string | null }> => {
    try {
      const supabase = createClient()
      
      const { data, error } = await supabase
        .from("customers")
        .update(updates)
        .eq("id", id)
        .select(`
          *,
          prescriptions (id),
          sales (id, total_amount)
        `)
        .single()

      if (error) {
        throw new Error(error.message)
      }

      return { data, error: null }
    } catch (error) {
      return { 
        data: null, 
        error: error instanceof Error ? error.message : "Failed to update customer" 
      }
    }
  },

  // Delete customer
  deleteCustomer: async (id: string): Promise<{ error: string | null }> => {
    try {
      const supabase = createClient()
      
      // Check for related records with timeout
      const checkRelatedRecords = async () => {
        try {
          const timeoutPromise = new Promise((_, reject) => 
            setTimeout(() => reject(new Error('Database query timeout')), 5000)
          )

          const checkPromise = Promise.all([
            supabase.from("prescriptions").select("id").eq("customer_id", id).limit(1),
            supabase.from("sales").select("id").eq("customer_id", id).limit(1)
          ])

          const [prescriptionResult, saleResult] = await Promise.race([
            checkPromise,
            timeoutPromise
          ]) as any

          if (prescriptionResult.error) throw prescriptionResult.error
          if (saleResult.error) throw saleResult.error

          if (prescriptionResult.data && prescriptionResult.data.length > 0) {
            throw new Error("This customer has related prescriptions and cannot be deleted. Consider archiving instead.")
          }

          if (saleResult.data && saleResult.data.length > 0) {
            throw new Error("This customer has related sales and cannot be deleted. Consider archiving instead.")
          }
        } catch (error) {
          if (error instanceof Error && error.message === 'Database query timeout') {
            throw new Error("Database operation timed out. Please try again.")
          }
          throw error
        }
      }

      await checkRelatedRecords()

      // If no related records, proceed with deletion
      const { error } = await supabase.from("customers").delete().eq("id", id)

      if (error) {
        throw new Error(error.message)
      }

      return { error: null }
    } catch (error) {
      return { 
        error: error instanceof Error ? error.message : "Failed to delete customer" 
      }
    }
  }
}
