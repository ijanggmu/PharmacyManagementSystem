/**
 * API Client Helpers
 * Provides typed helper functions for making API requests
 * Use these instead of direct Supabase calls in components
 */

export interface ApiResponse<T> {
  success: boolean
  data?: T
  error?: {
    code: string
    message: string
    details?: any
  }
  message?: string
  meta?: {
    page?: number
    limit?: number
    total?: number
    totalPages?: number
  }
  timestamp: string
}

/**
 * Generic API request handler
 */
async function apiRequest<T>(
  url: string,
  options?: RequestInit
): Promise<T> {
  const response = await fetch(url, {
    ...options,
    headers: {
      "Content-Type": "application/json",
      ...options?.headers,
    },
  })

  const result: ApiResponse<T> = await response.json()

  if (!result.success || !response.ok) {
    const error = result.error || {
      code: "UNKNOWN_ERROR",
      message: "An unknown error occurred",
    }
    throw new Error(error.message)
  }

  return result.data as T
}

/**
 * GET request helper
 */
export async function apiGet<T>(
  url: string,
  params?: Record<string, string | number | boolean>
): Promise<T> {
  const queryString = params
    ? "?" +
      Object.entries(params)
        .map(([key, value]) => `${encodeURIComponent(key)}=${encodeURIComponent(String(value))}`)
        .join("&")
    : ""

  return apiRequest<T>(`${url}${queryString}`, {
    method: "GET",
  })
}

/**
 * POST request helper
 */
export async function apiPost<T>(
  url: string,
  data: any,
  csrfToken?: string
): Promise<T> {
  return apiRequest<T>(url, {
    method: "POST",
    body: JSON.stringify(data),
    headers: csrfToken
      ? {
          "X-CSRF-Token": csrfToken,
        }
      : undefined,
  })
}

/**
 * PUT request helper
 */
export async function apiPut<T>(
  url: string,
  data: any,
  csrfToken?: string
): Promise<T> {
  return apiRequest<T>(url, {
    method: "PUT",
    body: JSON.stringify(data),
    headers: csrfToken
      ? {
          "X-CSRF-Token": csrfToken,
        }
      : undefined,
  })
}

/**
 * PATCH request helper
 */
export async function apiPatch<T>(
  url: string,
  data: any,
  csrfToken?: string
): Promise<T> {
  return apiRequest<T>(url, {
    method: "PATCH",
    body: JSON.stringify(data),
    headers: csrfToken
      ? {
          "X-CSRF-Token": csrfToken,
        }
      : undefined,
  })
}

/**
 * DELETE request helper
 */
export async function apiDelete<T = void>(
  url: string,
  csrfToken?: string
): Promise<T> {
  return apiRequest<T>(url, {
    method: "DELETE",
    headers: csrfToken
      ? {
          "X-CSRF-Token": csrfToken,
        }
      : undefined,
  })
}

/**
 * Get CSRF token from API
 */
export async function getCSRFToken(): Promise<string> {
  const response = await fetch("/api/csrf/token")
  const result = await response.json()
  return result.token
}

