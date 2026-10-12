/**
 * API Client Helpers
 * Typed helper functions for making API requests, backed by a centralized axios
 * instance (lib/api/http-client.ts). Use these instead of calling axios directly
 * from lib/api/{domain}.ts.
 */

import type { AxiosRequestConfig } from "axios"
import { httpClient, normalizeNetworkError } from "@/lib/api/http-client"
import { userFacingErrorMessage } from "@/lib/utils/validation-messages"
import { DotnetApiError } from "@/lib/api/dotnet-client"

export interface ApiResponse<T> {
  success: boolean
  data?: T
  error?:
    | {
        code: string
        message: string
        details?: unknown
      }
    | string
  message?: string
  meta?: {
    page?: number
    limit?: number
    total?: number
    totalPages?: number
  }
  timestamp: string
}

export class ApiRequestError extends Error {
  code: string
  status: number
  details?: unknown

  constructor(message: string, code: string, status: number, details?: unknown) {
    super(message)
    this.name = "ApiRequestError"
    this.code = code
    this.status = status
    this.details = details
  }
}

/**
 * Normalizes a decoded error envelope into `{ code, message, details }`.
 * Most routes use the standard `errorResponse` shape (`error` is an object),
 * but some auth-middleware helpers (`requireAuth`/`requirePermission`/`requireCSRF`)
 * still return the legacy ad-hoc shape `{ error: "Forbidden", message: "..." }`
 * where `error` is a bare string — without this fallback, `error.message` is
 * `undefined` and the real reason (e.g. "Insufficient permissions") is lost.
 */
function extractError(result: Partial<ApiResponse<unknown>> | undefined | null): {
  code: string
  message: string
  details?: unknown
} {
  if (result?.error && typeof result.error === "object") {
    return result.error
  }
  if (typeof result?.error === "string") {
    return { code: result.error, message: result.message || result.error }
  }
  return { code: "UNKNOWN_ERROR", message: "An unknown error occurred" }
}

/**
 * Generic API request handler — routes every call through the shared axios
 * instance and normalizes both server-reported errors (`{ success: false }`)
 * and transport-level failures (network/timeout, no response reached) into
 * the same ApiRequestError shape.
 */
async function apiRequest<T>(
  url: string,
  config?: AxiosRequestConfig
): Promise<T> {
  let response
  try {
    response = await httpClient.request<ApiResponse<T>>({ url, ...config })
  } catch (err) {
    const normalized = normalizeNetworkError(err)
    throw new ApiRequestError(normalized.message, normalized.code, normalized.status, normalized.details)
  }

  const result = response.data

  if (!result || !result.success) {
    const error = extractError(result)
    throw new ApiRequestError(
      userFacingErrorMessage(error.message, error.code, error.details),
      error.code,
      response.status,
      error.details
    )
  }

  return result.data as T
}

/**
 * Turns an ApiRequestError into a user-facing message. For validation errors,
 * the server's generic "Validation failed" message is replaced with the
 * specific field issues (from Zod) so users know exactly what to fix.
 */
export function apiRequestErrorMessage(error: unknown): string {
  if (error instanceof DotnetApiError) {
    const { message, code, details } = error.normalized
    return userFacingErrorMessage(message, code, details)
  }
  if (!(error instanceof ApiRequestError)) {
    return error instanceof Error ? error.message : "An unknown error occurred"
  }

  return userFacingErrorMessage(error.message, error.code, error.details)
}

/**
 * GET request helper
 */
export async function apiGet<T>(
  url: string,
  params?: Record<string, string | number | boolean>
): Promise<T> {
  return apiRequest<T>(url, { method: "GET", params })
}

export type ApiListMeta = NonNullable<ApiResponse<unknown>["meta"]>

/** GET where the envelope includes `meta` (pagination). Caller supplies full path + query string. */
export async function apiGetWithMeta<T>(pathWithQuery: string): Promise<{ data: T; meta?: ApiListMeta }> {
  let response
  try {
    response = await httpClient.request<ApiResponse<T>>({ url: pathWithQuery, method: "GET" })
  } catch (err) {
    const normalized = normalizeNetworkError(err)
    throw new ApiRequestError(normalized.message, normalized.code, normalized.status, normalized.details)
  }

  const result = response.data

  if (!result || !result.success) {
    const error = extractError(result)
    throw new ApiRequestError(
      userFacingErrorMessage(error.message, error.code, error.details),
      error.code,
      response.status,
      error.details
    )
  }

  return { data: result.data as T, meta: result.meta }
}

/**
 * POST request helper
 */
export async function apiPost<T>(
  url: string,
  data: unknown,
  csrfToken?: string
): Promise<T> {
  return apiRequest<T>(url, {
    method: "POST",
    data,
    headers: csrfToken ? { "X-CSRF-Token": csrfToken } : undefined,
  })
}

/**
 * PUT request helper
 */
export async function apiPut<T>(
  url: string,
  data: unknown,
  csrfToken?: string
): Promise<T> {
  return apiRequest<T>(url, {
    method: "PUT",
    data,
    headers: csrfToken ? { "X-CSRF-Token": csrfToken } : undefined,
  })
}

/**
 * PATCH request helper
 */
export async function apiPatch<T>(
  url: string,
  data: unknown,
  csrfToken?: string
): Promise<T> {
  return apiRequest<T>(url, {
    method: "PATCH",
    data,
    headers: csrfToken ? { "X-CSRF-Token": csrfToken } : undefined,
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
    headers: csrfToken ? { "X-CSRF-Token": csrfToken } : undefined,
  })
}

/**
 * Get CSRF token from API
 */
export async function getCSRFToken(): Promise<string> {
  const response = await httpClient.get<{ token: string }>("/api/csrf/token")
  return response.data.token
}

