import { NextRequest, NextResponse } from "next/server"
import { z } from "zod"
import { createClient } from "@/lib/supabase/server"
import { requireAuth, requireCSRF } from "@/lib/api/auth-middleware"
import { successResponse, errorResponse, Errors } from "@/lib/api/response-utils"
import { logRequest } from "@/lib/api/logger"
import { rateLimit } from "../../middleware"
import {
  getPrescriptionByIdForTenant,
  updatePrescriptionForTenant,
  deletePrescriptionForTenant,
} from "@/lib/server/services/prescriptions-service"

const patchSchema = z.object({
  doctor_name: z.string().optional(),
  status: z.enum(["pending", "filled", "partially_filled", "cancelled"]).optional(),
  notes: z.string().nullable().optional(),
})

export async function GET(request: NextRequest, context: { params: Promise<{ id: string }> }) {
  const startTime = Date.now()
  const rateLimitResult = rateLimit(request)
  if (rateLimitResult) return rateLimitResult
  const authResult = await requireAuth(request)
  if (authResult instanceof NextResponse) return authResult
  if (!authResult.user.tenantId) return Errors.FORBIDDEN("Tenant context required")

  const { id } = await context.params
  try {
    const supabase = await createClient()
    const { data, error } = await getPrescriptionByIdForTenant(supabase, authResult.user.tenantId, id)
    if (error || !data) return errorResponse("NOT_FOUND", "Prescription not found", { status: 404 })
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
  const authResult = await requireAuth(request)
  if (authResult instanceof NextResponse) return authResult
  const csrfResult = await requireCSRF(request)
  if (csrfResult) return csrfResult
  if (!authResult.user.tenantId) return Errors.FORBIDDEN("Tenant context required")

  const { id } = await context.params
  try {
    const body = await request.json()
    const patch = patchSchema.parse(body)
    const supabase = await createClient()
    const { data, error } = await updatePrescriptionForTenant(supabase, authResult.user.tenantId, id, patch)
    if (error) return errorResponse("UPDATE_FAILED", error.message, { status: 400 })
    logRequest(request, { status: 200, duration: Date.now() - startTime, userId: authResult.user.id })
    return successResponse(data, { message: "Prescription updated" })
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
  const authResult = await requireAuth(request)
  if (authResult instanceof NextResponse) return authResult
  const csrfResult = await requireCSRF(request)
  if (csrfResult) return csrfResult
  if (!authResult.user.tenantId) return Errors.FORBIDDEN("Tenant context required")

  const { id } = await context.params
  try {
    const supabase = await createClient()
    const { error } = await deletePrescriptionForTenant(supabase, authResult.user.tenantId, id)
    if (error) return errorResponse("DELETE_FAILED", error.message, { status: 400 })
    logRequest(request, { status: 200, duration: Date.now() - startTime, userId: authResult.user.id })
    return successResponse({ id }, { message: "Prescription deleted" })
  } catch (e) {
    logRequest(request, { status: 500, duration: Date.now() - startTime, userId: authResult.user.id, error: String(e) })
    return Errors.INTERNAL_ERROR(e instanceof Error ? e.message : "Internal server error")
  }
}

