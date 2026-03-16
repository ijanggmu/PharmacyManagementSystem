import { createClient } from "@/lib/supabase/client"
import { applyPagination, applySorting } from "./utils"

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
  /** Multiple category IDs (overrides category when set) */
  categoryIds?: string[]
  stockStatus?: "all" | "in" | "low" | "out"
  /** Multiple stock statuses (overrides stockStatus when set) */
  stockStatuses?: ("in" | "low" | "out")[]
  expiryStatus?: "all" | "expiring" | "expired"
  /** Multiple expiry statuses (overrides expiryStatus when set) */
  expiryStatuses?: ("expiring" | "expired")[]
  page?: number
  limit?: number
  sortBy?: string
  sortOrder?: 'asc' | 'desc'
}

export interface MedicinesResponse {
  data: Medicine[]
  total?: number
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

      const categoryIds = filters?.categoryIds?.length ? filters.categoryIds : undefined
      if (categoryIds?.length) {
        query = query.in("category_id", categoryIds)
      } else if (filters?.category && filters.category !== "all") {
        query = query.eq("category_id", filters.category)
      }

      const stockStatuses = filters?.stockStatuses?.length ? filters.stockStatuses : undefined
      const singleStock = !stockStatuses && filters?.stockStatus && filters.stockStatus !== "all"
      if (singleStock) {
        switch (filters.stockStatus) {
          case "low":
            break
          case "out":
            query = query.eq("stock_quantity", 0)
            break
          case "in":
            break
        }
      }

      const expiryStatuses = filters?.expiryStatuses?.length ? filters.expiryStatuses : undefined
      const singleExpiry = !expiryStatuses && filters?.expiryStatus && filters.expiryStatus !== "all"
      if (singleExpiry) {
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

      // Apply sorting
      query = applySorting(query, filters?.sortBy || "name", filters?.sortOrder || "asc")

      // For stock status filters that require client-side filtering, we need to fetch all first
      const needsClientSideFilter =
        (singleStock && (filters.stockStatus === "low" || filters.stockStatus === "in")) ||
        (stockStatuses && stockStatuses.length > 0) ||
        (expiryStatuses && expiryStatuses.length > 0)
      
      // Get total count before pagination (for non-client-side filters)
      let totalCount: number | undefined
      if (!needsClientSideFilter) {
        let countQuery = supabase
          .from("medicines")
          .select("*", { count: "exact", head: true })
        
        if (filters?.search) {
          countQuery = countQuery.or(`name.ilike.%${filters.search}%,generic_name.ilike.%${filters.search}%,brand_name.ilike.%${filters.search}%`)
        }
        if (categoryIds?.length) {
          countQuery = countQuery.in("category_id", categoryIds)
        } else if (filters?.category && filters.category !== "all") {
          countQuery = countQuery.eq("category_id", filters.category)
        }
        if (singleStock && filters?.stockStatus === "out") {
          countQuery = countQuery.eq("stock_quantity", 0)
        }
        if (singleExpiry && filters?.expiryStatus) {
          const currentDate = new Date().toISOString().split('T')[0]
          const thirtyDaysFromNow = new Date(Date.now() + 30 * 24 * 60 * 60 * 1000).toISOString().split('T')[0]
          if (filters.expiryStatus === "expired") {
            countQuery = countQuery.lt("expiry_date", currentDate)
          } else if (filters.expiryStatus === "expiring") {
            countQuery = countQuery.gte("expiry_date", currentDate).lte("expiry_date", thirtyDaysFromNow)
          }
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

      let filteredData = data || []

      const matchStock = (medicine: Medicine, status: "in" | "low" | "out") => {
        if (status === "out") return medicine.stock_quantity === 0
        if (status === "low") return medicine.stock_quantity <= medicine.minimum_stock && medicine.stock_quantity > 0
        return medicine.stock_quantity > medicine.minimum_stock
      }
      const currentDate = new Date().toISOString().split('T')[0]
      const thirtyDaysFromNow = new Date(Date.now() + 30 * 24 * 60 * 60 * 1000).toISOString().split('T')[0]
      const matchExpiry = (medicine: Medicine, status: "expiring" | "expired") => {
        const d = medicine.expiry_date
        if (!d) return false
        if (status === "expired") return d < currentDate
        return d >= currentDate && d <= thirtyDaysFromNow
      }

      // Apply client-side filtering for stock and/or expiry (single or multiple)
      if (stockStatuses?.length) {
        filteredData = filteredData.filter((m: Medicine) => stockStatuses.some((s) => matchStock(m, s)))
      } else if (singleStock && filters?.stockStatus && filters.stockStatus !== "all") {
        switch (filters.stockStatus) {
          case "low":
            filteredData = filteredData.filter((m: Medicine) => matchStock(m, "low"))
            break
          case "in":
            filteredData = filteredData.filter((m: Medicine) => matchStock(m, "in"))
            break
        }
      }
      if (expiryStatuses?.length) {
        filteredData = filteredData.filter((m: Medicine) => expiryStatuses.some((s) => matchExpiry(m, s)))
      }

      if (needsClientSideFilter) {
        totalCount = filteredData.length
        if (filters?.page && filters?.limit) {
          const startIndex = (filters.page - 1) * filters.limit
          filteredData = filteredData.slice(startIndex, startIndex + filters.limit)
        }
      }

      return { data: filteredData, total: totalCount, error: null }
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
