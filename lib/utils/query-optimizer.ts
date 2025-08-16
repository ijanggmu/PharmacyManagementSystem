// Query optimization utilities for better performance

export interface QueryOptions {
  limit?: number
  offset?: number
  orderBy?: string
  orderDirection?: 'asc' | 'desc'
  select?: string[]
  include?: string[]
}

export interface PaginationOptions {
  page: number
  pageSize: number
  total?: number
}

export class QueryOptimizer {
  // Optimize medicine queries with selective field loading
  static optimizeMedicineQuery(options: QueryOptions = {}) {
    const baseSelect = [
      'id',
      'name',
      'strength',
      'form',
      'unit_price',
      'stock_quantity',
      'minimum_stock',
      'expiry_date',
      'prescription_required',
      'controlled_substance'
    ]

    const select = options.select || baseSelect
    let query = select.join(', ')

    // Add category and supplier info only if needed
    if (options.include?.includes('categories')) {
      query += ', categories(name)'
    }
    if (options.include?.includes('suppliers')) {
      query += ', suppliers(name)'
    }

    return query
  }

  // Optimize customer queries
  static optimizeCustomerQuery(options: QueryOptions = {}) {
    const baseSelect = [
      'id',
      'first_name',
      'last_name',
      'email',
      'phone',
      'created_at'
    ]

    const select = options.select || baseSelect
    let query = select.join(', ')

    // Add related data only if needed
    if (options.include?.includes('prescriptions')) {
      query += ', prescriptions(id, status, created_at)'
    }
    if (options.include?.includes('sales')) {
      query += ', sales(id, total_amount, sale_date)'
    }

    return query
  }

  // Optimize prescription queries
  static optimizePrescriptionQuery(options: QueryOptions = {}) {
    const baseSelect = [
      'id',
      'prescription_number',
      'status',
      'issue_date',
      'created_at'
    ]

    const select = options.select || baseSelect
    let query = select.join(', ')

    if (options.include?.includes('customers')) {
      query += ', customers(first_name, last_name, phone)'
    }
    if (options.include?.includes('items')) {
      query += ', prescription_items(id, quantity_prescribed, quantity_dispensed, medicines(name, strength, form))'
    }

    return query
  }

  // Optimize sales queries
  static optimizeSalesQuery(options: QueryOptions = {}) {
    const baseSelect = [
      'id',
      'total_amount',
      'sale_date',
      'payment_method',
      'created_at'
    ]

    const select = options.select || baseSelect
    let query = select.join(', ')

    if (options.include?.includes('customers')) {
      query += ', customers(first_name, last_name, phone)'
    }
    if (options.include?.includes('items')) {
      query += ', sale_items(id, quantity, unit_price, total_price, medicines(name, strength, form))'
    }

    return query
  }

  // Pagination helper
  static getPaginationQuery(options: PaginationOptions) {
    const { page, pageSize } = options
    const offset = (page - 1) * pageSize
    
    return {
      limit: pageSize,
      offset,
      total: options.total
    }
  }

  // Date range optimization
  static optimizeDateRangeQuery(startDate: Date, endDate: Date, field: string = 'created_at') {
    return {
      [field]: {
        gte: startDate.toISOString(),
        lte: endDate.toISOString()
      }
    }
  }

  // Search optimization with proper indexing hints
  static optimizeSearchQuery(searchTerm: string, fields: string[]) {
    if (!searchTerm || searchTerm.length < 2) {
      return null
    }

    // Use ILIKE for case-insensitive search with proper wildcards
    const searchPattern = `%${searchTerm}%`
    const searchConditions = fields.map(field => `${field}.ilike.${searchPattern}`)
    
    return searchConditions.join(',')
  }

  // Batch query optimization
  static optimizeBatchQueries(queries: Array<{ table: string; select: string; filters?: any }>) {
    return queries.map(query => ({
      ...query,
      select: this.optimizeSelectFields(query.select),
      // Add common optimizations
      limit: query.filters?.limit || 100,
      orderBy: query.filters?.orderBy || 'created_at',
      orderDirection: query.filters?.orderDirection || 'desc'
    }))
  }

  // Optimize select fields to reduce data transfer
  private static optimizeSelectFields(select: string) {
    // Always include essential fields
    const essentialFields = ['id', 'created_at']
    const fields = select.split(',').map(f => f.trim())
    
    // Ensure essential fields are included
    essentialFields.forEach(field => {
      if (!fields.includes(field)) {
        fields.unshift(field)
      }
    })

    return fields.join(', ')
  }

  // Cache key generation for query caching
  static generateCacheKey(table: string, query: any): string {
    const queryString = JSON.stringify(query)
    return `${table}:${Buffer.from(queryString).toString('base64')}`
  }

  // Query performance monitoring
  static async measureQueryPerformance<T>(
    queryFn: () => Promise<T>,
    label: string
  ): Promise<T> {
    const startTime = performance.now()
    
    try {
      const result = await queryFn()
      const endTime = performance.now()
      const duration = endTime - startTime
      
      // Log slow queries
      if (duration > 1000) {
        console.warn(`Slow query detected: ${label} took ${duration.toFixed(2)}ms`)
      }
      
      return result
    } catch (error) {
      const endTime = performance.now()
      const duration = endTime - startTime
      console.error(`Query failed: ${label} failed after ${duration.toFixed(2)}ms`, error)
      throw error
    }
  }
}

// Predefined query templates for common operations
export const QUERY_TEMPLATES = {
  DASHBOARD_STATS: {
    medicines: 'id, stock_quantity, minimum_stock, expiry_date, unit_price',
    customers: 'id, created_at',
    prescriptions: 'id, status, created_at',
    sales: 'id, total_amount, sale_date'
  },
  
  INVENTORY_OVERVIEW: {
    medicines: 'id, name, stock_quantity, minimum_stock, expiry_date, unit_price, categories(name)',
    lowStock: 'id, name, stock_quantity, minimum_stock, unit_price',
    expiring: 'id, name, expiry_date, stock_quantity'
  },
  
  CUSTOMER_LIST: {
    basic: 'id, first_name, last_name, email, phone, created_at',
    withHistory: 'id, first_name, last_name, email, phone, created_at, prescriptions(id), sales(id, total_amount)'
  },
  
  PRESCRIPTION_LIST: {
    basic: 'id, prescription_number, status, issue_date, created_at',
    withDetails: 'id, prescription_number, status, issue_date, created_at, customers(first_name, last_name), prescription_items(id, quantity_prescribed, medicines(name))'
  }
} as const

// Export the class and templates
export default QueryOptimizer
