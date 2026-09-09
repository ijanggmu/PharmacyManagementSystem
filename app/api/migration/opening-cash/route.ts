/** Opening cash-on-hand balance for the migration wizard. */

import { NextRequest, NextResponse } from "next/server"
import { z } from "zod"
import { createClient } from "@/lib/supabase/server"
import { requirePermission, requireCSRF } from "@/lib/api/auth-middleware"
import { successResponse, errorResponse, Errors } from "@/lib/api/response-utils"
import { logRequest } from "@/lib/api/logger"
import { rateLimit } from "../../middleware"
import { setOpeningCashOrBank } from "@/lib/server/services/migration-service"

const bodySchema = z.object({ amount: z.number().positive(), branch_id: z.string().uuid().nullable().optional() })

export async function POST(request: NextRequest) {
  const startTime = Date.now()
  const rateLimitResult = rateLimit(request)
  if (rateLimitResult) return rateLimitResult

  const authResult = await requirePermission(request, "settings:write")
  if (authResult instanceof NextResponse) return authResult
  if (!authResult.user.tenantId) return Errors.FORBIDDEN("Tenant context is required")

  const csrfResult = await requireCSRF(request)
  if (csrfResult) return csrfResult

  try {
    const body = await request.json()
    const parsed = bodySchema.parse(body)

    const supabase = await createClient()
    const { voucherId, error } = await setOpeningCashOrBank(supabase, authResult.user.tenantId, authResult.user.id, {
      kind: "cash",
      amount: parsed.amount,
      branchId: parsed.branch_id,
    })
    if (error) return errorResponse("SET_FAILED", error.message, { status: 400 })

    logRequest(request, { status: 200, duration: Date.now() - startTime, userId: authResult.user.id })
    return successResponse({ voucherId }, { message: "Opening cash balance recorded" })
  } catch (e) {
    if (e instanceof z.ZodError) return Errors.VALIDATION_ERROR(e.errors)
    logRequest(request, { status: 500, duration: Date.now() - startTime, userId: authResult.user.id, error: e instanceof Error ? e.message : String(e) })
    return Errors.INTERNAL_ERROR(e instanceof Error ? e.message : "Internal server error")
  }
}
