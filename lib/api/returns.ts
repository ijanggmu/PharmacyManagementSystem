import { createClient } from "@/lib/supabase/client"
import { 
  ApiListResponse, 
  BaseFilters, 
  listApiWrapper,
  buildSearchFilter,
  applySorting,
  applyPagination
} from "./utils"

export interface ReturnItem {
  id: string
  return_id: string
  sale_item_id: string
  quantity_returned: number
  reason: string
  refund_amount: string
  sale_items: {
    id: string
    quantity: number
    unit_price: string
    total_price: string
    medicines: {
      id: string
      name: string
      strength: string
      form: string
    } | null
  } | null
}

export interface Return {
  id: string
  return_number: string
  sale_id: string
  customer_id: string
  return_date: string
  total_refund_amount: string
  status: 'pending' | 'approved' | 'rejected' | 'completed'
  reason: string | null
  notes: string | null
  created_at: string
  sales: {
    id: string
    sale_number: string
    total_amount: string
  } | null
  customers: {
    id: string
    first_name: string
    last_name: string
    phone: string | null
  } | null
  return_items: ReturnItem[]
}

export interface ReturnsFilters extends BaseFilters {
  status?: Return['status']
  customerId?: string
  saleId?: string
  dateFrom?: string
  dateTo?: string
  minAmount?: number
  maxAmount?: number
}

export interface CreateReturnData {
  return_number: string
  sale_id: string
  customer_id: string
  return_date: string
  total_refund_amount: string
  status: Return['status']
  reason?: string
  notes?: string
  return_items: Omit<ReturnItem, 'id' | 'return_id'>[]
}

export interface UpdateReturnData {
  status?: Return['status']
  reason?: string
  notes?: string
}

export const returnsApi = {
  // Get all returns with filters
  getReturns: async (filters: ReturnsFilters = {}): Promise<ApiListResponse<Return>> => {
    return listApiWrapper(async () => {
      const supabase = createClient()
      
      let query = supabase
        .from("medicine_returns")
        .select(`
          *,
          sales (id, sale_number, total_amount),
          customers (id, first_name, last_name, phone),
          return_items (
            id,
            quantity_returned,
            reason,
            refund_amount,
            sale_items (
              id,
              quantity,
              unit_price,
              total_price,
              medicines (id, name, strength, form)
            )
          )
        `)

      // Apply filters
      if (filters.search) {
        const searchFields = [
          'return_number',
          'sales.sale_number',
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

      if (filters.saleId) {
        query = query.eq('sale_id', filters.saleId)
      }

      if (filters.dateFrom) {
        query = query.gte('return_date', filters.dateFrom)
      }

      if (filters.dateTo) {
        query = query.lte('return_date', filters.dateTo)
      }

      if (filters.minAmount) {
        query = query.gte('total_refund_amount', filters.minAmount.toString())
      }

      if (filters.maxAmount) {
        query = query.lte('total_refund_amount', filters.maxAmount.toString())
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
    }, 'Failed to fetch returns')
  },

  // Get return by ID
  getReturn: async (id: string): Promise<ApiListResponse<Return>> => {
    return listApiWrapper(async () => {
      const supabase = createClient()
      
      const { data, error } = await supabase
        .from("medicine_returns")
        .select(`
          *,
          sales (id, sale_number, total_amount),
          customers (id, first_name, last_name, phone),
          return_items (
            id,
            quantity_returned,
            reason,
            refund_amount,
            sale_items (
              id,
              quantity,
              unit_price,
              total_price,
              medicines (id, name, strength, form)
            )
          )
        `)
        .eq("id", id)
        .single()

      if (error) {
        throw new Error(error.message)
      }

      return data ? [data] : []
    }, 'Failed to fetch return')
  },

  // Create return with items
  createReturn: async (returnData: CreateReturnData): Promise<ApiListResponse<Return>> => {
    return listApiWrapper(async () => {
      const supabase = createClient()
      
      // Start a transaction-like operation
      const { data: returnRecord, error: returnError } = await supabase
        .from("medicine_returns")
        .insert([{
          return_number: returnData.return_number,
          sale_id: returnData.sale_id,
          customer_id: returnData.customer_id,
          return_date: returnData.return_date,
          total_refund_amount: returnData.total_refund_amount,
          status: returnData.status,
          reason: returnData.reason,
          notes: returnData.notes
        }])
        .select()
        .single()

      if (returnError) {
        throw new Error(returnError.message)
      }

      // Insert return items
      if (returnData.return_items.length > 0) {
        const itemsToInsert = returnData.return_items.map(item => ({
          return_id: returnRecord.id,
          sale_item_id: item.sale_item_id,
          quantity_returned: item.quantity_returned,
          reason: item.reason,
          refund_amount: item.refund_amount
        }))

        const { error: itemsError } = await supabase
          .from("return_items")
          .insert(itemsToInsert)

        if (itemsError) {
          throw new Error(itemsError.message)
        }
      }

      // Fetch the complete return with items
      const { data: completeReturn, error: fetchError } = await supabase
        .from("medicine_returns")
        .select(`
          *,
          sales (id, sale_number, total_amount),
          customers (id, first_name, last_name, phone),
          return_items (
            id,
            quantity_returned,
            reason,
            refund_amount,
            sale_items (
              id,
              quantity,
              unit_price,
              total_price,
              medicines (id, name, strength, form)
            )
          )
        `)
        .eq("id", returnRecord.id)
        .single()

      if (fetchError) {
        throw new Error(fetchError.message)
      }

      return completeReturn ? [completeReturn] : []
    }, 'Failed to create return')
  },

  // Update return
  updateReturn: async (id: string, updates: UpdateReturnData): Promise<ApiListResponse<Return>> => {
    return listApiWrapper(async () => {
      const supabase = createClient()
      
      const { data, error } = await supabase
        .from("medicine_returns")
        .update(updates)
        .eq("id", id)
        .select(`
          *,
          sales (id, sale_number, total_amount),
          customers (id, first_name, last_name, phone),
          return_items (
            id,
            quantity_returned,
            reason,
            refund_amount,
            sale_items (
              id,
              quantity,
              unit_price,
              total_price,
              medicines (id, name, strength, form)
            )
          )
        `)
        .single()

      if (error) {
        throw new Error(error.message)
      }

      return data ? [data] : []
    }, 'Failed to update return')
  },

  // Update return status
  updateReturnStatus: async (id: string, status: Return['status']): Promise<ApiListResponse<Return>> => {
    return returnsApi.updateReturn(id, { status })
  },

  // Delete return (with cascade handling)
  deleteReturn: async (id: string): Promise<ApiListResponse<never>> => {
    return listApiWrapper(async () => {
      const supabase = createClient()
      
      // Delete return items first (due to foreign key constraints)
      const { error: itemsError } = await supabase
        .from("return_items")
        .delete()
        .eq("return_id", id)

      if (itemsError) {
        throw new Error(itemsError.message)
      }

      // Delete the return
      const { error: returnError } = await supabase
        .from("medicine_returns")
        .delete()
        .eq("id", id)

      if (returnError) {
        throw new Error(returnError.message)
      }

      return []
    }, 'Failed to delete return')
  },

  // Get returns statistics
  getReturnsStats: async (): Promise<ApiListResponse<{
    total: number
    totalRefundAmount: number
    pending: number
    approved: number
    rejected: number
    completed: number
  }>> => {
    return listApiWrapper(async () => {
      const supabase = createClient()
      
      const { data, error } = await supabase
        .from("medicine_returns")
        .select('status, total_refund_amount')

      if (error) {
        throw new Error(error.message)
      }

      const stats = {
        total: data?.length || 0,
        totalRefundAmount: data?.reduce((sum, returnRecord) => sum + parseFloat(returnRecord.total_refund_amount), 0) || 0,
        pending: data?.filter(r => r.status === 'pending').length || 0,
        approved: data?.filter(r => r.status === 'approved').length || 0,
        rejected: data?.filter(r => r.status === 'rejected').length || 0,
        completed: data?.filter(r => r.status === 'completed').length || 0,
      }

      return [stats]
    }, 'Failed to fetch returns statistics')
  },

  // Get returns by date range
  getReturnsByDateRange: async (startDate: string, endDate: string): Promise<ApiListResponse<Return>> => {
    return returnsApi.getReturns({ dateFrom: startDate, dateTo: endDate })
  }
}
