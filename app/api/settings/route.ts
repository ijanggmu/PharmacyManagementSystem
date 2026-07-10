/**
 * Settings API Route
 */

import { NextRequest, NextResponse } from "next/server"
import { z } from "zod"
import { createClient } from "@/lib/supabase/server"
import { requireAuth, requireCSRF, requirePermission } from "@/lib/api/auth-middleware"
import { successResponse, errorResponse, Errors } from "@/lib/api/response-utils"
import { logRequest } from "@/lib/api/logger"
import { rateLimit } from "../middleware"
import { upsertSettingSchema } from "@/lib/server/schemas/settings"
import { listSettingsForTenant, upsertSettingForTenant } from "@/lib/server/services/settings-service"

export async function GET(request: NextRequest) {
  const startTime = Date.now()

  const rateLimitResult = rateLimit(request)
  if (rateLimitResult) {
    logRequest(request, { status: 429, duration: Date.now() - startTime })
    return rateLimitResult
  }

  const authResult = await requireAuth(request)
  if (authResult instanceof NextResponse) {
    logRequest(request, { status: 401, duration: Date.now() - startTime })
    return authResult
  }

  try {
    const supabase = await createClient()
    const { searchParams } = new URL(request.url)
    const category = searchParams.get("category")

    const { data, error } = await listSettingsForTenant(supabase, authResult.user.tenantId, category)

    if (error) {
      logRequest(request, {
        status: 500,
        duration: Date.now() - startTime,
        userId: authResult.user.id,
        error: error.message
      })
      return Errors.INTERNAL_ERROR(error.message)
    }

    logRequest(request, {
      status: 200,
      duration: Date.now() - startTime,
      userId: authResult.user.id
    })

    return successResponse(data)
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

export async function PUT(request: NextRequest) {
  const startTime = Date.now()

  const rateLimitResult = rateLimit(request)
  if (rateLimitResult) {
    logRequest(request, { status: 429, duration: Date.now() - startTime })
    return rateLimitResult
  }

  // Require settings:write permission
  const permResult = await requirePermission(request, "settings:write")
  if (permResult instanceof NextResponse) {
    logRequest(request, { status: 403, duration: Date.now() - startTime })
    return permResult
  }

  const csrfResult = await requireCSRF(request)
  if (csrfResult) {
    logRequest(request, { status: 403, duration: Date.now() - startTime })
    return csrfResult
  }

  try {
    const supabase = await createClient()
    const body = await request.json()
    const payload = upsertSettingSchema.parse(body)

    const { data, error } = await upsertSettingForTenant(supabase, permResult.user.tenantId, payload)

    if (error) {
      logRequest(request, {
        status: 400,
        duration: Date.now() - startTime,
        userId: permResult.user.id,
        error: error.message
      })
      return errorResponse("UPDATE_FAILED", error.message, { status: 400 })
    }

    logRequest(request, {
      status: 200,
      duration: Date.now() - startTime,
      userId: permResult.user.id
    })

    return successResponse(data, { message: "Setting updated successfully" })
  } catch (error) {
    if (error instanceof z.ZodError) {
      logRequest(request, {
        status: 400,
        duration: Date.now() - startTime,
        error: "Validation error",
      })
      return Errors.VALIDATION_ERROR(error.errors)
    }
    logRequest(request, {
      status: 500,
      duration: Date.now() - startTime,
      error: error instanceof Error ? error.message : "Unknown error"
    })
    return Errors.INTERNAL_ERROR(
      error instanceof Error ? error.message : "Internal server error"
    )
  }
}
