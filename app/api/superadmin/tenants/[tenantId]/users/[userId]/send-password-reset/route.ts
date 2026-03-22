import { NextRequest, NextResponse } from "next/server"
import { createServiceClient } from "@/lib/supabase/service"
import { requirePermission, requireCSRF } from "@/lib/api/auth-middleware"
import { successResponse, errorResponse } from "@/lib/api/response-utils"

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ tenantId: string; userId: string }> }
) {
  const permResult = await requirePermission(request, "users:write")
  if (permResult instanceof NextResponse) return permResult

  // Hard guard: only superadmin can force resets for tenant admins.
  if (permResult.user.role !== "superadmin") {
    return errorResponse("FORBIDDEN", "Only superadmin can send password reset links", { status: 403 })
  }

  const csrfResult = await requireCSRF(request)
  if (csrfResult) return csrfResult

  const { tenantId, userId } = await params
  if (!tenantId || !userId) {
    return errorResponse("VALIDATION_ERROR", "tenantId and userId are required", { status: 400 })
  }

  try {
    const body = await request.json().catch(() => ({} as any))
    const redirectTo =
      typeof body?.redirectTo === "string" && body.redirectTo.trim()
        ? body.redirectTo.trim()
        : `${new URL(request.url).origin}/auth/login`

    const supabase = createServiceClient()

    const { data: targetUser, error: userError } = await supabase
      .from("users")
      .select("id, email, role, tenant_id")
      .eq("id", userId)
      .single()

    if (userError || !targetUser) {
      return errorResponse("NOT_FOUND", "Target user not found", { status: 404 })
    }

    if (targetUser.tenant_id !== tenantId) {
      return errorResponse("FORBIDDEN", "User does not belong to this tenant", { status: 403 })
    }

    if (targetUser.role !== "admin") {
      return errorResponse("VALIDATION_ERROR", "Password reset can be sent only for tenant admin users", {
        status: 400,
      })
    }

    const { error: linkError } = await (supabase.auth.admin as any).generateLink({
      type: "recovery",
      email: targetUser.email,
      options: {
        redirectTo,
      },
    })

    if (linkError) {
      return errorResponse("RESET_PASSWORD_FAILED", linkError.message || "Failed to generate reset link", {
        status: 500,
      })
    }

    return successResponse(
      { sent: true },
      { message: "Password reset email sent", status: 200 }
    )
  } catch (e: any) {
    return errorResponse("INTERNAL_ERROR", e?.message || "Failed to send password reset", { status: 500 })
  }
}

