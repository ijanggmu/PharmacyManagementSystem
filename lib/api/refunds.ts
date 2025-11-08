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
  original_sale_id: string
  sale_id?: string // Alias for original_sale_id for compatibility
  customer_id: string
  refund_date: string
  refund_amount: string
  net_refund_amount: string
  total_refund_amount?: string // Alias for net_refund_amount for compatibility
  refund_status: 'pending' | 'approved' | 'rejected' | 'completed'
  status?: 'pending' | 'approved' | 'rejected' | 'completed' // Alias for refund_status
  refund_reason: string
  reason?: string | null // Alias for refund_reason
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
  status?: 'pending' | 'approved' | 'rejected' | 'completed'
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
  status?: 'pending' | 'approved' | 'rejected' | 'completed'
  refund_status?: 'pending' | 'approved' | 'rejected' | 'completed'
  reason?: string
  refund_reason?: string
  notes?: string
}

export const refundsApi = {
  // Get all refunds with filters
  getRefunds: async (filters: RefundsFilters = {}): Promise<ApiListResponse<Refund>> => {
    return listApiWrapper(async () => {
      const supabase = createClient()
      
      let query = supabase
        .from("sales_refunds")
        .select(`
          *,
          sales:original_sale_id (id, sale_number, total_amount),
          customers (id, first_name, last_name, phone)
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
        query = query.eq('refund_status', filters.status)
      }

      if (filters.customerId) {
        query = query.eq('customer_id', filters.customerId)
      }

      if (filters.saleId) {
        query = query.eq('original_sale_id', filters.saleId)
      }

      if (filters.dateFrom) {
        query = query.gte('refund_date', filters.dateFrom)
      }

      if (filters.dateTo) {
        query = query.lte('refund_date', filters.dateTo)
      }

      if (filters.minAmount) {
        query = query.gte('net_refund_amount', filters.minAmount.toString())
      }

      if (filters.maxAmount) {
        query = query.lte('net_refund_amount', filters.maxAmount.toString())
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

      // Fetch refund items separately for each refund
      if (data && data.length > 0) {
        const refundIds = data.map((r: any) => r.id)
        const { data: itemsData } = await supabase
          .from("sales_refund_items")
          .select(`
            *,
            sale_items (
              id,
              quantity,
              unit_price,
              total_price,
              medicines (id, name, strength, form)
            )
          `)
          .in("refund_id", refundIds)

        // Group items by refund_id
        const itemsMap: Record<string, any[]> = {}
        itemsData?.forEach((item: any) => {
          if (!itemsMap[item.refund_id]) {
            itemsMap[item.refund_id] = []
          }
          itemsMap[item.refund_id].push(item)
        })

        // Attach items to refunds and add compatibility aliases
        return (data || []).map((refund: any) => ({
          ...refund,
          sale_id: refund.original_sale_id,
          total_refund_amount: refund.net_refund_amount,
          status: refund.refund_status,
          reason: refund.refund_reason,
          refund_items: itemsMap[refund.id] || []
        }))
      }

      return []
    }, 'Failed to fetch refunds')
  },

  // Get refund by ID
  getRefund: async (id: string): Promise<ApiListResponse<Refund>> => {
    return listApiWrapper(async () => {
      const supabase = createClient()
      
      const { data, error } = await supabase
        .from("sales_refunds")
        .select(`
          *,
          sales:original_sale_id (id, sale_number, total_amount),
          customers (id, first_name, last_name, phone)
        `)
        .eq("id", id)
        .single()

      if (error) {
        throw new Error(error.message)
      }

      if (!data) return []

      // Fetch refund items
      const { data: itemsData } = await supabase
        .from("sales_refund_items")
        .select(`
          *,
          sale_items (
            id,
            quantity,
            unit_price,
            total_price,
            medicines (id, name, strength, form)
          )
        `)
        .eq("refund_id", id)

      // Add compatibility aliases
      const refund = {
        ...data,
        sale_id: data.original_sale_id,
        total_refund_amount: data.net_refund_amount,
        status: data.refund_status,
        reason: data.refund_reason,
        refund_items: itemsData || []
      }

      return [refund]
    }, 'Failed to fetch refund')
  },

  // Create refund with items
  createRefund: async (refundData: CreateRefundData): Promise<ApiListResponse<Refund>> => {
    return listApiWrapper(async () => {
      const supabase = createClient()
      
      // Start a transaction-like operation
      const { data: refundRecord, error: refundError } = await supabase
        .from("sales_refunds")
        .insert([{
          refund_number: refundData.refund_number,
          original_sale_id: refundData.sale_id,
          customer_id: refundData.customer_id,
          refund_date: refundData.refund_date,
          refund_amount: refundData.total_refund_amount,
          net_refund_amount: refundData.total_refund_amount,
          refund_status: refundData.status,
          refund_reason: refundData.reason || '',
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
          total_refund_amount: item.refund_amount
        }))

        const { error: itemsError } = await supabase
          .from("sales_refund_items")
          .insert(itemsToInsert)

        if (itemsError) {
          throw new Error(itemsError.message)
        }
      }

      // Fetch the complete refund with items
      const { data: completeRefund, error: fetchError } = await supabase
        .from("sales_refunds")
        .select(`
          *,
          sales:original_sale_id (id, sale_number, total_amount),
          customers (id, first_name, last_name, phone)
        `)
        .eq("id", refundRecord.id)
        .single()

      if (fetchError) {
        throw new Error(fetchError.message)
      }

      if (!completeRefund) return []

      // Fetch refund items
      const { data: itemsData } = await supabase
        .from("sales_refund_items")
        .select(`
          *,
          sale_items (
            id,
            quantity,
            unit_price,
            total_price,
            medicines (id, name, strength, form)
          )
        `)
        .eq("refund_id", refundRecord.id)

      // Add compatibility aliases
      const refund = {
        ...completeRefund,
        sale_id: completeRefund.original_sale_id,
        total_refund_amount: completeRefund.net_refund_amount,
        status: completeRefund.refund_status,
        reason: completeRefund.refund_reason,
        refund_items: itemsData || []
      }

      return [refund]
    }, 'Failed to create refund')
  },

  // Update refund
  updateRefund: async (id: string, updates: UpdateRefundData): Promise<ApiListResponse<Refund>> => {
    return listApiWrapper(async () => {
      const supabase = createClient()
      
      // Map status to refund_status if provided
      const updateData: any = { ...updates }
      if (updates.status) {
        updateData.refund_status = updates.status
        delete updateData.status
      }
      if (updates.reason) {
        updateData.refund_reason = updates.reason
        delete updateData.reason
      }

      const { data, error } = await supabase
        .from("sales_refunds")
        .update(updateData)
        .eq("id", id)
        .select(`
          *,
          sales:original_sale_id (id, sale_number, total_amount),
          customers (id, first_name, last_name, phone)
        `)
        .single()

      if (error) {
        throw new Error(error.message)
      }

      if (!data) return []

      // Fetch refund items
      const { data: itemsData } = await supabase
        .from("sales_refund_items")
        .select(`
          *,
          sale_items (
            id,
            quantity,
            unit_price,
            total_price,
            medicines (id, name, strength, form)
          )
        `)
        .eq("refund_id", id)

      // Add compatibility aliases
      const refund = {
        ...data,
        sale_id: data.original_sale_id,
        total_refund_amount: data.net_refund_amount,
        status: data.refund_status,
        reason: data.refund_reason,
        refund_items: itemsData || []
      }

      return [refund]
    }, 'Failed to update refund')
  },

  // Update refund status
  updateRefundStatus: async (id: string, status: 'pending' | 'approved' | 'rejected' | 'completed'): Promise<ApiListResponse<Refund>> => {
    return refundsApi.updateRefund(id, { status: status as any })
  },

  // Delete refund (with cascade handling)
  deleteRefund: async (id: string): Promise<ApiListResponse<never>> => {
    return listApiWrapper(async () => {
      const supabase = createClient()
      
      // Delete refund items first (due to foreign key constraints)
      const { error: itemsError } = await supabase
        .from("sales_refund_items")
        .delete()
        .eq("refund_id", id)

      if (itemsError) {
        throw new Error(itemsError.message)
      }

      // Delete the refund
      const { error: refundError } = await supabase
        .from("sales_refunds")
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
        .from("sales_refunds")
        .select('refund_status, net_refund_amount')

      if (error) {
        throw new Error(error.message)
      }

      const stats = {
        total: data?.length || 0,
        totalRefundAmount: data?.reduce((sum: number, refund: any) => sum + parseFloat(refund.net_refund_amount || '0'), 0) || 0,
        pending: data?.filter((r: any) => r.refund_status === 'pending').length || 0,
        approved: data?.filter((r: any) => r.refund_status === 'approved').length || 0,
        rejected: data?.filter((r: any) => r.refund_status === 'rejected').length || 0,
        completed: data?.filter((r: any) => r.refund_status === 'completed').length || 0,
      }

      return [stats]
    }, 'Failed to fetch refunds statistics')
  },

  // Get refunds by date range
  getRefundsByDateRange: async (startDate: string, endDate: string): Promise<ApiListResponse<Refund>> => {
    return refundsApi.getRefunds({ dateFrom: startDate, dateTo: endDate })
  }
}





