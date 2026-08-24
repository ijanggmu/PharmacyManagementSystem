/**
 * Self-service pharmacy profile — legal_name, license_number, pan_vat_number.
 * Distinct from /api/tenants/[id] (superadmin-only, cross-tenant). This is
 * scoped to the caller's own tenant and requires the tenant's own admin role,
 * not the platform-wide "tenants:write" permission.
 *
 * Uses the service client because there is no RLS UPDATE policy for tenant
 * admins on `tenants` (only a self-read policy, see scripts/82) — column-level
 * RLS isn't practical here, so tenant scoping + role + an explicit field
 * allowlist are enforced in this route instead.
 */

import { NextRequest, NextResponse } from "next/server"
import { z } from "zod"
import { createClient } from "@/lib/supabase/server"
import { createServiceClient } from "@/lib/supabase/service"
import { requireAuth, requireCSRF } from "@/lib/api/auth-middleware"
import { successResponse, errorResponse, Errors } from "@/lib/api/response-utils"

const patchSchema = z.object({
  legal_name: z.string().trim().max(255).nullable().optional(),
  license_number: z.string().trim().max(100).nullable().optional(),
  pan_vat_number: z.string().trim().max(20).nullable().optional(),
})

export async function GET(request: NextRequest) {
  const authResult = await requireAuth(request)
  if (authResult instanceof NextResponse) return authResult
  if (!authResult.user.tenantId) return Errors.FORBIDDEN("Tenant context required")

  try {
    const supabase = await createClient()
    const { data, error } = await supabase
      .from("tenants")
      .select("id, name, legal_name, license_number, pan_vat_number, country")
      .eq("id", authResult.user.tenantId)
      .single()

    if (error || !data) return errorResponse("NOT_FOUND", "Pharmacy profile not found", { status: 404 })
    return successResponse(data)
  } catch (e) {
    return Errors.INTERNAL_ERROR(e instanceof Error ? e.message : "Internal server error")
  }
}

export async function PATCH(request: NextRequest) {
  const authResult = await requireAuth(request)
  if (authResult instanceof NextResponse) return authResult
  if (!authResult.user.tenantId) return Errors.FORBIDDEN("Tenant context required")
  if (authResult.user.role !== "admin") {
    return Errors.FORBIDDEN("Only a pharmacy admin can edit the pharmacy profile")
  }

  const csrfResult = await requireCSRF(request)
  if (csrfResult) return csrfResult

  try {
    const body = await request.json()
    const patch = patchSchema.parse(body)

    if (Object.keys(patch).length === 0) {
      return errorResponse("VALIDATION_ERROR", "No fields provided to update", { status: 400 })
    }

    const supabase = createServiceClient()
    const { data, error } = await supabase
      .from("tenants")
      .update(patch)
      .eq("id", authResult.user.tenantId)
      .select("id, name, legal_name, license_number, pan_vat_number, country")
      .single()

    if (error) return errorResponse("UPDATE_FAILED", error.message, { status: 400 })
    return successResponse(data, { message: "Pharmacy profile updated" })
  } catch (e) {
    if (e instanceof z.ZodError) return Errors.VALIDATION_ERROR(e.errors)
    return Errors.INTERNAL_ERROR(e instanceof Error ? e.message : "Internal server error")
  }
}
