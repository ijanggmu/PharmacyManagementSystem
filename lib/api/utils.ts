import { createClient } from "@/lib/supabase/client"

// Common API response types
export interface ApiResponse<T> {
  data: T
  error: string | null
}

export interface ApiListResponse<T> {
  data: T[]
  error: string | null
}

// Common filter interface
export interface BaseFilters {
  search?: string
  page?: number
  limit?: number
  sortBy?: string
  sortOrder?: 'asc' | 'desc'
}

// Common API error handling
export class ApiError extends Error {
  constructor(
    message: string,
    public statusCode?: number,
    public code?: string
  ) {
    super(message)
    this.name = 'ApiError'
  }
}

// Common timeout wrapper for database operations
export async function withTimeout<T>(
  promise: Promise<T>,
  timeoutMs: number = 5000,
  errorMessage: string = 'Operation timed out'
): Promise<T> {
  const timeoutPromise = new Promise<never>((_, reject) =>
    setTimeout(() => reject(new ApiError(errorMessage, 408)), timeoutMs)
  )

  try {
    return await Promise.race([promise, timeoutPromise])
  } catch (error) {
    if (error instanceof ApiError) {
      throw error
    }
    throw new ApiError(
      error instanceof Error ? error.message : 'Unknown error occurred'
    )
  }
}

// Common database constraint checking
export async function checkRelatedRecords(
  tableName: string,
  foreignKey: string,
  recordId: string,
  timeoutMs: number = 5000
): Promise<void> {
  const supabase = createClient()
  
  const checkPromise = supabase
    .from(tableName)
    .select('id')
    .eq(foreignKey, recordId)
    .limit(1)

  const result = await withTimeout(checkPromise, timeoutMs, 'Database query timeout')
  
  if (result.error) {
    throw new ApiError(result.error.message)
  }

  if (result.data && result.data.length > 0) {
    throw new ApiError(
      `Cannot delete record with related ${tableName}. Consider archiving instead.`
    )
  }
}

// Common search filter builder
export function buildSearchFilter(
  query: any,
  searchTerm: string,
  searchFields: string[]
): any {
  if (!searchTerm || searchFields.length === 0) {
    return query
  }

  const searchConditions = searchFields.map(field => 
    `${field}.ilike.%${searchTerm}%`
  ).join(',')

  return query.or(searchConditions)
}

// Common pagination helper
export function applyPagination(
  query: any,
  page: number = 1,
  limit: number = 10
): any {
  const offset = (page - 1) * limit
  return query.range(offset, offset + limit - 1)
}

// Common sorting helper
export function applySorting(
  query: any,
  sortBy?: string,
  sortOrder: 'asc' | 'desc' = 'desc'
): any {
  if (!sortBy) {
    return query
  }
  return query.order(sortBy, { ascending: sortOrder === 'asc' })
}

// Common API wrapper for consistent error handling
export async function apiWrapper<T>(
  operation: () => Promise<T>,
  errorMessage: string = 'Operation failed'
): Promise<ApiResponse<T>> {
  try {
    const data = await operation()
    return { data, error: null }
  } catch (error) {
    const message = error instanceof ApiError 
      ? error.message 
      : error instanceof Error 
        ? error.message 
        : errorMessage
    
    return { 
      data: null as T, 
      error: message 
    }
  }
}

// Common list API wrapper
export async function listApiWrapper<T>(
  operation: () => Promise<T[]>,
  errorMessage: string = 'Failed to fetch data'
): Promise<ApiListResponse<T>> {
  try {
    const data = await operation()
    return { data, error: null }
  } catch (error) {
    const message = error instanceof ApiError 
      ? error.message 
      : error instanceof Error 
        ? error.message 
        : errorMessage
    
    return { 
      data: [], 
      error: message 
    }
  }
}

