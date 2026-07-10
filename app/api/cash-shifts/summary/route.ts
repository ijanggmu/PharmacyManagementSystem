import { NextRequest, NextResponse } from "next/server"
import { createClient } from "@/lib/supabase/server"
import { requireAuth, requirePermission } from "@/lib/api/auth-middleware"
import { successResponse, Errors, errorResponse } from "@/lib/api/response-utils"
import { logRequest } from "@/lib/api/logger"
import { rateLimit } from "@/app/api/middleware"
import { branchCashSummary, cashShiftTableUnavailableMessage } from "@/lib/server/services/cash-shift-service"

/** Expected cash in drawer per branch (open shifts only). Managers / reporting. */
export async function GET(request: NextRequest) {
  const startTime = Date.now()
  const rateLimitResult = rateLimit(request)
  if (rateLimitResult) return rateLimitResult

  const authResult = await requireAuth(request)
  if (authResult instanceof NextResponse) return authResult

  const perm = await requirePermission(request, "reports:read")
  if (perm instanceof NextResponse) return perm

  const tenantId = perm.user.tenantId
  if (!tenantId) return Errors.FORBIDDEN("Tenant context is required")

  try {
    const supabase = await createClient()
    const rows = await branchCashSummary(supabase, tenantId)

    logRequest(request, { status: 200, duration: Date.now() - startTime, userId: perm.user.id })
    return successResponse(rows)
  } catch (e) {
    const hint = cashShiftTableUnavailableMessage(e)
    const status = hint ? 503 : 500
    logRequest(request, {
      status,
      duration: Date.now() - startTime,
      userId: perm.user.id,
      error: e instanceof Error ? e.message : String(e),
    })
    if (hint) {
      return errorResponse("CASH_SHIFTS_UNAVAILABLE", hint, { status: 503 })
    }
    return Errors.INTERNAL_ERROR(e instanceof Error ? e.message : "Failed to load summary")
  }
}
