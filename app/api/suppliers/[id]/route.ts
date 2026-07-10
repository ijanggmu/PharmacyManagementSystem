/**
 * Supplier by ID — auth, CSRF on mutations, standard API envelope.
 */

import { NextRequest, NextResponse } from "next/server"
import { createClient } from "@/lib/supabase/server"
import { supplierSchema } from "@/lib/utils/validation"
import { z } from "zod"
import { requireAuth, requireCSRF } from "@/lib/api/auth-middleware"
import { successResponse, errorResponse, Errors } from "@/lib/api/response-utils"
import { logRequest } from "@/lib/api/logger"
import { rateLimit } from "../../middleware"
import {
  getSupplierById,
  updateSupplier,
  checkSupplierDeletable,
  deleteSupplier,
} from "@/lib/server/services/supplier-service"

export async function GET(
  request: NextRequest,
  context: { params: Promise<{ id: string }> }
) {
  const startTime = Date.now()
  const rateLimitResult = rateLimit(request)
  if (rateLimitResult) return rateLimitResult

  const authResult = await requireAuth(request)
  if (authResult instanceof NextResponse) return authResult

  const { tenantId } = authResult.user
  if (!tenantId) {
    return errorResponse("FORBIDDEN", "Tenant context required", { status: 403 })
  }

  const { id } = await context.params

  try {
    const supabase = await createClient()
    const { data, error } = await getSupplierById(supabase, id, tenantId)

    if (error || !data) {
      logRequest(request, { status: 404, duration: Date.now() - startTime, userId: authResult.user.id })
      return errorResponse("NOT_FOUND", error?.message || "Supplier not found", { status: 404 })
    }

    logRequest(request, { status: 200, duration: Date.now() - startTime, userId: authResult.user.id })
    return successResponse(data)
  } catch (e) {
    logRequest(request, { status: 500, duration: Date.now() - startTime, userId: authResult.user.id, error: String(e) })
    return Errors.INTERNAL_ERROR(e instanceof Error ? e.message : "Internal server error")
  }
}

export async function PUT(
  request: NextRequest,
  context: { params: Promise<{ id: string }> }
) {
  const startTime = Date.now()
  const rateLimitResult = rateLimit(request)
  if (rateLimitResult) return rateLimitResult

  const authResult = await requireAuth(request)
  if (authResult instanceof NextResponse) return authResult

  const csrfResult = await requireCSRF(request)
  if (csrfResult) return csrfResult

  const { tenantId } = authResult.user
  if (!tenantId) {
    return errorResponse("FORBIDDEN", "Tenant context required", { status: 403 })
  }

  const { id } = await context.params

  try {
    const body = await request.json()
    const validatedData = supplierSchema.partial().parse(body)
    const supabase = await createClient()

    const { data, error } = await updateSupplier(supabase, id, tenantId, validatedData)

    if (error) {
      logRequest(request, { status: 400, duration: Date.now() - startTime, userId: authResult.user.id, error: error.message })
      return errorResponse("UPDATE_FAILED", error.message, { status: 400 })
    }

    logRequest(request, { status: 200, duration: Date.now() - startTime, userId: authResult.user.id })
    return successResponse(data, { message: "Supplier updated" })
  } catch (e) {
    if (e instanceof z.ZodError) return Errors.VALIDATION_ERROR(e.errors)
    logRequest(request, { status: 500, duration: Date.now() - startTime, userId: authResult.user.id, error: String(e) })
    return Errors.INTERNAL_ERROR(e instanceof Error ? e.message : "Internal server error")
  }
}

export async function DELETE(
  request: NextRequest,
  context: { params: Promise<{ id: string }> }
) {
  const startTime = Date.now()
  const rateLimitResult = rateLimit(request)
  if (rateLimitResult) return rateLimitResult

  const authResult = await requireAuth(request)
  if (authResult instanceof NextResponse) return authResult

  const csrfResult = await requireCSRF(request)
  if (csrfResult) return csrfResult

  const { tenantId } = authResult.user
  if (!tenantId) {
    return errorResponse("FORBIDDEN", "Tenant context required", { status: 403 })
  }

  const { id } = await context.params

  try {
    const supabase = await createClient()
    const guard = await checkSupplierDeletable(supabase, id, tenantId)

    if (guard.error) {
      logRequest(request, {
        status: 500,
        duration: Date.now() - startTime,
        userId: authResult.user.id,
        error: guard.error.message,
      })
      return Errors.INTERNAL_ERROR(guard.error.message)
    }

    if (guard.blocked) {
      return errorResponse("DELETE_BLOCKED", guard.reason || "Supplier cannot be deleted", { status: 400 })
    }

    const { error } = await deleteSupplier(supabase, id, tenantId)

    if (error) {
      logRequest(request, { status: 400, duration: Date.now() - startTime, userId: authResult.user.id, error: error.message })
      return errorResponse("DELETE_FAILED", error.message, { status: 400 })
    }

    logRequest(request, { status: 200, duration: Date.now() - startTime, userId: authResult.user.id })
    return successResponse({ id }, { message: "Supplier deleted" })
  } catch (e) {
    logRequest(request, { status: 500, duration: Date.now() - startTime, userId: authResult.user.id, error: String(e) })
    return Errors.INTERNAL_ERROR(e instanceof Error ? e.message : "Internal server error")
  }
}
