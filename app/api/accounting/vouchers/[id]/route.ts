import { NextRequest, NextResponse } from "next/server"
import { createClient } from "@/lib/supabase/server"
import { requireAuth, requirePermission } from "@/lib/api/auth-middleware"
import { successResponse, Errors, errorResponse } from "@/lib/api/response-utils"
import { logRequest } from "@/lib/api/logger"
import { rateLimit } from "@/app/api/middleware"
import { getVoucherWithLines } from "@/lib/server/services/accounting-service"

export async function GET(
  request: NextRequest,
  context: { params: Promise<{ id: string }> }
) {
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

  const { id } = await context.params

  try {
    const supabase = await createClient()
    const { data, error } = await getVoucherWithLines(supabase, authResult.user.tenantId, id)
    if (error || !data) {
      logRequest(request, { status: 404, duration: Date.now() - startTime, userId: authResult.user.id })
      return errorResponse("NOT_FOUND", error?.message || "Not found", { status: 404 })
    }
    logRequest(request, { status: 200, duration: Date.now() - startTime, userId: authResult.user.id })
    return successResponse(data)
  } catch (e) {
    logRequest(request, { status: 500, duration: Date.now() - startTime, userId: authResult.user.id, error: String(e) })
    return Errors.INTERNAL_ERROR(e instanceof Error ? e.message : "Failed to load voucher")
  }
}
