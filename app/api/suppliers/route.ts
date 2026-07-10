/**
 * Suppliers API Route
 */

import { NextRequest, NextResponse } from "next/server"
import { createClient } from "@/lib/supabase/server"
import { supplierSchema } from "@/lib/utils/validation"
import { z } from "zod"
import { requireAuth, requireCSRF } from "@/lib/api/auth-middleware"
import { successResponse, errorResponse, Errors } from "@/lib/api/response-utils"
import { logRequest } from "@/lib/api/logger"
import { rateLimit } from "../middleware"
import {
  listSuppliersForTenant,
  enrichSuppliersWithFinancials,
  createSupplierForTenant,
} from "@/lib/server/services/supplier-service"

export async function GET(request: NextRequest) {
  const startTime = Date.now()

  // Rate limiting
  const rateLimitResult = rateLimit(request)
  if (rateLimitResult) {
    logRequest(request, { status: 429, duration: Date.now() - startTime })
    return rateLimitResult
  }

  // Authentication
  const authResult = await requireAuth(request)
  if (authResult instanceof NextResponse) {
    logRequest(request, { status: 401, duration: Date.now() - startTime })
    return authResult
  }

  try {
    const supabase = await createClient()
    const { searchParams } = new URL(request.url)

    const search = searchParams.get("search")
    const page = parseInt(searchParams.get("page") || "1")
    const limit = parseInt(searchParams.get("limit") || "50")
    const sortBy = searchParams.get("sortBy") || "name"
    const sortOrder = searchParams.get("sortOrder") || "asc"
    const profile = searchParams.get("profile")

    const { data, count, error } = await listSuppliersForTenant(supabase, {
      search,
      page,
      limit,
      sortBy,
      sortOrder,
      profile,
    })

    if (error) {
      logRequest(request, {
        status: 500,
        duration: Date.now() - startTime,
        userId: authResult.user.id,
        error: error.message,
      })
      return Errors.INTERNAL_ERROR(error.message)
    }

    const includeFinancials = searchParams.get("includeFinancials") !== "false"
    let enrichedData: unknown[] = data

    if (includeFinancials && enrichedData.length > 0 && authResult.user.tenantId) {
      const { data: enriched, error: enrichError } = await enrichSuppliersWithFinancials(
        supabase,
        authResult.user.tenantId,
        enrichedData
      )
      if (enrichError) {
        logRequest(request, {
          status: 500,
          duration: Date.now() - startTime,
          userId: authResult.user.id,
          error: enrichError.message,
        })
        return Errors.INTERNAL_ERROR(enrichError.message)
      }
      enrichedData = enriched
    }

    const response = successResponse(enrichedData, {
      meta: {
        page,
        limit,
        total: count || 0,
        totalPages: Math.ceil((count || 0) / limit),
      },
    })

    logRequest(request, {
      status: 200,
      duration: Date.now() - startTime,
      userId: authResult.user.id
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

export async function POST(request: NextRequest) {
  const startTime = Date.now()

  // Rate limiting
  const rateLimitResult = rateLimit(request)
  if (rateLimitResult) {
    logRequest(request, { status: 429, duration: Date.now() - startTime })
    return rateLimitResult
  }

  // Authentication
  const authResult = await requireAuth(request)
  if (authResult instanceof NextResponse) {
    logRequest(request, { status: 401, duration: Date.now() - startTime })
    return authResult
  }

  // CSRF validation
  const csrfResult = await requireCSRF(request)
  if (csrfResult) {
    logRequest(request, { status: 403, duration: Date.now() - startTime })
    return csrfResult
  }

  try {
    const supabase = await createClient()
    const body = await request.json()

    const validatedData = supplierSchema.parse(body)
    if (!authResult.user.tenantId) {
      return Errors.FORBIDDEN("Tenant context is required for suppliers")
    }

    const tenantId = authResult.user.tenantId
    const { data, error, code } = await createSupplierForTenant(supabase, tenantId, validatedData)

    if (error || !data) {
      logRequest(request, {
        status: 400,
        duration: Date.now() - startTime,
        userId: authResult.user.id,
        error: error?.message,
      })
      return errorResponse(code || "CREATE_FAILED", error?.message || "Failed to create supplier", {
        status: 400,
      })
    }

    const response = successResponse(data, {
      message: "Supplier created successfully",
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
