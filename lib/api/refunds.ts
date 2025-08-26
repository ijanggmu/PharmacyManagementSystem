import { createClient } from "@/lib/supabase/client"
import {
  ApiListResponse,
  BaseFilters,
  listApiWrapper,
  buildSearchFilter,
  applySorting,
  applyPagination
} from "./utils"

export interface RefundItem {
  id: string
  refund_id: string
  sale_item_id: string
  quantity_refunded: number
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

export interface Refund {
  id: string
  refund_number: string
  sale_id: string
  customer_id: string
  refund_date: string
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
  refund_items: RefundItem[]
}

export interface RefundsFilters extends BaseFilters {
  status?: Refund['status']
  customerId?: string
  saleId?: string
  dateFrom?: string
  dateTo?: string
  minAmount?: number
  maxAmount?: number
}

export interface CreateRefundData {
  refund_number: string
  sale_id: string
  customer_id: string
  refund_date: string
  total_refund_amount: string
  status: Refund['status']
  reason?: string
  notes?: string
  refund_items: Omit<RefundItem, 'id' | 'refund_id'>[]
}

export interface UpdateRefundData {
  status?: Refund['status']
  reason?: string
  notes?: string
}

export const refundsApi = {
  // Get all refunds with filters
  getRefunds: async (filters: RefundsFilters = {}): Promise<ApiListResponse<Refund>> => {
    return listApiWrapper(async () => {
      const supabase = createClient()
      
      let query = supabase
        .from("refunds")
        .select(`
          *,
          sales (id, sale_number, total_amount),
          customers (id, first_name, last_name, phone),
          refund_items (
            id,
            quantity_refunded,
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
          'refund_number',
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
        query = query.gte('refund_date', filters.dateFrom)
      }

      if (filters.dateTo) {
        query = query.lte('refund_date', filters.dateTo)
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
    }, 'Failed to fetch refunds')
  },

  // Get refund by ID
  getRefund: async (id: string): Promise<ApiListResponse<Refund>> => {
    return listApiWrapper(async () => {
      const supabase = createClient()
      
      const { data, error } = await supabase
        .from("refunds")
        .select(`
          *,
          sales (id, sale_number, total_amount),
          customers (id, first_name, last_name, phone),
          refund_items (
            id,
            quantity_refunded,
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
    }, 'Failed to fetch refund')
  },

  // Create refund with items
  createRefund: async (refundData: CreateRefundData): Promise<ApiListResponse<Refund>> => {
    return listApiWrapper(async () => {
      const supabase = createClient()
      
      // Start a transaction-like operation
      const { data: refundRecord, error: refundError } = await supabase
        .from("refunds")
        .insert([{
          refund_number: refundData.refund_number,
          sale_id: refundData.sale_id,
          customer_id: refundData.customer_id,
          refund_date: refundData.refund_date,
          total_refund_amount: refundData.total_refund_amount,
          status: refundData.status,
          reason: refundData.reason,
          notes: refundData.notes
        }])
        .select()
        .single()

      if (refundError) {
        throw new Error(refundError.message)
      }

      // Insert refund items
      if (refundData.refund_items.length > 0) {
        const itemsToInsert = refundData.refund_items.map(item => ({
          refund_id: refundRecord.id,
          sale_item_id: item.sale_item_id,
          quantity_refunded: item.quantity_refunded,
          reason: item.reason,
          refund_amount: item.refund_amount
        }))

        const { error: itemsError } = await supabase
          .from("refund_items")
          .insert(itemsToInsert)

        if (itemsError) {
          throw new Error(itemsError.message)
        }
      }

      // Fetch the complete refund with items
      const { data: completeRefund, error: fetchError } = await supabase
        .from("refunds")
        .select(`
          *,
          sales (id, sale_number, total_amount),
          customers (id, first_name, last_name, phone),
          refund_items (
            id,
            quantity_refunded,
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
        .eq("id", refundRecord.id)
        .single()

      if (fetchError) {
        throw new Error(fetchError.message)
      }

      return completeRefund ? [completeRefund] : []
    }, 'Failed to create refund')
  },

  // Update refund
  updateRefund: async (id: string, updates: UpdateRefundData): Promise<ApiListResponse<Refund>> => {
    return listApiWrapper(async () => {
      const supabase = createClient()
      
      const { data, error } = await supabase
        .from("refunds")
        .update(updates)
        .eq("id", id)
        .select(`
          *,
          sales (id, sale_number, total_amount),
          customers (id, first_name, last_name, phone),
          refund_items (
            id,
            quantity_refunded,
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
    }, 'Failed to update refund')
  },

  // Update refund status
  updateRefundStatus: async (id: string, status: Refund['status']): Promise<ApiListResponse<Refund>> => {
    return refundsApi.updateRefund(id, { status })
  },

  // Delete refund (with cascade handling)
  deleteRefund: async (id: string): Promise<ApiListResponse<never>> => {
    return listApiWrapper(async () => {
      const supabase = createClient()
      
      // Delete refund items first (due to foreign key constraints)
      const { error: itemsError } = await supabase
        .from("refund_items")
        .delete()
        .eq("refund_id", id)

      if (itemsError) {
        throw new Error(itemsError.message)
      }

      // Delete the refund
      const { error: refundError } = await supabase
        .from("refunds")
        .delete()
        .eq("id", id)

      if (refundError) {
        throw new Error(refundError.message)
      }

      return []
    }, 'Failed to delete refund')
  },

  // Get refunds statistics
  getRefundsStats: async (): Promise<ApiListResponse<{
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
        .from("refunds")
        .select('status, total_refund_amount')

      if (error) {
        throw new Error(error.message)
      }

      const stats = {
        total: data?.length || 0,
        totalRefundAmount: data?.reduce((sum, refund) => sum + parseFloat(refund.total_refund_amount), 0) || 0,
        pending: data?.filter(r => r.status === 'pending').length || 0,
        approved: data?.filter(r => r.status === 'approved').length || 0,
        rejected: data?.filter(r => r.status === 'rejected').length || 0,
        completed: data?.filter(r => r.status === 'completed').length || 0,
      }

      return [stats]
    }, 'Failed to fetch refunds statistics')
  },

  // Get refunds by date range
  getRefundsByDateRange: async (startDate: string, endDate: string): Promise<ApiListResponse<Refund>> => {
    return refundsApi.getRefunds({ dateFrom: startDate, dateTo: endDate })
  }
}


