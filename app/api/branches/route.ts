import { NextRequest, NextResponse } from "next/server"
import { z } from "zod"
import { createClient } from "@/lib/supabase/server"
import { requirePermission, requireCSRF } from "@/lib/api/auth-middleware"
import { successResponse, errorResponse, Errors } from "@/lib/api/response-utils"
import { createBranchSchema } from "@/lib/server/schemas/branches"
import { backendTarget } from "@/lib/api/backend-target"
import { listBranchesForTenant, listBranchesForTenantDotnet, createBranch } from "@/lib/server/services/tenant-branch"

export async function GET(request: NextRequest) {
  const authResult = await requirePermission(request, "settings:read")
  if (authResult instanceof NextResponse) return authResult

  const { tenantId } = authResult.user
  if (!tenantId) {
    return errorResponse("FORBIDDEN", "Tenant context required", { status: 403 })
  }

  try {
    if (backendTarget("TENANCY") === "dotnet") {
      return successResponse(await listBranchesForTenantDotnet())
    }

    const supabase = await createClient()
    const { data, error } = await listBranchesForTenant(supabase, tenantId)

    if (error) return errorResponse("LIST_FAILED", error.message, { status: 500 })
    return successResponse(data ?? [])
  } catch (e: any) {
    return errorResponse("INTERNAL_ERROR", e?.message ?? "Failed to list branches", { status: 500 })
  }
}

export async function POST(request: NextRequest) {
  const authResult = await requirePermission(request, "settings:write")
  if (authResult instanceof NextResponse) return authResult

  const csrfResult = await requireCSRF(request)
  if (csrfResult) return csrfResult

  const { tenantId } = authResult.user
  if (!tenantId) {
    return errorResponse("FORBIDDEN", "Tenant context required", { status: 403 })
  }

  try {
    const rawBody = await request.json()
    const { name, code, address, phone, email, is_active } = createBranchSchema.parse(rawBody)

    const supabase = await createClient()
    const { data, error } = await createBranch(supabase, tenantId, { name, code, address, phone, email, is_active })

    if (error) {
      if (error.code === "23505") return errorResponse("CONFLICT", "A branch with this code already exists", { status: 409 })
      return errorResponse("CREATE_FAILED", error.message, { status: 500 })
    }
    return successResponse(data, { status: 201 })
  } catch (e: any) {
    if (e instanceof z.ZodError) {
      return Errors.VALIDATION_ERROR(e.errors)
    }
    return errorResponse("INTERNAL_ERROR", e?.message ?? "Failed to create branch", { status: 500 })
  }
}
