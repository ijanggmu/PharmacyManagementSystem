/** Bulk opening supplier AP balances for the migration wizard. */

import { NextRequest, NextResponse } from "next/server"
import { z } from "zod"
import { createClient } from "@/lib/supabase/server"
import { requirePermission, requireCSRF } from "@/lib/api/auth-middleware"
import { successResponse, errorResponse, Errors } from "@/lib/api/response-utils"
import { logRequest } from "@/lib/api/logger"
import { rateLimit } from "../../middleware"
import { importOpeningSupplierBalances } from "@/lib/server/services/migration-service"

const bodySchema = z.object({
  entries: z.array(z.object({ supplier_id: z.string().uuid(), amount: z.number().positive() })).min(1).max(500),
})

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
    const { data, error } = await importOpeningSupplierBalances(
      supabase,
      authResult.user.tenantId,
      authResult.user.id,
      parsed.entries.map((e) => ({ id: e.supplier_id, amount: e.amount }))
    )
    if (error) return errorResponse("IMPORT_FAILED", error.message, { status: 400 })

    logRequest(request, { status: 200, duration: Date.now() - startTime, userId: authResult.user.id })
    return successResponse(data, { message: `Recorded ${data?.imported ?? 0} opening supplier balance(s)` })
  } catch (e) {
    if (e instanceof z.ZodError) return Errors.VALIDATION_ERROR(e.errors)
    logRequest(request, { status: 500, duration: Date.now() - startTime, userId: authResult.user.id, error: e instanceof Error ? e.message : String(e) })
    return Errors.INTERNAL_ERROR(e instanceof Error ? e.message : "Internal server error")
  }
}
