import { NextRequest, NextResponse } from "next/server"
import { createClient } from "@/lib/supabase/server"
import { requirePermission } from "@/lib/api/auth-middleware"
import { successResponse, Errors } from "@/lib/api/response-utils"
import { rateLimit } from "../../middleware"
import { getDeadStockReport } from "@/lib/server/services/reports-service"

export async function GET(request: NextRequest) {
  const rateLimitResult = rateLimit(request)
  if (rateLimitResult) return rateLimitResult

  const authResult = await requirePermission(request, "inventory:read")
  if (authResult instanceof NextResponse) return authResult
  if (!authResult.user.tenantId) return Errors.FORBIDDEN("Tenant context required")

  try {
    const { searchParams } = new URL(request.url)
    const sinceDays = parseInt(searchParams.get("sinceDays") || "90")

    const supabase = await createClient()
    const { data, error } = await getDeadStockReport(supabase, authResult.user.tenantId, sinceDays)
    if (error) return Errors.INTERNAL_ERROR(error.message)
    return successResponse(data)
  } catch (e) {
    return Errors.INTERNAL_ERROR(e instanceof Error ? e.message : "Internal server error")
  }
}
