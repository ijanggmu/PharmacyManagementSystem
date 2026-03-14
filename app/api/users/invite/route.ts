import { NextRequest, NextResponse } from "next/server"
import { createServiceClient } from "@/lib/supabase/service"
import { requirePermission, requireCSRF } from "@/lib/api/auth-middleware"
import { successResponse, errorResponse } from "@/lib/api/response-utils"

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

    const tenantId = permResult.user.tenantId
    if (!tenantId) {
      return errorResponse("FORBIDDEN", "Tenant context is required to invite a user", {
        status: 403,
      })
    }

    const supabase = createServiceClient()

    // Enforce plan max_users limit if configured
    const { data: sub, error: subError } = await supabase
      .from("tenant_subscriptions")
      .select("plan_id, status, plans!inner(max_users)")
      .eq("tenant_id", tenantId)
      .in("status", ["trial", "active"])
      .order("valid_from", { ascending: false })
      .limit(1)
      .maybeSingle()

    if (!subError && sub?.plans?.max_users) {
      const maxUsers = sub.plans.max_users as number
      const { count, error: countError } = await supabase
        .from("users")
        .select("id", { count: "exact", head: true })
        .eq("tenant_id", tenantId)

      if (!countError && typeof count === "number" && count >= maxUsers) {
        return errorResponse(
          "PLAN_LIMIT_REACHED",
          "User limit reached for current subscription plan.",
          { status: 403 }
        )
      }
    }

    // 1) Create auth user
    const { data: userResult, error: createUserError } = await supabase.auth.admin.createUser({
      email,
      password,
      email_confirm: false,
      user_metadata: {
        full_name: fullName,
        phone,
      },
    })

    if (createUserError || !userResult.user) {
      return errorResponse(
        "CREATE_USER_FAILED",
        createUserError?.message || "Failed to create auth user",
        { status: 400 }
      )
    }

    const authUser = userResult.user

    // 2) Insert app user row bound to same tenant
    const { error: appUserError } = await supabase.from("users").insert({
      id: authUser.id,
      email,
      full_name: fullName,
      role,
      phone: phone || null,
      tenant_id: tenantId,
    })

    if (appUserError) {
      return errorResponse("CREATE_APP_USER_FAILED", appUserError.message, { status: 400 })
    }

    return successResponse(
      {
        id: authUser.id,
        email,
        full_name: fullName,
        role,
        phone: phone || null,
      },
      { status: 201, message: "User invited successfully" }
    )
  } catch (error: any) {
    return errorResponse(
      "INTERNAL_ERROR",
      error?.message || "Failed to invite user",
      { status: 500 }
    )
  }
}

