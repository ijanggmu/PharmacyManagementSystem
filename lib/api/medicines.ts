import { createClient } from "@/lib/supabase/client"

export interface Medicine {
  id: string
  name: string
  generic_name: string | null
  brand_name: string | null
  strength: string
  form: string
  unit_price: string
  cost_price: string
  stock_quantity: number
  minimum_stock: number
  maximum_stock: number
  expiry_date: string | null
  category_id: string | null
  supplier_id: string | null
  description: string | null
  controlled_substance: boolean
  prescription_required: boolean
  dosage: string | null
  side_effects: string | null
  storage_instructions: string | null
  barcode: string | null
  created_at: string
  updated_at: string
  categories: {
    id: string
    name: string
  } | null
  suppliers: {
    id: string
    name: string
  } | null
}

export interface MedicinesFilters {
  search?: string
  category?: string
  stockStatus?: "all" | "in" | "low" | "out"
  expiryStatus?: "all" | "expiring" | "expired"
}

export interface MedicinesResponse {
  data: Medicine[]
  error: string | null
}

export const medicinesApi = {
  // Get all medicines with optional filters
  getMedicines: async (filters?: MedicinesFilters): Promise<MedicinesResponse> => {
    try {
      const supabase = createClient()
      
      let query = supabase
        .from("medicines")
        .select(`
          *,
          categories (id, name),
          suppliers (id, name)
        `)
        .order("name")

      // Apply filters
      if (filters?.search) {
        query = query.or(`name.ilike.%${filters.search}%,generic_name.ilike.%${filters.search}%,brand_name.ilike.%${filters.search}%`)
      }

      if (filters?.category && filters.category !== "all") {
        query = query.eq("categories.name", filters.category)
      }

      if (filters?.stockStatus && filters.stockStatus !== "all") {
        switch (filters.stockStatus) {
          case "low":
            query = query.lte("stock_quantity", "minimum_stock")
            break
          case "out":
            query = query.eq("stock_quantity", 0)
            break
          case "in":
            query = query.gt("stock_quantity", "minimum_stock")
            break
        }
      }

      if (filters?.expiryStatus && filters.expiryStatus !== "all") {
        const currentDate = new Date().toISOString().split('T')[0]
        const thirtyDaysFromNow = new Date(Date.now() + 30 * 24 * 60 * 60 * 1000).toISOString().split('T')[0]
        
        switch (filters.expiryStatus) {
          case "expired":
            query = query.lt("expiry_date", currentDate)
            break
          case "expiring":
            query = query.gte("expiry_date", currentDate).lte("expiry_date", thirtyDaysFromNow)
            break
        }
      }

      const { data, error } = await query

      if (error) {
        throw new Error(error.message)
      }

      return { data: data || [], error: null }
    } catch (error) {
      return { 
        data: [], 
        error: error instanceof Error ? error.message : "Failed to fetch medicines" 
      }
    }
  },

  // Get medicine by ID
  getMedicine: async (id: string): Promise<{ data: Medicine | null; error: string | null }> => {
    try {
      const supabase = createClient()
      
      const { data, error } = await supabase
        .from("medicines")
        .select(`
          *,
          categories (id, name),
          suppliers (id, name)
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
        error: error instanceof Error ? error.message : "Failed to fetch medicine" 
      }
    }
  },

  // Create medicine
  createMedicine: async (medicine: Omit<Medicine, "id" | "created_at" | "updated_at">): Promise<{ data: Medicine | null; error: string | null }> => {
    try {
      const supabase = createClient()
      
      const { data, error } = await supabase
        .from("medicines")
        .insert([medicine])
        .select(`
          *,
          categories (id, name),
          suppliers (id, name)
        `)
        .single()

      if (error) {
        throw new Error(error.message)
      }

      return { data, error: null }
    } catch (error) {
      return { 
        data: null, 
        error: error instanceof Error ? error.message : "Failed to create medicine" 
      }
    }
  },

  // Update medicine
  updateMedicine: async (id: string, updates: Partial<Medicine>): Promise<{ data: Medicine | null; error: string | null }> => {
    try {
      const supabase = createClient()
      
      const { data, error } = await supabase
        .from("medicines")
        .update(updates)
        .eq("id", id)
        .select(`
          *,
          categories (id, name),
          suppliers (id, name)
        `)
        .single()

      if (error) {
        throw new Error(error.message)
      }

      return { data, error: null }
    } catch (error) {
      return { 
        data: null, 
        error: error instanceof Error ? error.message : "Failed to update medicine" 
      }
    }
  },

  // Delete medicine
  deleteMedicine: async (id: string): Promise<{ error: string | null }> => {
    try {
      const supabase = createClient()
      
      // Check for related records with timeout and better error handling
      const checkRelatedRecords = async () => {
        try {
          // Use a timeout to prevent hanging
          const timeoutPromise = new Promise((_, reject) => 
            setTimeout(() => reject(new Error('Database query timeout')), 5000)
          )

          const checkPromise = Promise.all([
            supabase.from("inventory_transactions").select("id").eq("medicine_id", id).limit(1),
            supabase.from("prescription_items").select("id").eq("medicine_id", id).limit(1),
            supabase.from("sale_items").select("id").eq("medicine_id", id).limit(1)
          ])

          const [inventoryResult, prescriptionResult, salesResult] = await Promise.race([
            checkPromise,
            timeoutPromise
          ]) as any

          if (inventoryResult.data?.length || prescriptionResult.data?.length || salesResult.data?.length) {
            throw new Error("Cannot delete medicine with related records. Please archive the medicine instead.")
          }
        } catch (error) {
          if (error instanceof Error && error.message === 'Database query timeout') {
            throw new Error("Database operation timed out. Please try again.")
          }
          throw error
        }
      }

      await checkRelatedRecords()

      // Proceed with deletion
      const { error } = await supabase
        .from("medicines")
        .delete()
        .eq("id", id)

      if (error) {
        throw new Error(error.message)
      }

      return { error: null }
    } catch (error) {
      return { 
        error: error instanceof Error ? error.message : "Failed to delete medicine" 
      }
    }
  }
}
