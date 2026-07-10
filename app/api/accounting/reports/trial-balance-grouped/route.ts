import { NextRequest, NextResponse } from "next/server"
import { createClient } from "@/lib/supabase/server"
import { requireAuth, requirePermission } from "@/lib/api/auth-middleware"
import { successResponse, Errors, errorResponse } from "@/lib/api/response-utils"
import { logRequest } from "@/lib/api/logger"
import { rateLimit } from "@/app/api/middleware"
import { parseAccountingBranchScope, trialBalanceGroupedReport } from "@/lib/server/services/accounting-service"

export async function GET(request: NextRequest) {
  const startTime = Date.now()
  const rateLimitResult = rateLimit(request)
  if (rateLimitResult) return rateLimitResult

  const authResult = await requireAuth(request)
  if (authResult instanceof NextResponse) return authResult

  const perm = await requirePermission(request, "accounting:read")
  if (perm instanceof NextResponse) return perm

  if (!authResult.user.tenantId) {
    return Errors.FORBIDDEN("Tenant context required")
  }

  const { searchParams } = new URL(request.url)
  const dateFrom = searchParams.get("from")
  const dateTo = searchParams.get("to")

  if (!dateFrom || !dateTo) {
    return errorResponse("VALIDATION", "from and to query params are required", { status: 400 })
  }

  try {
    const supabase = await createClient()
    const scope = parseAccountingBranchScope(searchParams)
    const { data, flat, debits_equal_credits, error } = await trialBalanceGroupedReport(
      supabase,
      authResult.user.tenantId,
      dateFrom,
      dateTo,
      scope
    )
    if (error) {
      logRequest(request, { status: 500, duration: Date.now() - startTime, userId: authResult.user.id, error: error.message })
      return Errors.INTERNAL_ERROR(error.message)
    }
    logRequest(request, { status: 200, duration: Date.now() - startTime, userId: authResult.user.id })
    return successResponse({ rows: data, flat_rows: flat, debits_equal_credits })
  } catch (e) {
    logRequest(request, { status: 500, duration: Date.now() - startTime, userId: authResult.user.id, error: String(e) })
    return Errors.INTERNAL_ERROR(e instanceof Error ? e.message : "Failed to build grouped trial balance")
  }
}
