/**
 * Standardized API Response Utilities
 * Ensures consistent response format across all API routes
 */

import { NextResponse } from "next/server"

export interface ApiSuccessResponse<T> {
  success: true
  data: T
  message?: string
  meta?: {
    page?: number
    limit?: number
    total?: number
    totalPages?: number
  }
  timestamp: string
}

export interface ApiErrorResponse {
  success: false
  error: {
    code: string
    message: string
    details?: any
  }
  timestamp: string
}

export type ApiResponse<T> = ApiSuccessResponse<T> | ApiErrorResponse

export function successResponse<T>(
  data: T,
  options?: {
    message?: string
    meta?: ApiSuccessResponse<T>["meta"]
    status?: number
  }
): NextResponse<ApiSuccessResponse<T>> {
  return NextResponse.json(
    {
      success: true as const,
      data,
      message: options?.message,
      meta: options?.meta,
      timestamp: new Date().toISOString(),
    },
    { status: options?.status || 200 }
  )
}

export function errorResponse(
  code: string,
  message: string,
  options?: {
    details?: any
    status?: number
  }
): NextResponse<ApiErrorResponse> {
  return NextResponse.json(
    {
      success: false as const,
      error: {
        code,
        message,
        details: options?.details,
      },
      timestamp: new Date().toISOString(),
    },
    { status: options?.status || 400 }
  )
}

// Common error responses
export const Errors = {
  UNAUTHORIZED: (message = "Authentication required") =>
    errorResponse("UNAUTHORIZED", message, { status: 401 }),
  
  FORBIDDEN: (message = "Insufficient permissions") =>
    errorResponse("FORBIDDEN", message, { status: 403 }),
  
  NOT_FOUND: (message = "Resource not found") =>
    errorResponse("NOT_FOUND", message, { status: 404 }),

  BAD_REQUEST: (message = "Bad request") =>
    errorResponse("BAD_REQUEST", message, { status: 400 }),
  
  VALIDATION_ERROR: (details: any) =>
    errorResponse("VALIDATION_ERROR", "Validation failed", { details, status: 400 }),
  
  RATE_LIMIT_EXCEEDED: (message = "Too many requests") =>
    errorResponse("RATE_LIMIT_EXCEEDED", message, { status: 429 }),
  
  DATABASE_ERROR: (message = "Database error") =>
    errorResponse("DATABASE_ERROR", message, { status: 500 }),

  INTERNAL_ERROR: (message = "Internal server error") =>
    errorResponse("INTERNAL_ERROR", message, { status: 500 }),
}

