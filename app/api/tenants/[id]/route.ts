import { NextRequest, NextResponse } from "next/server"
import { createServiceClient } from "@/lib/supabase/service"
import { requirePermission, requireCSRF, verifyUserPassword } from "@/lib/api/auth-middleware"
import { successResponse, errorResponse } from "@/lib/api/response-utils"
import {
  updateTenant,
  deleteTenant,
  getTenantDependencySummary,
  tenantHasDependentData,
  tenantHasRetainedDispensingHistory,
} from "@/lib/server/services/tenant-service"

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
    const { data, error } = await updateTenant(supabase, tenantId, updates)

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
    const summary = await getTenantDependencySummary(supabase, tenantId)

    // Retention hold: a tenant with any sales/prescription (dispensing) history can
    // never be hard-deleted, password confirmation or not — deactivate it instead.
    if (tenantHasRetainedDispensingHistory(summary)) {
      return errorResponse(
        "RETENTION_HOLD",
        `This pharmacy has ${summary.sales} sale(s) and ${summary.prescriptions} prescription(s) on record — dispensing history cannot be permanently deleted. Use "Edit Tenant" and set status to Inactive instead to block access while retaining the record.`,
        { status: 409, details: { summary } }
      )
    }

    if (tenantHasDependentData(summary)) {
      let confirmPassword: string | undefined
      try {
        const body = await request.json()
        confirmPassword = typeof body?.confirmPassword === "string" ? body.confirmPassword : undefined
      } catch {
        // No JSON body sent — treated as the initial, unconfirmed delete attempt.
      }

      if (!confirmPassword) {
        return errorResponse(
          "CONFIRMATION_REQUIRED",
          "This tenant has existing data. Enter your password to confirm permanent deletion.",
          { status: 409, details: { summary } }
        )
      }

      if (!authResult.user.email) {
        return errorResponse("VALIDATION_ERROR", "Unable to verify current user", { status: 400 })
      }

      const passwordValid = await verifyUserPassword(authResult.user.email, confirmPassword)
      if (!passwordValid) {
        return errorResponse("INVALID_PASSWORD", "Incorrect password", { status: 401 })
      }
    }

    const { error } = await deleteTenant(supabase, tenantId)

    if (error) {
      return errorResponse("DELETE_TENANT_FAILED", error.message, { status: 400 })
    }

    return successResponse({ id: tenantId })
  } catch (e: any) {
    return errorResponse("INTERNAL_ERROR", e?.message ?? "Failed to delete tenant", { status: 500 })
  }
}

