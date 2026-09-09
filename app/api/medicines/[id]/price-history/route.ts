/**
 * Price-list versioning — history for one medicine, and scheduling a future
 * price change. Immediate edits still go through the normal medicine PATCH
 * endpoint (captured automatically by a DB trigger); this endpoint is for
 * viewing history and queuing a change ahead of time.
 */

import { NextRequest, NextResponse } from "next/server"
import { z } from "zod"
import { createClient } from "@/lib/supabase/server"
import { requirePermission, requireCSRF } from "@/lib/api/auth-middleware"
import { successResponse, errorResponse, Errors } from "@/lib/api/response-utils"
import { logRequest } from "@/lib/api/logger"
import { rateLimit } from "../../../middleware"
import { listMedicinePriceHistory, scheduleMedicinePriceChange } from "@/lib/server/services/price-history-service"

const scheduleSchema = z.object({
  unit_price: z.number().nonnegative(),
  effective_from: z.string().min(1),
  cost_price: z.number().nonnegative().nullable().optional(),
  reason: z.string().max(500).nullable().optional(),
})

export async function GET(request: NextRequest, context: { params: Promise<{ id: string }> }) {
  const startTime = Date.now()
  const rateLimitResult = rateLimit(request)
  if (rateLimitResult) return rateLimitResult

  const authResult = await requirePermission(request, "inventory:read")
  if (authResult instanceof NextResponse) return authResult
  if (!authResult.user.tenantId) return Errors.FORBIDDEN("Tenant context is required")

  try {
    const { id } = await context.params
    const supabase = await createClient()
    const { data, error } = await listMedicinePriceHistory(supabase, authResult.user.tenantId, id)
    if (error) return Errors.INTERNAL_ERROR(error.message)

    logRequest(request, { status: 200, duration: Date.now() - startTime, userId: authResult.user.id })
    return successResponse(data)
  } catch (e) {
    logRequest(request, { status: 500, duration: Date.now() - startTime, userId: authResult.user.id, error: e instanceof Error ? e.message : String(e) })
    return Errors.INTERNAL_ERROR(e instanceof Error ? e.message : "Internal server error")
  }
}

export async function POST(request: NextRequest, context: { params: Promise<{ id: string }> }) {
  const startTime = Date.now()
  const rateLimitResult = rateLimit(request)
  if (rateLimitResult) return rateLimitResult

  const authResult = await requirePermission(request, "inventory:write")
  if (authResult instanceof NextResponse) return authResult
  if (!authResult.user.tenantId) return Errors.FORBIDDEN("Tenant context is required")

  const csrfResult = await requireCSRF(request)
  if (csrfResult) return csrfResult

  try {
    const { id } = await context.params
    const body = await request.json()
    const parsed = scheduleSchema.parse(body)

    const supabase = await createClient()
    const { data, error } = await scheduleMedicinePriceChange(supabase, {
      medicineId: id,
      unitPrice: parsed.unit_price,
      effectiveFrom: parsed.effective_from,
      costPrice: parsed.cost_price,
      reason: parsed.reason,
    })
    if (error) return errorResponse("SCHEDULE_FAILED", error.message, { status: 400 })

    logRequest(request, { status: 201, duration: Date.now() - startTime, userId: authResult.user.id })
    return successResponse(data, {
      message: parsed.effective_from <= new Date().toISOString().slice(0, 10) ? "Price updated" : `Price change scheduled for ${parsed.effective_from}`,
      status: 201,
    })
  } catch (e) {
    if (e instanceof z.ZodError) return Errors.VALIDATION_ERROR(e.errors)
    logRequest(request, { status: 500, duration: Date.now() - startTime, userId: authResult.user.id, error: e instanceof Error ? e.message : String(e) })
    return Errors.INTERNAL_ERROR(e instanceof Error ? e.message : "Internal server error")
  }
}
