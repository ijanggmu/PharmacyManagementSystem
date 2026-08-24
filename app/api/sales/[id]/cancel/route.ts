/**
 * Cancel a sale (CONFIRMED -> CANCELLED). Restores stock, reverses the posted
 * sale voucher, and reverses prescription dispensing counts — all inside the
 * cancel_sale DB function (scripts/93-sale-cancellation.sql). Distinct from
 * DELETE on /api/sales/[id], which stays permanently disabled: cancellation is
 * an auditable state transition with a reason, not a removal.
 */

import { NextRequest, NextResponse } from "next/server"
import { z } from "zod"
import { createClient } from "@/lib/supabase/server"
import { requirePermission, requireCSRF } from "@/lib/api/auth-middleware"
import { successResponse, errorResponse, Errors } from "@/lib/api/response-utils"
import { logRequest } from "@/lib/api/logger"
import { rateLimit } from "../../../middleware"
import { cancelSaleForTenant } from "@/lib/server/services/sales-service"
import { createAuditLog } from "@/lib/security/audit"

const bodySchema = z.object({
  reason: z.string().trim().min(1, "A cancellation reason is required").max(500),
})

export async function POST(
  request: NextRequest,
  context: { params: Promise<{ id: string }> }
) {
  const startTime = Date.now()
  const { id } = await context.params

  const rateLimitResult = rateLimit(request)
  if (rateLimitResult) return rateLimitResult

  const authResult = await requirePermission(request, "sales:delete")
  if (authResult instanceof NextResponse) return authResult

  if (!authResult.user.tenantId) {
    return Errors.FORBIDDEN("Tenant context required")
  }

  const csrfResult = await requireCSRF(request)
  if (csrfResult) return csrfResult

  try {
    const body = await request.json()
    const { reason } = bodySchema.parse(body)

    const supabase = await createClient()
    const { error } = await cancelSaleForTenant(supabase, authResult.user.tenantId, authResult.user.id, id, reason)

    if (error) {
      logRequest(request, { status: 400, duration: Date.now() - startTime, userId: authResult.user.id, error: error.message })
      return errorResponse("CANCEL_FAILED", error.message, { status: 400 })
    }

    await createAuditLog({
      tenant_id: authResult.user.tenantId,
      table_name: "sales",
      record_id: id,
      action: "UPDATE",
      new_data: { status: "cancelled", cancellation_reason: reason },
    })

    logRequest(request, { status: 200, duration: Date.now() - startTime, userId: authResult.user.id })
    return successResponse({ id }, { message: "Sale cancelled — stock and accounting were reversed" })
  } catch (e) {
    if (e instanceof z.ZodError) return Errors.VALIDATION_ERROR(e.errors)
    logRequest(request, { status: 500, duration: Date.now() - startTime, userId: authResult.user.id, error: e instanceof Error ? e.message : String(e) })
    return Errors.INTERNAL_ERROR(e instanceof Error ? e.message : "Internal server error")
  }
}
