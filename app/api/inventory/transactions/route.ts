/**
 * Inventory movement history (audit trail) — read-only list over inventory_transactions.
 * See lib/server/services/inventory-transaction-service.ts.
 */

import { NextRequest, NextResponse } from "next/server"
import { createClient } from "@/lib/supabase/server"
import { requirePermission } from "@/lib/api/auth-middleware"
import { successResponse, Errors } from "@/lib/api/response-utils"
import { rateLimit } from "../../middleware"
import { listInventoryTransactions } from "@/lib/server/services/inventory-transaction-service"

export async function GET(request: NextRequest) {
  const rateLimitResult = rateLimit(request)
  if (rateLimitResult) return rateLimitResult

  const authResult = await requirePermission(request, "inventory:read")
  if (authResult instanceof NextResponse) return authResult
  if (!authResult.user.tenantId) return Errors.FORBIDDEN("Tenant context required")

  try {
    const { searchParams } = new URL(request.url)
    const supabase = await createClient()

    const result = await listInventoryTransactions(supabase, authResult.user.tenantId, {
      medicineId: searchParams.get("medicineId") || undefined,
      branchId: searchParams.get("branchId") || undefined,
      transactionType: searchParams.get("transactionType") || undefined,
      dateFrom: searchParams.get("dateFrom") || undefined,
      dateTo: searchParams.get("dateTo") || undefined,
      page: parseInt(searchParams.get("page") || "1"),
      limit: parseInt(searchParams.get("limit") || "50"),
    })

    if (result.error) return Errors.INTERNAL_ERROR(result.error.message)

    return successResponse(result.data, {
      meta: { page: result.page, limit: result.limit, total: result.count, totalPages: result.totalPages },
    })
  } catch (e) {
    return Errors.INTERNAL_ERROR(e instanceof Error ? e.message : "Internal server error")
  }
}
