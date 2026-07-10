import { NextRequest, NextResponse } from "next/server"
import { createServiceClient } from "@/lib/supabase/service"
import { requirePermission, requireCSRF } from "@/lib/api/auth-middleware"
import { successResponse, errorResponse } from "@/lib/api/response-utils"
import {
  TENANT_USER_ROLE_VALUES as ROLE_VALUES,
  type TenantUserRole,
  getTenantUserById,
  countTenantAdmins,
  updateTenantUser,
  deleteTenantUser,
} from "@/lib/server/services/superadmin-service"
import { createAuditLog } from "@/lib/security/audit"

async function assertSuperadmin(permResult: Awaited<ReturnType<typeof requirePermission>>) {
  if (permResult instanceof NextResponse) return permResult
  if (permResult.user.role !== "superadmin") {
    return errorResponse("FORBIDDEN", "Only superadmin can update tenant users", { status: 403 })
  }
  return null
}

export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ tenantId: string; userId: string }> }
) {
  const permResult = await requirePermission(request, "users:write")
  const superadminGuard = await assertSuperadmin(permResult)
  if (superadminGuard) return superadminGuard

  const csrfResult = await requireCSRF(request)
  if (csrfResult) return csrfResult

  try {
    const { tenantId, userId } = await params
    if (!tenantId || !userId) {
      return errorResponse("VALIDATION_ERROR", "tenantId and userId are required", { status: 400 })
    }

    const body = (await request.json().catch(() => ({} as any))) as {
      fullName?: string
      phone?: string | null
      role?: TenantUserRole | string
    }

    const fullName = String(body.fullName || "").trim()
    const phone = body.phone ? String(body.phone).trim() : null
    const role = String(body.role || "").trim() as TenantUserRole

    if (!fullName || !role) {
      return errorResponse("VALIDATION_ERROR", "fullName and role are required", { status: 400 })
    }
    if (!ROLE_VALUES.includes(role as TenantUserRole)) {
      return errorResponse("VALIDATION_ERROR", "Invalid role for tenant user", { status: 400 })
    }

    const supabase = createServiceClient()

    // 1) Load current user record
    const { data: currentUser, error: currentErr } = await getTenantUserById(supabase, userId)

    if (currentErr || !currentUser) {
      return errorResponse("NOT_FOUND", "User not found", { status: 404 })
    }

    if (currentUser.tenant_id !== tenantId) {
      return errorResponse("FORBIDDEN", "User does not belong to this tenant", { status: 403 })
    }

    // 2) If removing the last admin, block.
    const isAdminBecomingNonAdmin = currentUser.role === "admin" && role !== "admin"
    if (isAdminBecomingNonAdmin) {
      const { count, error: adminCountErr } = await countTenantAdmins(supabase, tenantId)

      if (adminCountErr) {
        return errorResponse("INTERNAL_ERROR", adminCountErr.message || "Failed to check admin count", {
          status: 500,
        })
      }

      if (count <= 1) {
        return errorResponse(
          "LAST_ADMIN_BLOCKED",
          "You can't remove the last admin of this tenant. Assign admin role to another user first.",
          { status: 400 }
        )
      }
    }

    // 3) Update app user row
    const { data: updated, error: updateErr } = await updateTenantUser(supabase, tenantId, userId, {
      fullName,
      phone,
      role: role as TenantUserRole,
    })

    if (updateErr) {
      return errorResponse("UPDATE_USER_FAILED", updateErr.message, { status: 400 })
    }

    await createAuditLog({
      tenant_id: tenantId,
      table_name: "users",
      record_id: userId,
      action: "UPDATE",
      old_data: { role: currentUser.role },
      new_data: { role, full_name: fullName },
    })

    return successResponse(updated, { message: "Tenant user updated", status: 200 })
  } catch (e: any) {
    return errorResponse("INTERNAL_ERROR", e?.message || "Failed to update tenant user", { status: 500 })
  }
}

export async function DELETE(
  request: NextRequest,
  { params }: { params: Promise<{ tenantId: string; userId: string }> }
) {
  const permResult = await requirePermission(request, "users:delete")
  const superadminGuard = await assertSuperadmin(permResult)
  if (superadminGuard) return superadminGuard

  const csrfResult = await requireCSRF(request)
  if (csrfResult) return csrfResult

  try {
    const { tenantId, userId } = await params
    if (!tenantId || !userId) {
      return errorResponse("VALIDATION_ERROR", "tenantId and userId are required", { status: 400 })
    }

    const supabase = createServiceClient()

    // Load to enforce constraints
    const { data: currentUser, error: currentErr } = await getTenantUserById(supabase, userId)

    if (currentErr || !currentUser) {
      return errorResponse("NOT_FOUND", "User not found", { status: 404 })
    }

    if (currentUser.tenant_id !== tenantId) {
      return errorResponse("FORBIDDEN", "User does not belong to this tenant", { status: 403 })
    }

    // Prevent deleting last admin (lockout prevention)
    if (currentUser.role === "admin") {
      const { count, error: adminCountErr } = await countTenantAdmins(supabase, tenantId)

      if (adminCountErr) {
        return errorResponse("INTERNAL_ERROR", adminCountErr.message || "Failed to check admin count", {
          status: 500,
        })
      }

      if (count <= 1) {
        return errorResponse(
          "LAST_ADMIN_BLOCKED",
          "You can't delete the last admin of this tenant. Assign admin role to another user first.",
          { status: 400 }
        )
      }
    }

    // Delete auth user first, then app user row
    const { error: deleteErr } = await deleteTenantUser(supabase, tenantId, userId)
    if (deleteErr) {
      return errorResponse("DELETE_USER_FAILED", deleteErr.message, { status: 400 })
    }

    await createAuditLog({
      tenant_id: tenantId,
      table_name: "users",
      record_id: userId,
      action: "DELETE",
      old_data: { role: currentUser.role },
    })

    return successResponse({ deleted: true }, { message: "Tenant user deleted", status: 200 })
  } catch (e: any) {
    return errorResponse("INTERNAL_ERROR", e?.message || "Failed to delete tenant user", { status: 500 })
  }
}

