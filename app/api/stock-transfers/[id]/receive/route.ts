/**
 * Receive an in-transit stock transfer at the destination branch — credits
 * destination stock and marks the transfer completed. See receiveStockTransfer,
 * lib/server/services/stock-transfer-service.ts.
 */

import { NextRequest, NextResponse } from "next/server"
import { createClient } from "@/lib/supabase/server"
import { requirePermission, requireCSRF } from "@/lib/api/auth-middleware"
import { successResponse, errorResponse, Errors } from "@/lib/api/response-utils"
import { rateLimit } from "../../../middleware"
import { receiveStockTransfer } from "@/lib/server/services/stock-transfer-service"
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
    const { error } = await receiveStockTransfer(supabase, authResult.user.tenantId, authResult.user.id, id)
    if (error) return errorResponse("RECEIVE_FAILED", error.message, { status: 400 })

    await createAuditLog({
      tenant_id: authResult.user.tenantId,
      table_name: "stock_transfers",
      record_id: id,
      action: "UPDATE",
      new_data: { status: "completed" },
    })

    return successResponse({ id }, { message: "Transfer received — destination stock updated" })
  } catch (e) {
    return Errors.INTERNAL_ERROR(e instanceof Error ? e.message : "Internal server error")
  }
}
