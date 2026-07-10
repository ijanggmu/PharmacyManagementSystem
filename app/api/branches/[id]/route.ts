import { NextRequest, NextResponse } from "next/server"
import { z } from "zod"
import { createClient } from "@/lib/supabase/server"
import { requirePermission, requireCSRF } from "@/lib/api/auth-middleware"
import { successResponse, errorResponse, Errors } from "@/lib/api/response-utils"
import { updateBranchSchema } from "@/lib/server/schemas/branches"
import { updateBranch, deleteBranch } from "@/lib/server/services/tenant-branch"

export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const authResult = await requirePermission(request, "settings:write")
  if (authResult instanceof NextResponse) return authResult

  const csrfResult = await requireCSRF(request)
  if (csrfResult) return csrfResult

  const { tenantId } = authResult.user
  if (!tenantId) {
    return errorResponse("FORBIDDEN", "Tenant context required", { status: 403 })
  }

  const { id } = await params
  if (!id) return errorResponse("VALIDATION_ERROR", "Branch id required", { status: 400 })

  try {
    const rawBody = await request.json()
    const body = updateBranchSchema.parse(rawBody)

    const supabase = await createClient()
    const { data, error, updates } = await updateBranch(supabase, tenantId, id, body)

    if (Object.keys(updates).length <= 1) {
      return successResponse({ id })
    }

    if (error) return errorResponse("UPDATE_FAILED", error.message, { status: 500 })
    if (!data) return errorResponse("NOT_FOUND", "Branch not found", { status: 404 })
    return successResponse(data)
  } catch (e: any) {
    if (e instanceof z.ZodError) {
      return Errors.VALIDATION_ERROR(e.errors)
    }
    return errorResponse("INTERNAL_ERROR", e?.message ?? "Failed to update branch", { status: 500 })
  }
}

export async function DELETE(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const authResult = await requirePermission(request, "settings:write")
  if (authResult instanceof NextResponse) return authResult

  const csrfResult = await requireCSRF(request)
  if (csrfResult) return csrfResult

  const { tenantId } = authResult.user
  if (!tenantId) {
    return errorResponse("FORBIDDEN", "Tenant context required", { status: 403 })
  }

  const { id } = await params
  if (!id) return errorResponse("VALIDATION_ERROR", "Branch id required", { status: 400 })

  try {
    const supabase = await createClient()
    const { error } = await deleteBranch(supabase, tenantId, id)

    if (error) return errorResponse("DELETE_FAILED", error.message, { status: 500 })
    return successResponse({ deleted: true })
  } catch (e: any) {
    return errorResponse("INTERNAL_ERROR", e?.message ?? "Failed to delete branch", { status: 500 })
  }
}
