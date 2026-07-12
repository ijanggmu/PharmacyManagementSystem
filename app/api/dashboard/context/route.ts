import { NextRequest, NextResponse } from "next/server"
import { requireAuth } from "@/lib/api/auth-middleware"
import { successResponse, Errors } from "@/lib/api/response-utils"
import { getDashboardContextData } from "@/lib/server/services/dashboard-page-service"
import { rateLimit } from "../../middleware"

export async function GET(request: NextRequest) {
  const rateLimitResult = rateLimit(request)
  if (rateLimitResult) return rateLimitResult

  const authResult = await requireAuth(request)
  if (authResult instanceof NextResponse) return authResult

  try {
    const tenantId = authResult.user.tenantId
    if (!tenantId && authResult.user.role !== "superadmin") {
      return Errors.FORBIDDEN("Tenant context required")
    }

    const data = await getDashboardContextData(authResult.user, tenantId ?? null)

    return successResponse(data)
  } catch (e) {
    return Errors.INTERNAL_ERROR(e instanceof Error ? e.message : "Failed to load dashboard context")
  }
}
