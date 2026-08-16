/**
 * Direct (non-PO) goods receipts — posted by create/edit medicine or bulk import
 * when a supplier is set. Listed separately from /api/purchases since they have
 * no purchase_order_id and would otherwise never show up anywhere in Purchases.
 */

import { NextRequest, NextResponse } from "next/server"
import { requireAuth, requirePermission } from "@/lib/api/auth-middleware"
import { successResponse, Errors } from "@/lib/api/response-utils"
import { logRequest } from "@/lib/api/logger"
import { rateLimit } from "../../middleware"
import { createClient } from "@/lib/supabase/server"
import { listDirectGoodsReceipts } from "@/lib/server/services/inventory-supplier-receipt-service"

export async function GET(request: NextRequest) {
  const startTime = Date.now()
  const rateLimitResult = rateLimit(request)
  if (rateLimitResult) return rateLimitResult

  const authResult = await requireAuth(request)
  if (authResult instanceof NextResponse) return authResult

  const perm = await requirePermission(request, "inventory:read")
  if (perm instanceof NextResponse) return perm

  const tenantId = perm.user.tenantId
  if (!tenantId) {
    return Errors.FORBIDDEN("Tenant context is required for purchase receipts")
  }

  try {
    const supabase = await createClient()
    const { data, error } = await listDirectGoodsReceipts(supabase, tenantId)
    if (error) return Errors.INTERNAL_ERROR(error.message)

    logRequest(request, { status: 200, duration: Date.now() - startTime, userId: perm.user.id })
    return successResponse(data)
  } catch (e) {
    logRequest(request, {
      status: 500,
      duration: Date.now() - startTime,
      userId: perm.user.id,
      error: e instanceof Error ? e.message : String(e),
    })
    return Errors.INTERNAL_ERROR(e instanceof Error ? e.message : "Internal server error")
  }
}
