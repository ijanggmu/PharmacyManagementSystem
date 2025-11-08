import { createClient } from "@/lib/supabase/client"
import { applyPagination, applySorting } from "./utils"

export interface Supplier {
  id: string
  name: string
  contact_person: string | null
  email: string | null
  phone: string | null
  address: string | null
  created_at: string
}

export interface SuppliersFilters {
  search?: string
  status?: "all" | "active" | "incomplete"
  page?: number
  limit?: number
  sortBy?: string
  sortOrder?: 'asc' | 'desc'
}

export interface SuppliersResponse {
  data: Supplier[]
  error: string | null
}

export const suppliersApi = {
  // Get all suppliers with optional filters
  getSuppliers: async (filters?: SuppliersFilters): Promise<SuppliersResponse> => {
    try {
      const supabase = createClient()
      
      let query = supabase
        .from("suppliers")
        .select("*")
        .order("name")

      // Apply filters
      if (filters?.search) {
        query = query.or(`name.ilike.%${filters.search}%,contact_person.ilike.%${filters.search}%,email.ilike.%${filters.search}%`)
      }

      // Apply sorting
      query = applySorting(query, filters?.sortBy || "name", filters?.sortOrder || "asc")

      // Status filter requires client-side filtering, so fetch all first
      const needsClientSideFilter = filters?.status && filters.status !== "all"
      
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
        filteredData = filteredData.filter(supplier => {
          const hasCompleteInfo = supplier.email && supplier.phone && supplier.contact_person
          return filters.status === "active" ? hasCompleteInfo : !hasCompleteInfo
        })
        
        // Apply pagination after client-side filtering
        if (filters?.page && filters?.limit) {
          const startIndex = (filters.page - 1) * filters.limit
          filteredData = filteredData.slice(startIndex, startIndex + filters.limit)
        }
      }

      return { data: filteredData, error: null }
    } catch (error) {
      return { 
        data: [], 
        error: error instanceof Error ? error.message : "Failed to fetch suppliers" 
      }
    }
  },

  // Get supplier by ID
  getSupplier: async (id: string): Promise<{ data: Supplier | null; error: string | null }> => {
    try {
      const supabase = createClient()
      
      const { data, error } = await supabase
        .from("suppliers")
        .select("*")
        .eq("id", id)
        .single()

      if (error) {
        throw new Error(error.message)
      }

      return { data, error: null }
    } catch (error) {
      return { 
        data: null, 
        error: error instanceof Error ? error.message : "Failed to fetch supplier" 
      }
    }
  },

  // Create supplier
  createSupplier: async (supplier: Omit<Supplier, "id" | "created_at">): Promise<{ data: Supplier | null; error: string | null }> => {
    try {
      const supabase = createClient()
      
      const { data, error } = await supabase
        .from("suppliers")
        .insert([supplier])
        .select("*")
        .single()

      if (error) {
        throw new Error(error.message)
      }

      return { data, error: null }
    } catch (error) {
      return { 
        data: null, 
        error: error instanceof Error ? error.message : "Failed to create supplier" 
      }
    }
  },

  // Update supplier
  updateSupplier: async (id: string, updates: Partial<Supplier>): Promise<{ data: Supplier | null; error: string | null }> => {
    try {
      const supabase = createClient()
      
      const { data, error } = await supabase
        .from("suppliers")
        .update(updates)
        .eq("id", id)
        .select("*")
        .single()

      if (error) {
        throw new Error(error.message)
      }

      return { data, error: null }
    } catch (error) {
      return { 
        data: null, 
        error: error instanceof Error ? error.message : "Failed to update supplier" 
      }
    }
  },

  // Delete supplier
  deleteSupplier: async (id: string): Promise<{ error: string | null }> => {
    try {
      const supabase = createClient()
      
      const { error } = await supabase
        .from("suppliers")
        .delete()
        .eq("id", id)

      if (error) {
        throw new Error(error.message)
      }

      return { error: null }
    } catch (error) {
      return { 
        error: error instanceof Error ? error.message : "Failed to delete supplier" 
      }
    }
  }
}
