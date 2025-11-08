import { createClient } from "@/lib/supabase/client"
import { 
  ApiListResponse, 
  BaseFilters, 
  listApiWrapper,
  buildSearchFilter,
  applySorting,
  applyPagination
} from "./utils"

export interface SaleItem {
  id: string
  sale_id: string
  medicine_id: string
  quantity: number
  unit_price: string
  total_price: string
  medicines: {
    id: string
    name: string
    strength: string
    form: string
  } | null
}

export interface Sale {
  id: string
  sale_number: string
  customer_id: string
  total_amount: string
  discount_amount: string
  tax_amount: string
  payment_method: 'cash' | 'card' | 'insurance' | 'other'
  payment_status: 'pending' | 'paid' | 'completed' | 'failed' | 'refunded'
  sale_date: string
  notes: string | null
  created_at: string
  customers: {
    id: string
    first_name: string
    last_name: string
    phone: string | null
    email: string | null
  } | null
  sale_items: SaleItem[]
}

export interface SalesFilters extends BaseFilters {
  paymentStatus?: Sale['payment_status']
  paymentMethod?: Sale['payment_method']
  customerId?: string
  dateFrom?: string
  dateTo?: string
  minAmount?: number
  maxAmount?: number
}

export interface CreateSaleData {
  sale_number: string
  customer_id: string
  total_amount: string
  discount_amount: string
  tax_amount: string
  payment_method: Sale['payment_method']
  payment_status: Sale['payment_status']
  sale_date: string
  notes?: string
  sale_items: Omit<SaleItem, 'id' | 'sale_id' | 'medicines'>[]
}

export interface UpdateSaleData {
  payment_status?: Sale['payment_status']
  notes?: string
}

export const salesApi = {
  // Get all sales with filters
  getSales: async (filters: SalesFilters = {}): Promise<ApiListResponse<Sale>> => {
    return listApiWrapper(async () => {
      const supabase = createClient()
      
      let query = supabase
        .from("sales")
        .select(`
          *,
          customers (id, first_name, last_name, phone, email),
          sale_items (
            id,
            quantity,
            unit_price,
            total_price,
            medicines (id, name, strength, form)
          )
        `)

      // Apply filters
      if (filters.search) {
        const searchFields = [
          'sale_number',
          'customers.first_name',
          'customers.last_name',
          'customers.phone'
        ]
        query = buildSearchFilter(query, filters.search, searchFields)
      }

      if (filters.paymentStatus) {
        query = query.eq('payment_status', filters.paymentStatus)
      }

      if (filters.paymentMethod) {
        query = query.eq('payment_method', filters.paymentMethod)
      }

      if (filters.customerId) {
        query = query.eq('customer_id', filters.customerId)
      }

      if (filters.dateFrom) {
        query = query.gte('sale_date', filters.dateFrom)
      }

      if (filters.dateTo) {
        query = query.lte('sale_date', filters.dateTo)
      }

      if (filters.minAmount) {
        query = query.gte('total_amount', filters.minAmount.toString())
      }

      if (filters.maxAmount) {
        query = query.lte('total_amount', filters.maxAmount.toString())
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
    }, 'Failed to fetch sales')
  },

  // Get sale by ID
  getSale: async (id: string): Promise<ApiListResponse<Sale>> => {
    return listApiWrapper(async () => {
      const supabase = createClient()
      
      const { data, error } = await supabase
        .from("sales")
        .select(`
          *,
          customers (id, first_name, last_name, phone, email),
          sale_items (
            id,
            quantity,
            unit_price,
            total_price,
            medicines (id, name, strength, form)
          )
        `)
        .eq("id", id)
        .single()

      if (error) {
        throw new Error(error.message)
      }

      return data ? [data] : []
    }, 'Failed to fetch sale')
  },

  // Create sale with items
  createSale: async (saleData: CreateSaleData): Promise<ApiListResponse<Sale>> => {
    return listApiWrapper(async () => {
      const supabase = createClient()
      
      // Start a transaction-like operation
      const { data: sale, error: saleError } = await supabase
        .from("sales")
        .insert([{
          sale_number: saleData.sale_number,
          customer_id: saleData.customer_id,
          total_amount: saleData.total_amount,
          discount_amount: saleData.discount_amount,
          tax_amount: saleData.tax_amount,
          payment_method: saleData.payment_method,
          payment_status: saleData.payment_status,
          sale_date: saleData.sale_date,
          notes: saleData.notes
        }])
        .select()
        .single()

      if (saleError) {
        throw new Error(saleError.message)
      }

      // Insert sale items
      if (saleData.sale_items.length > 0) {
        const itemsToInsert = saleData.sale_items.map(item => ({
          sale_id: sale.id,
          medicine_id: item.medicine_id,
          quantity: item.quantity,
          unit_price: item.unit_price,
          total_price: item.total_price
        }))

        const { error: itemsError } = await supabase
          .from("sale_items")
          .insert(itemsToInsert)

        if (itemsError) {
          throw new Error(itemsError.message)
        }
      }

      // Fetch the complete sale with items
      const { data: completeSale, error: fetchError } = await supabase
        .from("sales")
        .select(`
          *,
          customers (id, first_name, last_name, phone, email),
          sale_items (
            id,
            quantity,
            unit_price,
            total_price,
            medicines (id, name, strength, form)
          )
        `)
        .eq("id", sale.id)
        .single()

      if (fetchError) {
        throw new Error(fetchError.message)
      }

      return completeSale ? [completeSale] : []
    }, 'Failed to create sale')
  },

  // Update sale
  updateSale: async (id: string, updates: UpdateSaleData): Promise<ApiListResponse<Sale>> => {
    return listApiWrapper(async () => {
      const supabase = createClient()
      
      const { data, error } = await supabase
        .from("sales")
        .update(updates)
        .eq("id", id)
        .select(`
          *,
          customers (id, first_name, last_name, phone, email),
          sale_items (
            id,
            quantity,
            unit_price,
            total_price,
            medicines (id, name, strength, form)
          )
        `)
        .single()

      if (error) {
        throw new Error(error.message)
      }

      return data ? [data] : []
    }, 'Failed to update sale')
  },

  // Update sale payment status
  updateSalePaymentStatus: async (id: string, paymentStatus: Sale['payment_status']): Promise<ApiListResponse<Sale>> => {
    return salesApi.updateSale(id, { payment_status: paymentStatus })
  },

  // Delete sale (with cascade handling)
  deleteSale: async (id: string): Promise<ApiListResponse<never>> => {
    return listApiWrapper(async () => {
      const supabase = createClient()
      
      // Delete sale items first (due to foreign key constraints)
      const { error: itemsError } = await supabase
        .from("sale_items")
        .delete()
        .eq("sale_id", id)

      if (itemsError) {
        throw new Error(itemsError.message)
      }

      // Delete the sale
      const { error: saleError } = await supabase
        .from("sales")
        .delete()
        .eq("id", id)

      if (saleError) {
        throw new Error(saleError.message)
      }

      return []
    }, 'Failed to delete sale')
  },

  // Get sales statistics
  getSalesStats: async (): Promise<ApiListResponse<{
    total: number
    totalRevenue: number
    todaySales: number
    todayRevenue: number
    pendingPayments: number
    completedPayments: number
  }>> => {
    return listApiWrapper(async () => {
      const supabase = createClient()
      
      const { data, error } = await supabase
        .from("sales")
        .select('total_amount, payment_status, sale_date')

      if (error) {
        throw new Error(error.message)
      }

      const today = new Date()
      today.setHours(0, 0, 0, 0)

      const stats = {
        total: data?.length || 0,
        totalRevenue: data?.reduce((sum, sale) => sum + parseFloat(sale.total_amount), 0) || 0,
        todaySales: data?.filter(sale => {
          const saleDate = new Date(sale.sale_date)
          return saleDate >= today
        }).length || 0,
        todayRevenue: data?.filter(sale => {
          const saleDate = new Date(sale.sale_date)
          return saleDate >= today
        }).reduce((sum, sale) => sum + parseFloat(sale.total_amount), 0) || 0,
        pendingPayments: data?.filter(sale => sale.payment_status === 'pending').length || 0,
        completedPayments: data?.filter(sale => sale.payment_status === 'completed').length || 0,
      }

      return [stats]
    }, 'Failed to fetch sales statistics')
  },

  // Get sales by date range
  getSalesByDateRange: async (startDate: string, endDate: string): Promise<ApiListResponse<Sale>> => {
    return salesApi.getSales({ dateFrom: startDate, dateTo: endDate })
  }
}
