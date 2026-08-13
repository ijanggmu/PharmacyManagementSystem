/**
 * Supplier cost history — unit cost per medicine over time, sourced from receipt
 * lines. See lib/server/services/supplier-cost-history-service.ts.
 */

import { NextRequest, NextResponse } from "next/server"
import { createClient } from "@/lib/supabase/server"
import { requirePermission } from "@/lib/api/auth-middleware"
import { successResponse, Errors } from "@/lib/api/response-utils"
import { rateLimit } from "../../../middleware"
import { getSupplierCostHistory } from "@/lib/server/services/supplier-cost-history-service"

export async function GET(request: NextRequest, context: { params: Promise<{ id: string }> }) {
  const rateLimitResult = rateLimit(request)
  if (rateLimitResult) return rateLimitResult

  const authResult = await requirePermission(request, "suppliers:read")
  if (authResult instanceof NextResponse) return authResult
  if (!authResult.user.tenantId) return Errors.FORBIDDEN("Tenant context required")

  const { id } = await context.params

  try {
    const supabase = await createClient()
    const { data, error } = await getSupplierCostHistory(supabase, authResult.user.tenantId, id)
    if (error) return Errors.INTERNAL_ERROR(error.message)
    return successResponse(data)
  } catch (e) {
    return Errors.INTERNAL_ERROR(e instanceof Error ? e.message : "Internal server error")
  }
}
