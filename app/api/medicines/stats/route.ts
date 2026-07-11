/**
 * Lightweight inventory summary for the dashboard stat cards. Replaces the
 * previous approach of fetching up to 5000 full medicine rows (with category/
 * supplier joins) client-side just to derive 4 numbers.
 */

import { NextRequest, NextResponse } from "next/server"
import { createClient } from "@/lib/supabase/server"
import { requirePermission } from "@/lib/api/auth-middleware"
import { successResponse, Errors } from "@/lib/api/response-utils"
import { logRequest } from "@/lib/api/logger"
import { rateLimit } from "../../middleware"
import { getMedicineInventoryStats } from "@/lib/server/services/medicine-service"

export async function GET(request: NextRequest) {
  const startTime = Date.now()
  const rateLimitResult = rateLimit(request)
  if (rateLimitResult) return rateLimitResult

  const authResult = await requirePermission(request, "inventory:read")
  if (authResult instanceof NextResponse) return authResult

  const tenantId = authResult.user.tenantId
  if (!tenantId) {
    return Errors.FORBIDDEN("Tenant context is required for medicines")
  }

  try {
    const supabase = await createClient()
    const { data, error } = await getMedicineInventoryStats(supabase, tenantId)

    if (error || !data) {
      logRequest(request, { status: 500, duration: Date.now() - startTime, userId: authResult.user.id, error: error?.message })
      return Errors.INTERNAL_ERROR(error?.message || "Failed to load inventory stats")
    }

    logRequest(request, { status: 200, duration: Date.now() - startTime, userId: authResult.user.id })
    return successResponse(data)
  } catch (e) {
    logRequest(request, { status: 500, duration: Date.now() - startTime, userId: authResult.user.id, error: String(e) })
    return Errors.INTERNAL_ERROR(e instanceof Error ? e.message : "Internal server error")
  }
}
