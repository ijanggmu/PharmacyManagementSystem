import { NextRequest, NextResponse } from "next/server"
import { createClient } from "@/lib/supabase/server"
import { requireAuth, requirePermission, requireCSRF } from "@/lib/api/auth-middleware"
import { successResponse, Errors, errorResponse } from "@/lib/api/response-utils"
import { logRequest } from "@/lib/api/logger"
import { rateLimit } from "@/app/api/middleware"
import { voidVoucher } from "@/lib/server/services/accounting-service"
import { createAuditLog } from "@/lib/security/audit"

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
    const supabase = await createClient()
    const { error } = await voidVoucher(supabase, authResult.user.tenantId, id)
    if (error) {
      logRequest(request, { status: 400, duration: Date.now() - startTime, userId: authResult.user.id, error: error.message })
      return errorResponse("VOID_FAILED", error.message, { status: 400 })
    }
    await createAuditLog({
      tenant_id: authResult.user.tenantId,
      table_name: "accounting_vouchers",
      record_id: id,
      action: "UPDATE",
      new_data: { status: "void" },
    })
    logRequest(request, { status: 200, duration: Date.now() - startTime, userId: authResult.user.id })
    return successResponse({ id, status: "void" }, { message: "Voucher voided" })
  } catch (e) {
    logRequest(request, { status: 500, duration: Date.now() - startTime, userId: authResult.user.id, error: String(e) })
    return Errors.INTERNAL_ERROR(e instanceof Error ? e.message : "Failed to void voucher")
  }
}
