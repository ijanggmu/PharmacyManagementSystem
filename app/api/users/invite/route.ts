import { NextRequest, NextResponse } from "next/server"
import { createServiceClient } from "@/lib/supabase/service"
import { requirePermission, requireCSRF } from "@/lib/api/auth-middleware"
import { successResponse, errorResponse } from "@/lib/api/response-utils"
import { TENANT_ROLES } from "@/lib/security/rbac-types"
import {
  getActiveSubscriptionMaxUsers,
  countUsersForTenant,
  createTenantUserWithAuth,
} from "@/lib/server/services/user-service"

// Invite/add a user to the current tenant (admin/manager with users:write)
export async function POST(request: NextRequest) {
  const permResult = await requirePermission(request, "users:write")
  if (permResult instanceof NextResponse) return permResult

  const csrfResult = await requireCSRF(request)
  if (csrfResult) return csrfResult

  try {
    const body = await request.json()
    const {
      email,
      fullName,
      role,
      phone,
      password,
    } = body as {
      email?: string
      fullName?: string
      role?: string
      phone?: string | null
      password?: string
    }

    if (!email || !fullName || !role || !password) {
      return errorResponse("VALIDATION_ERROR", "Missing required fields", { status: 400 })
    }

    if (!(TENANT_ROLES as readonly string[]).includes(role)) {
      return errorResponse(
        "VALIDATION_ERROR",
        `Invalid role. Must be one of: ${TENANT_ROLES.join(", ")}`,
        { status: 400 }
      )
    }

    const tenantId = permResult.user.tenantId
    if (!tenantId) {
      return errorResponse("FORBIDDEN", "Tenant context is required to invite a user", {
        status: 403,
      })
    }

    const supabase = createServiceClient()

    // Enforce plan max_users limit if configured
    const { maxUsers, error: subError } = await getActiveSubscriptionMaxUsers(supabase, tenantId)
    if (!subError && maxUsers) {
      const { count, error: countError } = await countUsersForTenant(supabase, tenantId)

      if (!countError && count >= maxUsers) {
        return errorResponse(
          "PLAN_LIMIT_REACHED",
          "User limit reached for current subscription plan.",
          { status: 403 }
        )
      }
    }

    const { data, error, step } = await createTenantUserWithAuth(supabase, tenantId, {
      email,
      fullName,
      role,
      phone,
      password,
    })

    if (error || !data) {
      if (step === "create_app_user") {
        return errorResponse("CREATE_APP_USER_FAILED", error?.message || "Failed to create app user", { status: 400 })
      }
      return errorResponse(
        "CREATE_USER_FAILED",
        error?.message || "Failed to create auth user",
        { status: 400 }
      )
    }

    return successResponse(data, { status: 201, message: "User invited successfully" })
  } catch (error: any) {
    return errorResponse(
      "INTERNAL_ERROR",
      error?.message || "Failed to invite user",
      { status: 500 }
    )
  }
}

