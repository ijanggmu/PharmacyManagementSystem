import { NextRequest, NextResponse } from "next/server"
import { createClient } from "@/lib/supabase/server"
import { requireAuth } from "@/lib/api/auth-middleware"
import { successResponse, Errors } from "@/lib/api/response-utils"
import { logRequest } from "@/lib/api/logger"
import { rateLimit } from "../../middleware"
import { getSalesStatsForTenant } from "@/lib/server/services/sales-service"

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

  if (!authResult.user.tenantId) {
    return Errors.FORBIDDEN("Tenant context required")
  }

  try {
    const supabase = await createClient()
    const { data, error } = await getSalesStatsForTenant(supabase, authResult.user.tenantId)

    if (error || !data) {
      logRequest(request, {
        status: 500,
        duration: Date.now() - startTime,
        userId: authResult.user.id,
        error: error?.message,
      })
      return Errors.INTERNAL_ERROR(error?.message || "Failed to load stats")
    }

    logRequest(request, {
      status: 200,
      duration: Date.now() - startTime,
      userId: authResult.user.id,
    })

    return successResponse([data])
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
