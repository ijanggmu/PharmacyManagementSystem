/**
 * Cancel an in-transit stock transfer — credits the source branch back (the
 * destination was never touched). Only while still 'in_transit'; once received
 * it's completed and immutable, same as any other posted transaction.
 */

import { NextRequest, NextResponse } from "next/server"
import { z } from "zod"
import { createClient } from "@/lib/supabase/server"
import { requirePermission, requireCSRF } from "@/lib/api/auth-middleware"
import { successResponse, errorResponse, Errors } from "@/lib/api/response-utils"
import { rateLimit } from "../../../middleware"
import { cancelStockTransfer } from "@/lib/server/services/stock-transfer-service"
import { createAuditLog } from "@/lib/security/audit"

const bodySchema = z.object({
  reason: z.string().trim().min(1, "A cancellation reason is required").max(500),
})

export async function POST(request: NextRequest, context: { params: Promise<{ id: string }> }) {
  const rateLimitResult = rateLimit(request)
  if (rateLimitResult) return rateLimitResult

  const authResult = await requirePermission(request, "inventory:write")
  if (authResult instanceof NextResponse) return authResult
  if (!authResult.user.tenantId) return Errors.FORBIDDEN("Tenant context required")

  const csrfResult = await requireCSRF(request)
  if (csrfResult) return csrfResult

  const { id } = await context.params

  try {
    const body = await request.json()
    const { reason } = bodySchema.parse(body)

    const supabase = await createClient()
    const { error } = await cancelStockTransfer(supabase, authResult.user.tenantId, authResult.user.id, id, reason)
    if (error) return errorResponse("CANCEL_FAILED", error.message, { status: 400 })

    await createAuditLog({
      tenant_id: authResult.user.tenantId,
      table_name: "stock_transfers",
      record_id: id,
      action: "UPDATE",
      new_data: { status: "cancelled", cancellation_reason: reason },
    })

    return successResponse({ id }, { message: "Transfer cancelled — source stock restored" })
  } catch (e) {
    if (e instanceof z.ZodError) return Errors.VALIDATION_ERROR(e.errors)
    return Errors.INTERNAL_ERROR(e instanceof Error ? e.message : "Internal server error")
  }
}
