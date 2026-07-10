import { NextRequest, NextResponse } from "next/server"
import { createClient } from "@/lib/supabase/server"
import { requireAuth } from "@/lib/api/auth-middleware"
import { successResponse, Errors } from "@/lib/api/response-utils"
import { logRequest } from "@/lib/api/logger"
import { rateLimit } from "../../middleware"
import { getPrescriptionStatsForTenant } from "@/lib/server/services/prescriptions-service"

export async function GET(request: NextRequest) {
  const startTime = Date.now()
  const rateLimitResult = rateLimit(request)
  if (rateLimitResult) return rateLimitResult

  const authResult = await requireAuth(request)
  if (authResult instanceof NextResponse) return authResult
  if (!authResult.user.tenantId) return Errors.FORBIDDEN("Tenant context required")

  try {
    const supabase = await createClient()
    const { data, error } = await getPrescriptionStatsForTenant(supabase, authResult.user.tenantId)
    if (error || !data) return Errors.INTERNAL_ERROR(error?.message || "Failed to load stats")
    logRequest(request, { status: 200, duration: Date.now() - startTime, userId: authResult.user.id })
    return successResponse([data])
  } catch (e) {
    logRequest(request, { status: 500, duration: Date.now() - startTime, userId: authResult.user.id, error: String(e) })
    return Errors.INTERNAL_ERROR(e instanceof Error ? e.message : "Internal server error")
  }
}

