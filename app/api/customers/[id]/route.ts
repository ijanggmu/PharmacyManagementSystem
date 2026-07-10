/**
 * Customer by ID — consistent with BFF envelope (successResponse).
 */

import { NextRequest, NextResponse } from "next/server"
import { createClient } from "@/lib/supabase/server"
import { customerSchema } from "@/lib/utils/validation"
import { z } from "zod"
import { requirePermission, requireCSRF } from "@/lib/api/auth-middleware"
import { successResponse, errorResponse, Errors } from "@/lib/api/response-utils"
import { logRequest } from "@/lib/api/logger"
import { rateLimit } from "../../middleware"
import {
  getCustomerById,
  updateCustomer,
  customerHasRelations,
  deleteCustomer,
} from "@/lib/server/services/customer-service"

export async function GET(
  request: NextRequest,
  context: { params: Promise<{ id: string }> }
) {
  const startTime = Date.now()
  const rateLimitResult = rateLimit(request)
  if (rateLimitResult) return rateLimitResult

  const authResult = await requirePermission(request, "customers:read")
  if (authResult instanceof NextResponse) return authResult
  if (!authResult.user.tenantId) {
    return Errors.FORBIDDEN("Tenant context required")
  }

  const { id } = await context.params

  try {
    const supabase = await createClient()
    const { data, error } = await getCustomerById(supabase, authResult.user.tenantId, id)

    if (error || !data) {
      logRequest(request, { status: 404, duration: Date.now() - startTime, userId: authResult.user.id })
      return errorResponse("NOT_FOUND", error?.message || "Customer not found", { status: 404 })
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

  const authResult = await requirePermission(request, "customers:write")
  if (authResult instanceof NextResponse) return authResult
  if (!authResult.user.tenantId) {
    return Errors.FORBIDDEN("Tenant context required")
  }

  const csrfResult = await requireCSRF(request)
  if (csrfResult) return csrfResult

  const { id } = await context.params

  try {
    const body = await request.json()
    const validatedData = customerSchema.partial().parse(body)
    const supabase = await createClient()

    const { data, error } = await updateCustomer(supabase, authResult.user.tenantId, id, validatedData)

    if (error) {
      logRequest(request, { status: 400, duration: Date.now() - startTime, userId: authResult.user.id, error: error.message })
      return errorResponse("UPDATE_FAILED", error.message, { status: 400 })
    }

    logRequest(request, { status: 200, duration: Date.now() - startTime, userId: authResult.user.id })
    return successResponse(data, { message: "Customer updated" })
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

  const authResult = await requirePermission(request, "customers:delete")
  if (authResult instanceof NextResponse) return authResult
  if (!authResult.user.tenantId) {
    return Errors.FORBIDDEN("Tenant context required")
  }

  const csrfResult = await requireCSRF(request)
  if (csrfResult) return csrfResult

  const { id } = await context.params

  try {
    const supabase = await createClient()

    const hasRelations = await customerHasRelations(supabase, authResult.user.tenantId, id)

    if (hasRelations) {
      logRequest(request, { status: 400, duration: Date.now() - startTime, userId: authResult.user.id })
      return errorResponse(
        "HAS_RELATIONS",
        "Cannot delete customer with related records. Please archive the customer instead.",
        { status: 400 }
      )
    }

    const { error } = await deleteCustomer(supabase, authResult.user.tenantId, id)

    if (error) {
      logRequest(request, { status: 400, duration: Date.now() - startTime, userId: authResult.user.id, error: error.message })
      return errorResponse("DELETE_FAILED", error.message, { status: 400 })
    }

    logRequest(request, { status: 200, duration: Date.now() - startTime, userId: authResult.user.id })
    return successResponse({ id }, { message: "Customer deleted" })
  } catch (e) {
    logRequest(request, { status: 500, duration: Date.now() - startTime, userId: authResult.user.id, error: String(e) })
    return Errors.INTERNAL_ERROR(e instanceof Error ? e.message : "Internal server error")
  }
}
