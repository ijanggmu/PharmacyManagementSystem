/**
 * Migration / opening-balance session — one per tenant. See
 * lib/server/services/migration-service.ts.
 */

import { NextRequest, NextResponse } from "next/server"
import { z } from "zod"
import { createClient } from "@/lib/supabase/server"
import { requirePermission, requireCSRF } from "@/lib/api/auth-middleware"
import { successResponse, errorResponse, Errors } from "@/lib/api/response-utils"
import { logRequest } from "@/lib/api/logger"
import { rateLimit } from "../../middleware"
import { getMigrationSession, startMigrationSession } from "@/lib/server/services/migration-service"

const startSchema = z.object({
  cutover_date: z.string().min(1),
  notes: z.string().max(1000).nullable().optional(),
})

export async function GET(request: NextRequest) {
  const startTime = Date.now()
  const rateLimitResult = rateLimit(request)
  if (rateLimitResult) return rateLimitResult

  const authResult = await requirePermission(request, "settings:read")
  if (authResult instanceof NextResponse) return authResult
  if (!authResult.user.tenantId) return Errors.FORBIDDEN("Tenant context is required")

  try {
    const supabase = await createClient()
    const { data, error } = await getMigrationSession(supabase, authResult.user.tenantId)
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

  const authResult = await requirePermission(request, "settings:write")
  if (authResult instanceof NextResponse) return authResult
  if (!authResult.user.tenantId) return Errors.FORBIDDEN("Tenant context is required")

  const csrfResult = await requireCSRF(request)
  if (csrfResult) return csrfResult

  try {
    const body = await request.json()
    const parsed = startSchema.parse(body)

    const supabase = await createClient()
    const { data, error } = await startMigrationSession(supabase, authResult.user.tenantId, authResult.user.id, {
      cutoverDate: parsed.cutover_date,
      notes: parsed.notes,
    })
    if (error) return errorResponse("CREATE_FAILED", error.message, { status: 400 })

    logRequest(request, { status: 201, duration: Date.now() - startTime, userId: authResult.user.id })
    return successResponse(data, { message: "Migration session started", status: 201 })
  } catch (e) {
    if (e instanceof z.ZodError) return Errors.VALIDATION_ERROR(e.errors)
    logRequest(request, { status: 500, duration: Date.now() - startTime, userId: authResult.user.id, error: e instanceof Error ? e.message : String(e) })
    return Errors.INTERNAL_ERROR(e instanceof Error ? e.message : "Internal server error")
  }
}
