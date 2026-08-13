/**
 * Single tenant user — reads and mutations with CSRF on writes.
 */

import { NextRequest, NextResponse } from "next/server"
import { createClient } from "@/lib/supabase/server"
import { z } from "zod"
import { requireAuth, requirePermission, requireCSRF } from "@/lib/api/auth-middleware"
import { successResponse, errorResponse, Errors } from "@/lib/api/response-utils"
import { logRequest } from "@/lib/api/logger"
import { rateLimit } from "../../middleware"
import { getUserById, updateUser, deleteUser, countRemainingAdminsForTenant } from "@/lib/server/services/user-service"
import { TENANT_ROLES } from "@/lib/security/rbac-types"
import { createAuditLog } from "@/lib/security/audit"

const updateUserSchema = z.object({
  email: z.string().email().optional(),
  full_name: z.string().min(1).optional(),
  role: z.enum(TENANT_ROLES).optional(),
  phone: z.string().nullable().optional(),
  is_active: z.boolean().optional(),
})

export async function GET(
  request: NextRequest,
  context: { params: Promise<{ id: string }> }
) {
  const startTime = Date.now()
  const rateLimitResult = rateLimit(request)
  if (rateLimitResult) return rateLimitResult

  const authResult = await requireAuth(request)
  if (authResult instanceof NextResponse) return authResult

  const { id } = await context.params

  try {
    const supabase = await createClient()
    const { data, error } = await getUserById(supabase, id)

    if (error || !data) {
      logRequest(request, { status: 404, duration: Date.now() - startTime, userId: authResult.user.id })
      return errorResponse("NOT_FOUND", error?.message || "User not found", { status: 404 })
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

  const authResult = await requirePermission(request, "users:write")
  if (authResult instanceof NextResponse) return authResult

  const csrfResult = await requireCSRF(request)
  if (csrfResult) return csrfResult

  const { id } = await context.params
  const tenantId = authResult.user.tenantId
  if (!tenantId) {
    return errorResponse("FORBIDDEN", "Tenant context is required", { status: 403 })
  }

  try {
    const body = await request.json()
    const validated = updateUserSchema.parse(body)
    const supabase = await createClient()

    // Prevent demoting or deactivating the last remaining admin — would lock the
    // tenant out of admin access.
    const roleChangingAway = validated.role && validated.role !== "admin"
    const deactivating = validated.is_active === false
    if (roleChangingAway || deactivating) {
      if (id === authResult.user.id && deactivating) {
        return errorResponse("INVALID", "You cannot deactivate your own account.", { status: 400 })
      }
      const { data: target } = await getUserById(supabase, id)
      const targetRole = (target as { role?: string; tenant_id?: string } | null)?.role
      if (targetRole === "admin" || targetRole === "superadmin") {
        const { count, error: countError } = await countRemainingAdminsForTenant(supabase, tenantId, id)
        if (!countError && count === 0) {
          return errorResponse(
            "LAST_ADMIN",
            deactivating
              ? "Cannot deactivate this user — they are the last admin for this pharmacy."
              : "Cannot change this user's role — they are the last admin for this pharmacy.",
            { status: 400 }
          )
        }
      }
    }

    const { data, error } = await updateUser(supabase, id, tenantId, validated)

    if (error) {
      logRequest(request, { status: 400, duration: Date.now() - startTime, userId: authResult.user.id, error: error.message })
      return errorResponse("UPDATE_FAILED", error.message, { status: 400 })
    }

    if (validated.role || validated.is_active !== undefined) {
      await createAuditLog({
        tenant_id: tenantId,
        table_name: "users",
        record_id: id,
        action: "UPDATE",
        new_data: {
          ...(validated.role ? { role: validated.role } : {}),
          ...(validated.is_active !== undefined ? { is_active: validated.is_active } : {}),
        },
      })
    }

    logRequest(request, { status: 200, duration: Date.now() - startTime, userId: authResult.user.id })
    return successResponse(data, { message: "User updated" })
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

  const authResult = await requirePermission(request, "users:delete")
  if (authResult instanceof NextResponse) return authResult

  const csrfResult = await requireCSRF(request)
  if (csrfResult) return csrfResult

  const { id } = await context.params
  const tenantId = authResult.user.tenantId
  if (!tenantId) {
    return errorResponse("FORBIDDEN", "Tenant context is required", { status: 403 })
  }

  if (id === authResult.user.id) {
    return errorResponse("INVALID", "You cannot delete your own account from this endpoint.", { status: 400 })
  }

  try {
    const supabase = await createClient()

    // Prevent deleting the last remaining admin — would lock the tenant out of admin access.
    const { data: target } = await getUserById(supabase, id)
    const targetRole = (target as { role?: string } | null)?.role
    if (targetRole === "admin" || targetRole === "superadmin") {
      const { count, error: countError } = await countRemainingAdminsForTenant(supabase, tenantId, id)
      if (!countError && count === 0) {
        return errorResponse(
          "LAST_ADMIN",
          "Cannot delete this user — they are the last admin for this pharmacy.",
          { status: 400 }
        )
      }
    }

    const { error } = await deleteUser(supabase, id, tenantId)

    if (error) {
      logRequest(request, { status: 400, duration: Date.now() - startTime, userId: authResult.user.id, error: error.message })
      return errorResponse("DELETE_FAILED", error.message, { status: 400 })
    }

    await createAuditLog({
      tenant_id: tenantId,
      table_name: "users",
      record_id: id,
      action: "DELETE",
      old_data: { role: targetRole },
    })

    logRequest(request, { status: 200, duration: Date.now() - startTime, userId: authResult.user.id })
    return successResponse({ id }, { message: "User deleted" })
  } catch (e) {
    logRequest(request, { status: 500, duration: Date.now() - startTime, userId: authResult.user.id, error: String(e) })
    return Errors.INTERNAL_ERROR(e instanceof Error ? e.message : "Internal server error")
  }
}
