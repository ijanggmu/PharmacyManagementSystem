import { NextRequest, NextResponse } from "next/server"
import { createClient } from "@/lib/supabase/server"
import { z } from "zod"
import { requirePermission, requireCSRF } from "@/lib/api/auth-middleware"
import { successResponse, errorResponse, Errors } from "@/lib/api/response-utils"
import { logRequest } from "@/lib/api/logger"
import { rateLimit } from "../../middleware"
import {
  getSaleByIdForTenant,
  updateSaleForTenant,
  deleteSaleForTenant,
  resolveSalesBranchScope,
} from "@/lib/server/services/sales-service"
import { createAuditLog } from "@/lib/security/audit"

const patchSchema = z.object({
  payment_status: z
    .enum(["pending", "paid", "completed", "failed", "refunded"])
    .optional(),
  notes: z.string().nullable().optional(),
})

export async function GET(
  request: NextRequest,
  context: { params: Promise<{ id: string }> }
) {
  const startTime = Date.now()
  const { id } = await context.params

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
    return Errors.FORBIDDEN("Tenant context required")
  }

  try {
    const supabase = await createClient()
    const branchScope = await resolveSalesBranchScope(supabase, authResult.user.id, authResult.user.role)
    const { data, error } = await getSaleByIdForTenant(supabase, authResult.user.tenantId, id, branchScope)

    if (error || !data) {
      logRequest(request, {
        status: 404,
        duration: Date.now() - startTime,
        userId: authResult.user.id,
        error: error?.message,
      })
      return errorResponse("NOT_FOUND", "Sale not found", { status: 404 })
    }

    logRequest(request, {
      status: 200,
      duration: Date.now() - startTime,
      userId: authResult.user.id,
    })

    return successResponse(data)
  } catch (error) {
    logRequest(request, {
      status: 500,
      duration: Date.now() - startTime,
      userId: authResult.user.id,
      error: error instanceof Error ? error.message : "Unknown error",
    })
    return Errors.INTERNAL_ERROR(
      error instanceof Error ? error.message : "Internal server error"
    )
  }
}

export async function PATCH(
  request: NextRequest,
  context: { params: Promise<{ id: string }> }
) {
  const startTime = Date.now()
  const { id } = await context.params

  const rateLimitResult = rateLimit(request)
  if (rateLimitResult) {
    logRequest(request, { status: 429, duration: Date.now() - startTime })
    return rateLimitResult
  }

  const authResult = await requirePermission(request, "sales:write")
  if (authResult instanceof NextResponse) {
    logRequest(request, { status: 401, duration: Date.now() - startTime })
    return authResult
  }

  if (!authResult.user.tenantId) {
    return Errors.FORBIDDEN("Tenant context required")
  }

  const csrfResult = await requireCSRF(request)
  if (csrfResult) {
    logRequest(request, { status: 403, duration: Date.now() - startTime })
    return csrfResult
  }

  try {
    const body = await request.json()
    const patch = patchSchema.parse(body)

    const supabase = await createClient()
    const branchScope = await resolveSalesBranchScope(supabase, authResult.user.id, authResult.user.role)
    const { data: previous } = await getSaleByIdForTenant(supabase, authResult.user.tenantId, id, branchScope)
    if (!previous) {
      logRequest(request, { status: 404, duration: Date.now() - startTime, userId: authResult.user.id })
      return errorResponse("NOT_FOUND", "Sale not found", { status: 404 })
    }
    const { data, error } = await updateSaleForTenant(supabase, authResult.user.tenantId, id, patch)

    if (error || !data) {
      logRequest(request, {
        status: 400,
        duration: Date.now() - startTime,
        userId: authResult.user.id,
        error: error?.message,
      })
      return errorResponse("UPDATE_FAILED", error?.message || "Update failed", { status: 400 })
    }

    // Sale edits (payment status, notes) previously left no audit trail at all —
    // "who changed a sale" wasn't answerable. See audit Module 04.
    await createAuditLog({
      tenant_id: authResult.user.tenantId,
      table_name: "sales",
      record_id: id,
      action: "UPDATE",
      old_data: previous
        ? {
            payment_status: (previous as { payment_status?: string }).payment_status,
            notes: (previous as { notes?: string | null }).notes,
          }
        : undefined,
      new_data: patch,
    })

    logRequest(request, {
      status: 200,
      duration: Date.now() - startTime,
      userId: authResult.user.id,
    })

    return successResponse(data, { message: "Sale updated successfully" })
  } catch (error) {
    if (error instanceof z.ZodError) {
      return Errors.VALIDATION_ERROR(error.errors)
    }
    logRequest(request, {
      status: 500,
      duration: Date.now() - startTime,
      userId: authResult.user.id,
      error: error instanceof Error ? error.message : "Unknown error",
    })
    return Errors.INTERNAL_ERROR(
      error instanceof Error ? error.message : "Internal server error"
    )
  }
}

export async function DELETE(
  request: NextRequest,
  context: { params: Promise<{ id: string }> }
) {
  const startTime = Date.now()
  const { id } = await context.params

  const rateLimitResult = rateLimit(request)
  if (rateLimitResult) {
    logRequest(request, { status: 429, duration: Date.now() - startTime })
    return rateLimitResult
  }

  const authResult = await requirePermission(request, "sales:delete")
  if (authResult instanceof NextResponse) {
    logRequest(request, { status: 401, duration: Date.now() - startTime })
    return authResult
  }

  if (!authResult.user.tenantId) {
    return Errors.FORBIDDEN("Tenant context required")
  }

  const csrfResult = await requireCSRF(request)
  if (csrfResult) {
    logRequest(request, { status: 403, duration: Date.now() - startTime })
    return csrfResult
  }

  try {
    const supabase = await createClient()
    const { error } = await deleteSaleForTenant(supabase, authResult.user.tenantId, id)

    if (error) {
      logRequest(request, {
        status: 403,
        duration: Date.now() - startTime,
        userId: authResult.user.id,
        error: error.message,
      })
      return errorResponse("SALE_DELETE_NOT_ALLOWED", error.message, { status: 403 })
    }

    logRequest(request, {
      status: 200,
      duration: Date.now() - startTime,
      userId: authResult.user.id,
    })

    return successResponse(null, { message: "Sale deleted successfully" })
  } catch (error) {
    logRequest(request, {
      status: 500,
      duration: Date.now() - startTime,
      userId: authResult.user.id,
      error: error instanceof Error ? error.message : "Unknown error",
    })
    return Errors.INTERNAL_ERROR(
      error instanceof Error ? error.message : "Internal server error"
    )
  }
}
