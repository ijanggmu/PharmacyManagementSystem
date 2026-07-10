import { NextRequest, NextResponse } from "next/server"
import { createClient } from "@/lib/supabase/server"
import { requireAuth, requireCSRF, requirePermission } from "@/lib/api/auth-middleware"
import { successResponse, Errors, errorResponse } from "@/lib/api/response-utils"
import { logRequest } from "@/lib/api/logger"
import { rateLimit } from "@/app/api/middleware"
import { reversePostedVoucher } from "@/lib/server/services/accounting-service"

export async function POST(
  request: NextRequest,
  context: { params: Promise<{ id: string }> }
) {
  const startTime = Date.now()
  const rateLimitResult = rateLimit(request)
  if (rateLimitResult) return rateLimitResult

  const authResult = await requireAuth(request)
  if (authResult instanceof NextResponse) return authResult

  const perm = await requirePermission(request, "accounting:write")
  if (perm instanceof NextResponse) return perm

  const csrf = await requireCSRF(request)
  if (csrf) return csrf

  if (!authResult.user.tenantId) {
    return Errors.FORBIDDEN("Tenant context required")
  }

  const { id } = await context.params

  try {
    const body = await request.json().catch(() => ({}))
    const reversalDate = body?.reversal_date ? String(body.reversal_date) : null
    const supabase = await createClient()
    const { data, error } = await reversePostedVoucher(
      supabase,
      authResult.user.tenantId,
      authResult.user.id,
      id,
      reversalDate
    )
    if (error) {
      logRequest(request, {
        status: 400,
        duration: Date.now() - startTime,
        userId: authResult.user.id,
        error: error.message,
      })
      return errorResponse("REVERSE_FAILED", error.message, { status: 400 })
    }
    logRequest(request, { status: 200, duration: Date.now() - startTime, userId: authResult.user.id })
    return successResponse(data, { message: "Voucher reversed" })
  } catch (e) {
    logRequest(request, { status: 500, duration: Date.now() - startTime, userId: authResult.user.id, error: String(e) })
    return Errors.INTERNAL_ERROR(e instanceof Error ? e.message : "Failed to reverse voucher")
  }
}
