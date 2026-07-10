import { NextRequest, NextResponse } from "next/server"
import { createServiceClient } from "@/lib/supabase/service"
import { requirePermission } from "@/lib/api/auth-middleware"
import { successResponse, errorResponse } from "@/lib/api/response-utils"
import { getTenantOverview } from "@/lib/server/services/superadmin-service"

// Superadmin-only: high-level overview for a specific tenant
export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ tenantId: string }> }
) {
  const permResult = await requirePermission(request, "tenants:read")
  if (permResult instanceof NextResponse) return permResult

  const { tenantId } = await params
  if (!tenantId) {
    return errorResponse("VALIDATION_ERROR", "tenantId is required", { status: 400 })
  }

  try {
    const supabase = createServiceClient()

    const { data } = await getTenantOverview(supabase, tenantId)

    if (!data) {
      return errorResponse("NOT_FOUND", "Tenant not found", { status: 404 })
    }

    return successResponse(data)
  } catch (error: any) {
    return errorResponse(
      "INTERNAL_ERROR",
      error?.message || "Failed to load tenant overview",
      { status: 500 }
    )
  }
}

