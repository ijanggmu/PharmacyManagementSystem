import { NextRequest, NextResponse } from "next/server"
import { createClient } from "@/lib/supabase/server"
import { requireAuth } from "@/lib/api/auth-middleware"
import { successResponse, errorResponse } from "@/lib/api/response-utils"

export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const authResult = await requireAuth(request)
  if (authResult instanceof NextResponse) return authResult

  const { tenantId } = authResult.user
  if (!tenantId) {
    return errorResponse("FORBIDDEN", "Tenant context required", { status: 403 })
  }

  const { id } = await params
  if (!id) return errorResponse("VALIDATION_ERROR", "Branch id required", { status: 400 })

  try {
    const body = await request.json()
    const updates: Record<string, unknown> = {}
    if (body.name !== undefined) updates.name = String(body.name).trim()
    if (body.code !== undefined) updates.code = String(body.code).trim().toLowerCase().replace(/[^a-z0-9-]/g, "-").replace(/-+/g, "-").slice(0, 60)
    if (body.address !== undefined) updates.address = body.address ? String(body.address).trim() : null
    if (body.phone !== undefined) updates.phone = body.phone ? String(body.phone).trim() : null
    if (body.email !== undefined) updates.email = body.email ? String(body.email).trim() : null
    if (typeof body.is_active === "boolean") updates.is_active = body.is_active
    updates.updated_at = new Date().toISOString()

    if (Object.keys(updates).length <= 1) {
      return successResponse({ id })
    }

    const supabase = await createClient()
    const { data, error } = await supabase
      .from("branches")
      .update(updates)
      .eq("id", id)
      .eq("tenant_id", tenantId)
      .select()
      .single()

    if (error) return errorResponse("UPDATE_FAILED", error.message, { status: 500 })
    if (!data) return errorResponse("NOT_FOUND", "Branch not found", { status: 404 })
    return successResponse(data)
  } catch (e: any) {
    return errorResponse("INTERNAL_ERROR", e?.message ?? "Failed to update branch", { status: 500 })
  }
}

export async function DELETE(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const authResult = await requireAuth(request)
  if (authResult instanceof NextResponse) return authResult

  const { tenantId } = authResult.user
  if (!tenantId) {
    return errorResponse("FORBIDDEN", "Tenant context required", { status: 403 })
  }

  const { id } = await params
  if (!id) return errorResponse("VALIDATION_ERROR", "Branch id required", { status: 400 })

  try {
    const supabase = await createClient()
    const { error } = await supabase
      .from("branches")
      .delete()
      .eq("id", id)
      .eq("tenant_id", tenantId)

    if (error) return errorResponse("DELETE_FAILED", error.message, { status: 500 })
    return successResponse({ deleted: true })
  } catch (e: any) {
    return errorResponse("INTERNAL_ERROR", e?.message ?? "Failed to delete branch", { status: 500 })
  }
}
