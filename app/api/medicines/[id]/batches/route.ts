/**
 * Active batches for a medicine (FEFO-ordered) — powers the batch/expiry list in the
 * medicine detail view.
 */

import { NextRequest, NextResponse } from "next/server"
import { createClient } from "@/lib/supabase/server"
import { requirePermission } from "@/lib/api/auth-middleware"
import { successResponse, errorResponse, Errors } from "@/lib/api/response-utils"
import { rateLimit } from "../../../middleware"
import { listBatchesForMedicine } from "@/lib/server/services/medicine-service"

export async function GET(request: NextRequest, context: { params: Promise<{ id: string }> }) {
  const rateLimitResult = rateLimit(request)
  if (rateLimitResult) return rateLimitResult

  const authResult = await requirePermission(request, "inventory:read")
  if (authResult instanceof NextResponse) return authResult
  if (!authResult.user.tenantId) return Errors.FORBIDDEN("Tenant context required")

  const { id } = await context.params

  try {
    const supabase = await createClient()
    const { data, error } = await listBatchesForMedicine(supabase, authResult.user.tenantId, id)
    if (error) return errorResponse("INTERNAL_ERROR", error.message, { status: 500 })
    return successResponse(data)
  } catch (e) {
    return Errors.INTERNAL_ERROR(e instanceof Error ? e.message : "Internal server error")
  }
}
