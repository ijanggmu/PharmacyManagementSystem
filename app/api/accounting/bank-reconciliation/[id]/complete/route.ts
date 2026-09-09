/** Locks a fully-matched statement as reconciled. */

import { NextRequest, NextResponse } from "next/server"
import { createClient } from "@/lib/supabase/server"
import { requirePermission, requireCSRF } from "@/lib/api/auth-middleware"
import { successResponse, errorResponse, Errors } from "@/lib/api/response-utils"
import { logRequest } from "@/lib/api/logger"
import { rateLimit } from "../../../../middleware"
import { completeBankReconciliation } from "@/lib/server/services/bank-reconciliation-service"

export async function POST(request: NextRequest, context: { params: Promise<{ id: string }> }) {
  const startTime = Date.now()
  const rateLimitResult = rateLimit(request)
  if (rateLimitResult) return rateLimitResult

  const authResult = await requirePermission(request, "accounting:write")
  if (authResult instanceof NextResponse) return authResult
  if (!authResult.user.tenantId) return Errors.FORBIDDEN("Tenant context is required")

  const csrfResult = await requireCSRF(request)
  if (csrfResult) return csrfResult

  try {
    const { id } = await context.params
    const supabase = await createClient()
    const { error } = await completeBankReconciliation(supabase, authResult.user.tenantId, authResult.user.id, id)
    if (error) return errorResponse("COMPLETE_FAILED", error.message, { status: 400 })

    logRequest(request, { status: 200, duration: Date.now() - startTime, userId: authResult.user.id })
    return successResponse({ status: "reconciled" }, { message: "Statement reconciled" })
  } catch (e) {
    logRequest(request, { status: 500, duration: Date.now() - startTime, userId: authResult.user.id, error: e instanceof Error ? e.message : String(e) })
    return Errors.INTERNAL_ERROR(e instanceof Error ? e.message : "Internal server error")
  }
}
