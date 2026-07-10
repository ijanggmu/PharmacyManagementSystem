import { NextRequest, NextResponse } from "next/server"
import { z } from "zod"
import { createClient } from "@/lib/supabase/server"
import { requirePermission, requireCSRF } from "@/lib/api/auth-middleware"
import { successResponse, errorResponse, Errors } from "@/lib/api/response-utils"
import { logRequest } from "@/lib/api/logger"
import { rateLimit } from "../../middleware"
import {
  getReturnByIdForTenant,
  updateReturnForTenant,
  deleteReturnForTenant,
} from "@/lib/server/services/returns-service"
import { createAuditLog } from "@/lib/security/audit"

const patchSchema = z.object({
  status: z.enum(["pending", "approved", "rejected", "completed"]).optional(),
  reason: z.string().nullable().optional(),
  notes: z.string().nullable().optional(),
})

export async function GET(request: NextRequest, context: { params: Promise<{ id: string }> }) {
  const startTime = Date.now()
  const rateLimitResult = rateLimit(request)
  if (rateLimitResult) return rateLimitResult

  const authResult = await requirePermission(request, "sales:read")
  if (authResult instanceof NextResponse) return authResult
  if (!authResult.user.tenantId) return Errors.FORBIDDEN("Tenant context required")

  const { id } = await context.params
  try {
    const supabase = await createClient()
    const { data, error } = await getReturnByIdForTenant(supabase, authResult.user.tenantId, id)
    if (error || !data) return errorResponse("NOT_FOUND", "Return not found", { status: 404 })
    logRequest(request, { status: 200, duration: Date.now() - startTime, userId: authResult.user.id })
    return successResponse(data)
  } catch (e) {
    logRequest(request, { status: 500, duration: Date.now() - startTime, userId: authResult.user.id, error: String(e) })
    return Errors.INTERNAL_ERROR(e instanceof Error ? e.message : "Internal server error")
  }
}

export async function PUT(request: NextRequest, context: { params: Promise<{ id: string }> }) {
  const startTime = Date.now()
  const rateLimitResult = rateLimit(request)
  if (rateLimitResult) return rateLimitResult

  const authResult = await requirePermission(request, "sales:write")
  if (authResult instanceof NextResponse) return authResult

  const csrfResult = await requireCSRF(request)
  if (csrfResult) return csrfResult

  if (!authResult.user.tenantId) return Errors.FORBIDDEN("Tenant context required")

  const { id } = await context.params
  try {
    const body = await request.json()
    const patch = patchSchema.parse(body)
    const supabase = await createClient()
    const { data, error } = await updateReturnForTenant(
      supabase,
      authResult.user.tenantId,
      authResult.user.id,
      id,
      patch
    )
    if (error) return errorResponse("UPDATE_FAILED", error.message, { status: 400 })

    if (patch.status) {
      await createAuditLog({
        tenant_id: authResult.user.tenantId,
        table_name: "medicine_returns",
        record_id: id,
        action: "UPDATE",
        new_data: { status: patch.status },
      })
    }

    logRequest(request, { status: 200, duration: Date.now() - startTime, userId: authResult.user.id })
    return successResponse(data, { message: "Return updated" })
  } catch (e) {
    if (e instanceof z.ZodError) return Errors.VALIDATION_ERROR(e.errors)
    logRequest(request, { status: 500, duration: Date.now() - startTime, userId: authResult.user.id, error: String(e) })
    return Errors.INTERNAL_ERROR(e instanceof Error ? e.message : "Internal server error")
  }
}

export async function DELETE(request: NextRequest, context: { params: Promise<{ id: string }> }) {
  const startTime = Date.now()
  const rateLimitResult = rateLimit(request)
  if (rateLimitResult) return rateLimitResult

  const authResult = await requirePermission(request, "sales:delete")
  if (authResult instanceof NextResponse) return authResult

  const csrfResult = await requireCSRF(request)
  if (csrfResult) return csrfResult

  if (!authResult.user.tenantId) return Errors.FORBIDDEN("Tenant context required")

  const { id } = await context.params
  try {
    const supabase = await createClient()
    const { error } = await deleteReturnForTenant(supabase, authResult.user.tenantId, id)
    if (error) return errorResponse("DELETE_FAILED", error.message, { status: 400 })
    logRequest(request, { status: 200, duration: Date.now() - startTime, userId: authResult.user.id })
    return successResponse({ id }, { message: "Return deleted" })
  } catch (e) {
    logRequest(request, { status: 500, duration: Date.now() - startTime, userId: authResult.user.id, error: String(e) })
    return Errors.INTERNAL_ERROR(e instanceof Error ? e.message : "Internal server error")
  }
}
