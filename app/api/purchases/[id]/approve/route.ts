/**
 * Approve a purchase order — segregation-of-duties gate before it can be received.
 * See approve_purchase_order() in scripts/87-purchasing-accounting-controls.sql.
 */

import { NextRequest, NextResponse } from "next/server"
import { createClient } from "@/lib/supabase/server"
import { requirePermission, requireCSRF } from "@/lib/api/auth-middleware"
import { successResponse, errorResponse, Errors } from "@/lib/api/response-utils"
import { rateLimit } from "../../../middleware"
import { approvePurchaseOrder } from "@/lib/server/services/purchase-service"
import { createAuditLog } from "@/lib/security/audit"

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
    const supabase = await createClient()
    const { error } = await approvePurchaseOrder(supabase, authResult.user.tenantId, id, authResult.user.id)
    if (error) return errorResponse("APPROVE_FAILED", error.message, { status: 400 })

    await createAuditLog({
      tenant_id: authResult.user.tenantId,
      table_name: "purchase_orders",
      record_id: id,
      action: "UPDATE",
      new_data: { status: "approved", approved_by: authResult.user.id },
    })

    return successResponse({ id }, { message: "Purchase order approved" })
  } catch (e) {
    return Errors.INTERNAL_ERROR(e instanceof Error ? e.message : "Internal server error")
  }
}
