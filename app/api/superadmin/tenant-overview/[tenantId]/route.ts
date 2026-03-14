import { NextRequest, NextResponse } from "next/server"
import { createServiceClient } from "@/lib/supabase/service"
import { requirePermission } from "@/lib/api/auth-middleware"
import { successResponse, errorResponse } from "@/lib/api/response-utils"

// Superadmin-only: high-level overview for a specific tenant
export async function GET(
  request: NextRequest,
  { params }: { params: { tenantId: string } }
) {
  const permResult = await requirePermission(request, "tenants:read")
  if (permResult instanceof NextResponse) return permResult

  const { tenantId } = params
  if (!tenantId) {
    return errorResponse("VALIDATION_ERROR", "tenantId is required", { status: 400 })
  }

  try {
    const supabase = createServiceClient()

    const [{ data: tenant }, usersCount, medicinesCount, customersCount, salesCount, branchesCount] =
      await Promise.all([
        supabase.from("tenants").select("*").eq("id", tenantId).single(),
        supabase.from("users").select("id", { count: "exact", head: true }).eq("tenant_id", tenantId),
        supabase.from("medicines").select("id", { count: "exact", head: true }).eq("tenant_id", tenantId),
        supabase.from("customers").select("id", { count: "exact", head: true }).eq("tenant_id", tenantId),
        supabase.from("sales").select("id", { count: "exact", head: true }).eq("tenant_id", tenantId),
        supabase.from("branches").select("id", { count: "exact", head: true }).eq("tenant_id", tenantId),
      ])

    if (!tenant) {
      return errorResponse("NOT_FOUND", "Tenant not found", { status: 404 })
    }

    return successResponse({
      tenant,
      stats: {
        users: usersCount.count || 0,
        medicines: medicinesCount.count || 0,
        customers: customersCount.count || 0,
        sales: salesCount.count || 0,
        branches: branchesCount.count || 0,
      },
    })
  } catch (error: any) {
    return errorResponse(
      "INTERNAL_ERROR",
      error?.message || "Failed to load tenant overview",
      { status: 500 }
    )
  }
}

