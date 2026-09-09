/** Consignment settlements — list history, or settle one supplier's outstanding position. */

import { NextRequest, NextResponse } from "next/server"
import { z } from "zod"
import { createClient } from "@/lib/supabase/server"
import { requirePermission, requireCSRF } from "@/lib/api/auth-middleware"
import { successResponse, errorResponse, Errors } from "@/lib/api/response-utils"
import { logRequest } from "@/lib/api/logger"
import { rateLimit } from "../../middleware"
import { listConsignmentSettlements, settleConsignmentForSupplier } from "@/lib/server/services/consignment-service"

const settleSchema = z.object({
  supplier_id: z.string().uuid(),
  settlement_date: z.string().min(1).optional(),
})

export async function GET(request: NextRequest) {
  const startTime = Date.now()
  const rateLimitResult = rateLimit(request)
  if (rateLimitResult) return rateLimitResult

  const authResult = await requirePermission(request, "accounting:read")
  if (authResult instanceof NextResponse) return authResult
  if (!authResult.user.tenantId) return Errors.FORBIDDEN("Tenant context is required")

  try {
    const supabase = await createClient()
    const { searchParams } = new URL(request.url)
    const { data, error } = await listConsignmentSettlements(supabase, authResult.user.tenantId, {
      supplierId: searchParams.get("supplierId"),
      limit: parseInt(searchParams.get("limit") || "50"),
    })
    if (error) return Errors.INTERNAL_ERROR(error.message)

    logRequest(request, { status: 200, duration: Date.now() - startTime, userId: authResult.user.id })
    return successResponse(data)
  } catch (e) {
    logRequest(request, { status: 500, duration: Date.now() - startTime, userId: authResult.user.id, error: e instanceof Error ? e.message : String(e) })
    return Errors.INTERNAL_ERROR(e instanceof Error ? e.message : "Internal server error")
  }
}

export async function POST(request: NextRequest) {
  const startTime = Date.now()
  const rateLimitResult = rateLimit(request)
  if (rateLimitResult) return rateLimitResult

  const authResult = await requirePermission(request, "accounting:write")
  if (authResult instanceof NextResponse) return authResult
  if (!authResult.user.tenantId) return Errors.FORBIDDEN("Tenant context is required")

  const csrfResult = await requireCSRF(request)
  if (csrfResult) return csrfResult

  try {
    const body = await request.json()
    const parsed = settleSchema.parse(body)

    const supabase = await createClient()
    const { data, error } = await settleConsignmentForSupplier(
      supabase,
      authResult.user.tenantId,
      authResult.user.id,
      parsed.supplier_id,
      parsed.settlement_date || new Date().toISOString().slice(0, 10)
    )
    if (error) return errorResponse("SETTLE_FAILED", error.message, { status: 400 })

    logRequest(request, { status: 201, duration: Date.now() - startTime, userId: authResult.user.id })
    return successResponse(data, {
      message: data?.settlementId ? `Settled ${data.totalQuantity} unit(s) — NPR ${data.totalValue.toFixed(2)}` : "Nothing to settle",
      status: 201,
    })
  } catch (e) {
    if (e instanceof z.ZodError) return Errors.VALIDATION_ERROR(e.errors)
    logRequest(request, { status: 500, duration: Date.now() - startTime, userId: authResult.user.id, error: e instanceof Error ? e.message : String(e) })
    return Errors.INTERNAL_ERROR(e instanceof Error ? e.message : "Internal server error")
  }
}
