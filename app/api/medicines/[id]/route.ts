/**
 * Medicine by ID — auth, CSRF on mutations, standard API envelope.
 */

import { NextRequest, NextResponse } from "next/server"
import { createClient } from "@/lib/supabase/server"
import { medicineSchema } from "@/lib/utils/validation"
import { z } from "zod"
import { requirePermission, requireCSRF } from "@/lib/api/auth-middleware"
import { successResponse, errorResponse, Errors } from "@/lib/api/response-utils"
import { logRequest } from "@/lib/api/logger"
import { rateLimit } from "../../middleware"
import {
  getMedicineById,
  updateMedicineWithInventory,
  medicineHasRelations,
  deleteMedicine,
} from "@/lib/server/services/medicine-service"
import { createAuditLog } from "@/lib/security/audit"

export async function GET(
  request: NextRequest,
  context: { params: Promise<{ id: string }> }
) {
  const startTime = Date.now()
  const rateLimitResult = rateLimit(request)
  if (rateLimitResult) return rateLimitResult

  const authResult = await requirePermission(request, "inventory:read")
  if (authResult instanceof NextResponse) return authResult

  const tenantId = authResult.user.tenantId
  if (!tenantId) {
    return Errors.FORBIDDEN("Tenant context is required for medicines")
  }

  const { id } = await context.params

  try {
    const supabase = await createClient()
    const { data, error } = await getMedicineById(supabase, tenantId, id)

    if (error || !data) {
      logRequest(request, { status: 404, duration: Date.now() - startTime, userId: authResult.user.id })
      return errorResponse("NOT_FOUND", error?.message || "Medicine not found", { status: 404 })
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

  const authResult = await requirePermission(request, "inventory:write")
  if (authResult instanceof NextResponse) return authResult

  const csrfResult = await requireCSRF(request)
  if (csrfResult) return csrfResult

  const tenantId = authResult.user.tenantId
  if (!tenantId) {
    return Errors.FORBIDDEN("Tenant context is required for medicines")
  }

  const { id } = await context.params

  try {
    const body = await request.json()
    const validatedData = medicineSchema.partial().parse(body)
    const supabase = await createClient()

    const { data, error, notFound } = await updateMedicineWithInventory(
      supabase,
      tenantId,
      authResult.user.id,
      id,
      validatedData
    )

    if (error) {
      const status = notFound ? 404 : 400
      logRequest(request, { status, duration: Date.now() - startTime, userId: authResult.user.id, error: error.message })
      if (notFound) {
        return errorResponse("NOT_FOUND", error.message, { status: 404 })
      }
      return errorResponse("UPDATE_FAILED", error.message, { status: 400 })
    }

    if (validatedData.unit_price != null || validatedData.stock_quantity != null || validatedData.cost_price != null) {
      await createAuditLog({
        tenant_id: tenantId,
        table_name: "medicines",
        record_id: id,
        action: "UPDATE",
        new_data: {
          unit_price: validatedData.unit_price,
          cost_price: validatedData.cost_price,
          stock_quantity: validatedData.stock_quantity,
        },
      })
    }

    logRequest(request, { status: 200, duration: Date.now() - startTime, userId: authResult.user.id })
    return successResponse(data, { message: "Medicine updated" })
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

  const authResult = await requirePermission(request, "inventory:delete")
  if (authResult instanceof NextResponse) return authResult

  const csrfResult = await requireCSRF(request)
  if (csrfResult) return csrfResult

  const tenantId = authResult.user.tenantId
  if (!tenantId) {
    return Errors.FORBIDDEN("Tenant context is required for medicines")
  }

  const { id } = await context.params

  try {
    const supabase = await createClient()

    const hasRelations = await medicineHasRelations(supabase, id)

    if (hasRelations) {
      logRequest(request, { status: 400, duration: Date.now() - startTime, userId: authResult.user.id })
      return errorResponse(
        "HAS_RELATIONS",
        "Cannot delete medicine with related records. Please archive the medicine instead.",
        { status: 400 }
      )
    }

    const { error } = await deleteMedicine(supabase, tenantId, id)

    if (error) {
      logRequest(request, { status: 400, duration: Date.now() - startTime, userId: authResult.user.id, error: error.message })
      return errorResponse("DELETE_FAILED", error.message, { status: 400 })
    }

    await createAuditLog({
      tenant_id: tenantId,
      table_name: "medicines",
      record_id: id,
      action: "DELETE",
    })

    logRequest(request, { status: 200, duration: Date.now() - startTime, userId: authResult.user.id })
    return successResponse({ id }, { message: "Medicine deleted" })
  } catch (e) {
    logRequest(request, { status: 500, duration: Date.now() - startTime, userId: authResult.user.id, error: String(e) })
    return Errors.INTERNAL_ERROR(e instanceof Error ? e.message : "Internal server error")
  }
}
