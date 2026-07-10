/**
 * Sales API Route — delegates persistence to `lib/server/services/sales-service`.
 */

import { NextRequest, NextResponse } from "next/server"
import { createClient } from "@/lib/supabase/server"
import { saleSchema } from "@/lib/utils/validation"
import { z } from "zod"
import { requireAuth, requirePermission, requireCSRF } from "@/lib/api/auth-middleware"
import { successResponse, errorResponse, Errors } from "@/lib/api/response-utils"
import { logRequest } from "@/lib/api/logger"
import { rateLimit } from "../middleware"
import {
  parseListSalesInput,
  listSalesForTenant,
  createSaleWithRpc,
} from "@/lib/server/services/sales-service"

export async function GET(request: NextRequest) {
  const startTime = Date.now()

  const rateLimitResult = rateLimit(request)
  if (rateLimitResult) {
    logRequest(request, { status: 429, duration: Date.now() - startTime })
    return rateLimitResult
  }

  const authResult = await requirePermission(request, "sales:read")
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
    const listInput = parseListSalesInput(searchParams, authResult.user.tenantId)

    const { data, count, error } = await listSalesForTenant(supabase, listInput)

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
        page: listInput.page,
        limit: listInput.limit,
        total: count,
        totalPages: Math.ceil(count / listInput.limit),
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
      error: error instanceof Error ? error.message : "Unknown error",
    })
    return Errors.INTERNAL_ERROR(
      error instanceof Error ? error.message : "Internal server error"
    )
  }
}

export async function POST(request: NextRequest) {
  const startTime = Date.now()

  const rateLimitResult = rateLimit(request)
  if (rateLimitResult) {
    logRequest(request, { status: 429, duration: Date.now() - startTime })
    return rateLimitResult
  }

  const authResult = await requirePermission(request, "sales:write")
  if (authResult instanceof NextResponse) {
    logRequest(request, { status: 401, duration: Date.now() - startTime })
    return authResult
  }

  if (!authResult.user.tenantId) {
    return Errors.FORBIDDEN("Tenant context required")
  }

  const csrfResult = await requireCSRF(request)
  if (csrfResult) {
    logRequest(request, { status: 403, duration: Date.now() - startTime })
    return csrfResult
  }

  try {
    const supabase = await createClient()
    const body = await request.json()
    const validatedData = saleSchema.parse(body)

    const { data: completeSale, error: createError } = await createSaleWithRpc(
      supabase,
      authResult.user.id,
      authResult.user.tenantId,
      validatedData
    )

    if (createError) {
      logRequest(request, {
        status: 400,
        duration: Date.now() - startTime,
        userId: authResult.user.id,
        error: createError.message,
      })
      return errorResponse("CREATE_FAILED", createError.message, { status: 400 })
    }

    const response = successResponse(completeSale, {
      message: "Sale created successfully",
      status: 201,
    })

    logRequest(request, {
      status: 201,
      duration: Date.now() - startTime,
      userId: authResult.user.id,
    })

    return response
  } catch (error) {
    if (error instanceof z.ZodError) {
      logRequest(request, {
        status: 400,
        duration: Date.now() - startTime,
        userId: authResult.user.id,
        error: "Validation error",
      })
      return Errors.VALIDATION_ERROR(error.errors)
    }

    logRequest(request, {
      status: 500,
      duration: Date.now() - startTime,
      userId: authResult.user.id,
      error: error instanceof Error ? error.message : "Unknown error",
    })

    return Errors.INTERNAL_ERROR(
      error instanceof Error ? error.message : "Internal server error"
    )
  }
}
