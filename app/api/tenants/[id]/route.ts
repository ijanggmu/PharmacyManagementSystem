import { NextRequest, NextResponse } from "next/server"
import { createServiceClient } from "@/lib/supabase/service"
import { requirePermission, requireCSRF } from "@/lib/api/auth-middleware"
import { successResponse, errorResponse } from "@/lib/api/response-utils"

// PATCH /api/tenants/[id] – Update basic tenant fields (superadmin only)
export async function PATCH(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const authResult = await requirePermission(request, "tenants:write")
  if (authResult instanceof NextResponse) return authResult

  const csrfResult = await requireCSRF(request)
  if (csrfResult) return csrfResult

  const { id: tenantId } = await params
  if (!tenantId) {
    return errorResponse("VALIDATION_ERROR", "Tenant id is required", { status: 400 })
  }

  try {
    const body = await request.json()
    const { name, country, timezone, currency, is_active } = body

    if (!name && !country && !timezone && !currency && typeof is_active === "undefined") {
      return errorResponse("VALIDATION_ERROR", "No fields provided to update", { status: 400 })
    }

    const updates: Record<string, unknown> = {}
    if (typeof name === "string") updates.name = name
    if (typeof country === "string") updates.country = country
    if (typeof timezone === "string") updates.timezone = timezone
    if (typeof currency === "string") updates.currency = currency
    if (typeof is_active === "boolean") updates.is_active = is_active

    const supabase = createServiceClient()
    const { data, error } = await supabase
      .from("tenants")
      .update(updates)
      .eq("id", tenantId)
      .select("id, name, code, country, timezone, currency, is_active, created_at")
      .single()

    if (error) {
      return errorResponse("UPDATE_TENANT_FAILED", error.message, { status: 400 })
    }

    return successResponse(data)
  } catch (e: any) {
    return errorResponse("INTERNAL_ERROR", e?.message ?? "Failed to update tenant", { status: 500 })
  }
}

// DELETE /api/tenants/[id] – Delete tenant (superadmin only)
export async function DELETE(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const authResult = await requirePermission(request, "tenants:write")
  if (authResult instanceof NextResponse) return authResult

  const csrfResult = await requireCSRF(request)
  if (csrfResult) return csrfResult

  const { id: tenantId } = await params
  if (!tenantId) {
    return errorResponse("VALIDATION_ERROR", "Tenant id is required", { status: 400 })
  }

  try {
    const supabase = createServiceClient()
    const { error } = await supabase.from("tenants").delete().eq("id", tenantId)

    if (error) {
      return errorResponse("DELETE_TENANT_FAILED", error.message, { status: 400 })
    }

    return successResponse({ id: tenantId })
  } catch (e: any) {
    return errorResponse("INTERNAL_ERROR", e?.message ?? "Failed to delete tenant", { status: 500 })
  }
}

