import { NextRequest, NextResponse } from "next/server"
import { createServiceClient } from "@/lib/supabase/service"
import { requirePermission, requireCSRF } from "@/lib/api/auth-middleware"
import { successResponse, errorResponse } from "@/lib/api/response-utils"

const ROLE_VALUES = ["admin", "pharmacist", "cashier", "manager", "staff"] as const
type TenantUserRole = (typeof ROLE_VALUES)[number]

export async function GET(_request: NextRequest, _context: { params: Promise<{ tenantId: string }> }) {
  // Optional: keep future-proof route shape; UI currently uses tenant-overview endpoint for listing.
  return errorResponse("NOT_IMPLEMENTED", "Use tenant overview endpoint for listing users", { status: 501 })
}

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ tenantId: string }> }
) {
  const permResult = await requirePermission(request, "users:write")
  if (permResult instanceof NextResponse) return permResult

  // Only superadmin can CRUD users for a specific tenant.
  if (permResult.user.role !== "superadmin") {
    return errorResponse("FORBIDDEN", "Only superadmin can create tenant users", { status: 403 })
  }

  const csrfResult = await requireCSRF(request)
  if (csrfResult) return csrfResult

  try {
    const { tenantId } = await params
    if (!tenantId) return errorResponse("VALIDATION_ERROR", "tenantId is required", { status: 400 })

    const body = (await request.json().catch(() => ({} as any))) as {
      email?: string
      fullName?: string
      phone?: string | null
      role?: TenantUserRole | string
      password?: string
    }

    const email = String(body.email || "").trim().toLowerCase()
    const fullName = String(body.fullName || "").trim()
    const phone = body.phone ? String(body.phone).trim() : null
    const role = String(body.role || "").trim() as TenantUserRole
    const password = String(body.password || "").trim()

    if (!email || !fullName || !role || !password) {
      return errorResponse("VALIDATION_ERROR", "email, fullName, role and password are required", {
        status: 400,
      })
    }

    if (!ROLE_VALUES.includes(role as TenantUserRole)) {
      return errorResponse("VALIDATION_ERROR", "Invalid role for tenant user", { status: 400 })
    }

    const supabase = createServiceClient()

    // 1) Create auth user
    const { data: authResult, error: createAuthError } = await supabase.auth.admin.createUser({
      email,
      password,
      email_confirm: false,
      user_metadata: {
        full_name: fullName,
        phone,
        role,
        tenant_id: tenantId,
      },
    })

    if (createAuthError || !authResult?.user) {
      return errorResponse("CREATE_USER_FAILED", createAuthError?.message || "Failed to create user", {
        status: 400,
      })
    }

    const authUser = authResult.user

    // 2) Insert app user row bound to the tenant
    const { error: appInsertError } = await supabase.from("users").insert({
      id: authUser.id,
      email,
      full_name: fullName,
      role,
      phone,
      tenant_id: tenantId,
    })

    if (appInsertError) {
      // Compensating action: remove auth user if app user row fails.
      await supabase.auth.admin.deleteUser(authUser.id).catch(() => null)
      return errorResponse("CREATE_APP_USER_FAILED", appInsertError.message, { status: 400 })
    }

    return successResponse(
      {
        id: authUser.id,
        email,
        full_name: fullName,
        role,
        phone,
      },
      { message: "Tenant user created", status: 201 }
    )
  } catch (e: any) {
    return errorResponse("INTERNAL_ERROR", e?.message || "Failed to create tenant user", { status: 500 })
  }
}

