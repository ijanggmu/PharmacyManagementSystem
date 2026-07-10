/**
 * Customers API Route
 * REST API endpoints for customer management
 */

import { NextRequest, NextResponse } from "next/server"
import { createClient } from "@/lib/supabase/server"
import { customerSchema } from "@/lib/utils/validation"
import { z } from "zod"
import { requirePermission, requireCSRF } from "@/lib/api/auth-middleware"
import { successResponse, errorResponse, Errors } from "@/lib/api/response-utils"
import { logRequest } from "@/lib/api/logger"
import { rateLimit } from "../middleware"
import { parseListCustomersInput, listCustomersForTenant, createCustomer } from "@/lib/server/services/customer-service"

// GET /api/customers - List customers with filters
export async function GET(request: NextRequest) {
  const startTime = Date.now()

  // Rate limiting
  const rateLimitResult = rateLimit(request)
  if (rateLimitResult) {
    logRequest(request, { status: 429, duration: Date.now() - startTime })
    return rateLimitResult
  }

  // Authentication
  const authResult = await requirePermission(request, "customers:read")
  if (authResult instanceof NextResponse) {
    logRequest(request, { status: 401, duration: Date.now() - startTime })
    return authResult
  }
  if (!authResult.user.tenantId) {
    return Errors.FORBIDDEN("Tenant context required")
  }

  try {
    const supabase = await createClient()
    const { searchParams } = new URL(request.url)
    const input = parseListCustomersInput(searchParams)

    const { data, count, error } = await listCustomersForTenant(supabase, authResult.user.tenantId, input)
    if (error) {
      logRequest(request, {
        status: 500,
        duration: Date.now() - startTime,
        userId: authResult.user.id,
        error: error.message,
      })
      return Errors.INTERNAL_ERROR(error.message)
    }

    const response = successResponse(data || [], {
      meta: {
        page: input.page,
        limit: input.limit,
        total: count || 0,
        totalPages: Math.ceil((count || 0) / input.limit),
      },
    })

    logRequest(request, {
      status: 200,
      duration: Date.now() - startTime,
      userId: authResult.user.id,
    })

    return response
  } catch (error) {
    logRequest(request, {
      status: 500,
      duration: Date.now() - startTime,
      userId: authResult.user.id,
      error: error instanceof Error ? error.message : "Unknown error"
    })
    return Errors.INTERNAL_ERROR(
      error instanceof Error ? error.message : "Internal server error"
    )
  }
}

// POST /api/customers - Create new customer
export async function POST(request: NextRequest) {
  const startTime = Date.now()

  // Rate limiting
  const rateLimitResult = rateLimit(request)
  if (rateLimitResult) {
    logRequest(request, { status: 429, duration: Date.now() - startTime })
    return rateLimitResult
  }

  // Authentication
  const authResult = await requirePermission(request, "customers:write")
  if (authResult instanceof NextResponse) {
    logRequest(request, { status: 401, duration: Date.now() - startTime })
    return authResult
  }
  if (!authResult.user.tenantId) {
    return Errors.FORBIDDEN("Tenant context required")
  }

  // CSRF validation
  const csrfResult = await requireCSRF(request)
  if (csrfResult) {
    logRequest(request, { status: 403, duration: Date.now() - startTime, userId: authResult.user.id })
    return csrfResult
  }

  try {
    const supabase = await createClient()
    const body = await request.json()

    const validatedData = customerSchema.parse(body)

    const { data, error } = await createCustomer(supabase, authResult.user.tenantId, validatedData)

    if (error) {
      logRequest(request, {
        status: 400,
        duration: Date.now() - startTime,
        userId: authResult.user.id,
        error: error.message
      })
      return errorResponse("CREATE_FAILED", error.message, { status: 400 })
    }

    const response = successResponse(data, {
      message: "Customer created successfully",
      status: 201
    })

    logRequest(request, {
      status: 201,
      duration: Date.now() - startTime,
      userId: authResult.user.id
    })

    return response
  } catch (error) {
    if (error instanceof z.ZodError) {
      logRequest(request, {
        status: 400,
        duration: Date.now() - startTime,
        userId: authResult.user.id,
        error: "Validation error"
      })
      return Errors.VALIDATION_ERROR(error.errors)
    }

    logRequest(request, {
      status: 500,
      duration: Date.now() - startTime,
      userId: authResult.user.id,
      error: error instanceof Error ? error.message : "Unknown error"
    })

    return Errors.INTERNAL_ERROR(
      error instanceof Error ? error.message : "Internal server error"
    )
  }
}
