/**
 * Returns API Route
 */

import { NextRequest, NextResponse } from "next/server"
import { createClient } from "@/lib/supabase/server"
import { z } from "zod"
import { requirePermission, requireCSRF } from "@/lib/api/auth-middleware"
import { successResponse, errorResponse, Errors } from "@/lib/api/response-utils"
import { logRequest } from "@/lib/api/logger"
import { rateLimit } from "../middleware"
import {
  parseListReturnsInput,
  listReturnsForTenant,
  createReturnForTenant,
} from "@/lib/server/services/returns-service"

export async function GET(request: NextRequest) {
  const startTime = Date.now()
  
  const rateLimitResult = rateLimit(request)
  if (rateLimitResult) {
    logRequest(request, { status: 429, duration: Date.now() - startTime })
    return rateLimitResult
  }

  const authResult = await requirePermission(request, "sales:read")
  if (authResult instanceof NextResponse) {
    logRequest(request, { status: 401, duration: Date.now() - startTime })
    return authResult
  }

  if (!authResult.user.tenantId) {
    return Errors.FORBIDDEN("Tenant context is required for returns")
  }

  try {
    const supabase = await createClient()
    const { searchParams } = new URL(request.url)
    const listInput = parseListReturnsInput(searchParams, authResult.user.tenantId)

    const { data, count, error } = await listReturnsForTenant(supabase, listInput)
    if (error) return Errors.INTERNAL_ERROR(error.message)

    logRequest(request, { status: 200, duration: Date.now() - startTime, userId: authResult.user.id })
    return successResponse(data || [], {
      meta: {
        page: listInput.page,
        limit: listInput.limit,
        total: count,
        totalPages: Math.ceil(count / listInput.limit),
      },
    })
  } catch (error) {
    logRequest(request, { 
      status: 500, 
      duration: Date.now() - startTime,
      userId: authResult.user.id,
      error: error instanceof Error ? error.message : "Unknown error"
    })
    return Errors.INTERNAL_ERROR(
      error instanceof Error ? error.message : "Internal server error"
    )
  }
}

const createSchema = z.object({
  sale_id: z.string().uuid(),
  customer_id: z.string().uuid(),
  return_date: z.string().min(1),
  status: z.enum(["pending", "approved", "rejected", "completed"]).default("pending"),
  reason: z.string().optional().nullable(),
  notes: z.string().optional().nullable(),
  return_items: z
    .array(
      z.object({
        sale_item_id: z.string().uuid(),
        quantity_returned: z.number().int().positive(),
        reason: z.string().min(1),
      })
    )
    .min(1, "At least one item is required"),
})

export async function POST(request: NextRequest) {
  const startTime = Date.now()
  const rateLimitResult = rateLimit(request)
  if (rateLimitResult) return rateLimitResult

  const authResult = await requirePermission(request, "sales:write")
  if (authResult instanceof NextResponse) return authResult

  const csrfResult = await requireCSRF(request)
  if (csrfResult) return csrfResult

  if (!authResult.user.tenantId) return Errors.FORBIDDEN("Tenant context is required for returns")

  try {
    const body = await request.json()
    const input = createSchema.parse(body)
    const supabase = await createClient()
    const { data, error } = await createReturnForTenant(supabase, authResult.user.tenantId, authResult.user.id, input)
    if (error) return errorResponse("CREATE_FAILED", error.message, { status: 400 })

    logRequest(request, { status: 201, duration: Date.now() - startTime, userId: authResult.user.id })
    return successResponse(data, { message: "Return created", status: 201 })
  } catch (e) {
    if (e instanceof z.ZodError) return Errors.VALIDATION_ERROR(e.errors)
    logRequest(request, { status: 500, duration: Date.now() - startTime, userId: authResult.user.id, error: String(e) })
    return Errors.INTERNAL_ERROR(e instanceof Error ? e.message : "Internal server error")
  }
}

