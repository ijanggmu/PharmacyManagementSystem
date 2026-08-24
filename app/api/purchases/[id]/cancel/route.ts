/**
 * Cancel a purchase order that has never received any goods. See
 * cancelPurchaseOrder, lib/server/services/purchase-service.ts.
 */

import { NextRequest, NextResponse } from "next/server"
import { createClient } from "@/lib/supabase/server"
import { requirePermission, requireCSRF } from "@/lib/api/auth-middleware"
import { successResponse, errorResponse, Errors } from "@/lib/api/response-utils"
import { rateLimit } from "../../../middleware"
import { cancelPurchaseOrder } from "@/lib/server/services/purchase-service"
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
    const { error } = await cancelPurchaseOrder(supabase, authResult.user.tenantId, id)
    if (error) return errorResponse("CANCEL_FAILED", error.message, { status: 400 })

    await createAuditLog({
      tenant_id: authResult.user.tenantId,
      table_name: "purchase_orders",
      record_id: id,
      action: "UPDATE",
      new_data: { status: "cancelled" },
    })

    return successResponse({ id }, { message: "Purchase order cancelled" })
  } catch (e) {
    return Errors.INTERNAL_ERROR(e instanceof Error ? e.message : "Internal server error")
  }
}
