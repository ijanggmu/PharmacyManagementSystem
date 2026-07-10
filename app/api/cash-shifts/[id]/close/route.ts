import { NextRequest, NextResponse } from "next/server"
import { z } from "zod"
import { createClient } from "@/lib/supabase/server"
import { requireAuth, requireCSRF, requirePermission } from "@/lib/api/auth-middleware"
import { successResponse, Errors, errorResponse } from "@/lib/api/response-utils"
import { logRequest } from "@/lib/api/logger"
import { rateLimit } from "@/app/api/middleware"
import { cashShiftTableUnavailableMessage, closeCashShift } from "@/lib/server/services/cash-shift-service"

const closeSchema = z.object({
  counted_cash_closing: z.coerce.number().min(0),
  notes_closing: z.string().max(2000).optional().nullable(),
})

export async function POST(
  request: NextRequest,
  context: { params: Promise<{ id: string }> }
) {
  const startTime = Date.now()
  const rateLimitResult = rateLimit(request)
  if (rateLimitResult) return rateLimitResult

  const authResult = await requireAuth(request)
  if (authResult instanceof NextResponse) return authResult

  const perm = await requirePermission(request, "sales:write")
  if (perm instanceof NextResponse) return perm

  const csrf = await requireCSRF(request)
  if (csrf) return csrf

  const tenantId = perm.user.tenantId
  if (!tenantId) return Errors.FORBIDDEN("Tenant context is required")

  const { id: shiftId } = await context.params
  if (!shiftId) return Errors.VALIDATION_ERROR({ id: "Shift id required" })

  try {
    const body = await request.json()
    const parsed = closeSchema.parse(body)
    const supabase = await createClient()
    const row = await closeCashShift(supabase, tenantId, perm.user.id, shiftId, {
      counted_cash_closing: parsed.counted_cash_closing,
      notes_closing: parsed.notes_closing ?? null,
    })

    logRequest(request, { status: 200, duration: Date.now() - startTime, userId: perm.user.id })
    return successResponse(row, { message: "Shift closed" })
  } catch (e) {
    if (e instanceof z.ZodError) return Errors.VALIDATION_ERROR(e.errors)
    const hint = cashShiftTableUnavailableMessage(e)
    if (hint) {
      logRequest(request, {
        status: 503,
        duration: Date.now() - startTime,
        userId: perm.user.id,
        error: e instanceof Error ? e.message : String(e),
      })
      return errorResponse("CASH_SHIFTS_UNAVAILABLE", hint, { status: 503 })
    }
    logRequest(request, {
      status: 400,
      duration: Date.now() - startTime,
      userId: perm.user.id,
      error: e instanceof Error ? e.message : String(e),
    })
    return Errors.VALIDATION_ERROR({ shift: e instanceof Error ? e.message : "Close failed" })
  }
}
