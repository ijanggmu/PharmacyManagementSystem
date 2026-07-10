/**
 * Medicines API Route
 * REST API endpoints for medicine/inventory management
 */

import { NextRequest, NextResponse } from "next/server"
import { createClient } from "@/lib/supabase/server"
import { medicineSchema } from "@/lib/utils/validation"
import { z } from "zod"
import { requirePermission, requireCSRF } from "@/lib/api/auth-middleware"
import { successResponse, errorResponse, Errors } from "@/lib/api/response-utils"
import { logRequest } from "@/lib/api/logger"
import { rateLimit } from "../middleware"
import {
  parseListMedicinesInput,
  listMedicinesForTenant,
  createMedicineWithInventory,
} from "@/lib/server/services/medicine-service"

// GET /api/medicines - List medicines with filters
export async function GET(request: NextRequest) {
  const startTime = Date.now()

  // Rate limiting
  const rateLimitResult = rateLimit(request)
  if (rateLimitResult) {
    logRequest(request, { status: 429, duration: Date.now() - startTime })
    return rateLimitResult
  }

  // Authentication
  const authResult = await requirePermission(request, "inventory:read")
  if (authResult instanceof NextResponse) {
    logRequest(request, { status: 401, duration: Date.now() - startTime })
    return authResult
  }

  try {
    const supabase = await createClient()
    const tenantId = authResult.user.tenantId
    if (!tenantId) {
      logRequest(request, {
        status: 403,
        duration: Date.now() - startTime,
        userId: authResult.user.id,
        error: "Tenant context is required for medicines",
      })
      return Errors.FORBIDDEN("Tenant context is required for medicines")
    }

    const { searchParams } = new URL(request.url)
    const input = parseListMedicinesInput(searchParams)

    const { data: actor } = await supabase
      .from("users")
      .select("current_branch_id")
      .eq("id", authResult.user.id)
      .maybeSingle()
    const branchId = (actor as { current_branch_id: string | null } | null)?.current_branch_id ?? null

    const { data, count, error } = await listMedicinesForTenant(supabase, tenantId, input, branchId)
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

// POST /api/medicines - Create new medicine
export async function POST(request: NextRequest) {
  const startTime = Date.now()

  // Rate limiting
  const rateLimitResult = rateLimit(request)
  if (rateLimitResult) {
    logRequest(request, { status: 429, duration: Date.now() - startTime })
    return rateLimitResult
  }

  // Authentication
  const authResult = await requirePermission(request, "inventory:write")
  if (authResult instanceof NextResponse) {
    logRequest(request, { status: 401, duration: Date.now() - startTime })
    return authResult
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

    // Validate request body
    const validatedData = medicineSchema.parse(body)

    const tenantId = authResult.user.tenantId
    if (!tenantId) {
      logRequest(request, {
        status: 403,
        duration: Date.now() - startTime,
        userId: authResult.user.id,
        error: "Tenant context is required for medicines",
      })
      return Errors.FORBIDDEN("Tenant context is required for medicines")
    }

    const { data, error } = await createMedicineWithInventory(
      supabase,
      tenantId,
      authResult.user.id,
      validatedData
    )

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
      message: "Medicine created successfully",
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
      const fieldErrors = error.errors.map((issue) => ({
        field: issue.path.join("."),
        message: issue.message,
        code: issue.code,
      }))
      logRequest(request, {
        status: 400,
        duration: Date.now() - startTime,
        userId: authResult.user.id,
        error: `Validation error: ${fieldErrors.map((f) => `${f.field || "(root)"} - ${f.message}`).join("; ")}`,
        errorDetails: fieldErrors,
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
