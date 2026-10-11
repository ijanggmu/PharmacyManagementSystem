// Common API response types
export interface ApiResponse<T> {
  data: T
  error: string | null
}

export interface ApiListResponse<T> {
  data: T[]
  total?: number
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
