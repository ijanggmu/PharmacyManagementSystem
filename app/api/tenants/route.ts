import { NextRequest, NextResponse } from "next/server"
import { z } from "zod"
import { createServiceClient } from "@/lib/supabase/service"
import { requirePermission, requireCSRF } from "@/lib/api/auth-middleware"
import { successResponse, errorResponse, Errors } from "@/lib/api/response-utils"
import { createTenantSchema } from "@/lib/server/schemas/tenants"
import {
  listTenants,
  createTenantAdminAuthUser,
  insertTenant,
  insertTenantAdminAppUser,
  seedDefaultTenantSettings,
  seedDefaultBranch,
  seedDefaultChartOfAccounts,
  attachTenantPlan,
} from "@/lib/server/services/tenant-service"

/**
 * GET /api/tenants – List all tenants (superadmin only)
 */
export async function GET(request: NextRequest) {
  const authResult = await requirePermission(request, "tenants:read")
  if (authResult instanceof NextResponse) return authResult

  try {
    const supabase = createServiceClient()
    const { data: tenants, error } = await listTenants(supabase)

    if (error) {
      return errorResponse("LIST_TENANTS_FAILED", error.message, { status: 500 })
    }

    return successResponse(tenants ?? [])
  } catch (e: any) {
    return errorResponse("INTERNAL_ERROR", e?.message ?? "Failed to list tenants", { status: 500 })
  }
}

/**
 * POST /api/tenants – Create a new tenant and initial admin (superadmin only)
 */
export async function POST(request: NextRequest) {
  const authResult = await requirePermission(request, "tenants:write")
  if (authResult instanceof NextResponse) return authResult

  const csrfResult = await requireCSRF(request)
  if (csrfResult) return csrfResult

  try {
    const rawBody = await request.json()
    const {
      pharmacyName,
      legalName,
      licenseNumber,
      country,
      timezone,
      currency,
      fiscalYearStartMonth,
      adminFullName,
      adminEmail,
      adminPassword,
      planCode,
    } = createTenantSchema.parse(rawBody)

    const supabase = createServiceClient()

    const { data: userResult, error: createUserError } = await createTenantAdminAuthUser(supabase, {
      email: adminEmail,
      password: adminPassword,
      fullName: adminFullName,
    })

    if (createUserError || !userResult) {
      return errorResponse("CREATE_USER_FAILED", createUserError?.message ?? "Failed to create user", {
        status: 400,
      })
    }

    const authUser = userResult

    const code = pharmacyName.toLowerCase().replace(/[^a-z0-9]+/g, "-").slice(0, 40)
    const { data: tenant, error: tenantError } = await insertTenant(supabase, {
      name: pharmacyName,
      code,
      legalName,
      licenseNumber,
      country,
      timezone,
      currency,
      fiscalYearStartMonth,
    })

    if (tenantError || !tenant) {
      return errorResponse("CREATE_TENANT_FAILED", tenantError?.message ?? "Failed to create tenant", {
        status: 400,
      })
    }

    const { data: defaultBranch, error: branchError } = await seedDefaultBranch(supabase, tenant.id, tenant.code)
    if (branchError) {
      return errorResponse("CREATE_BRANCH_FAILED", branchError.message, { status: 400 })
    }

    const { error: appUserError } = await insertTenantAdminAppUser(supabase, {
      id: authUser.id,
      email: adminEmail,
      fullName: adminFullName,
      fallbackName: pharmacyName,
      tenantId: tenant.id,
      branchId: defaultBranch?.id ?? null,
    })

    if (appUserError) {
      return errorResponse("CREATE_APP_USER_FAILED", appUserError.message, { status: 400 })
    }

    const { error: settingsError } = await seedDefaultTenantSettings(supabase, {
      tenantId: tenant.id,
      pharmacyName,
      country,
      currency,
    })

    // Legacy schemas may enforce global unique(system_settings.key). In that case,
    // tenant/admin creation has already succeeded, so we continue with a warning.
    let settingsSeedWarning: string | null = null
    if (settingsError) {
      const rawMessage = settingsError.message ?? ""
      const isDuplicateSettings =
        rawMessage.includes("duplicate key value") &&
        rawMessage.includes("system_settings_key_key")

      if (isDuplicateSettings) {
        settingsSeedWarning =
          "Tenant was created, but default settings could not be seeded due to global system_settings key uniqueness."
      } else {
        return errorResponse("SEED_SETTINGS_FAILED", settingsError.message ?? "Failed to seed default settings", {
          status: 400,
        })
      }
    }

    // Chart of accounts — required for the accounting module's auto-posting triggers
    // (sales/purchases/returns/refunds/payments) to actually post anything. Best-effort
    // like settings above: tenant/admin already exist, so surface a warning rather than
    // fail the whole creation if this secondary step has an issue.
    let coaSeedWarning: string | null = null
    const { error: coaError } = await seedDefaultChartOfAccounts(supabase, tenant.id)
    if (coaError) {
      coaSeedWarning = `Tenant was created, but the chart of accounts could not be seeded: ${coaError.message}`
    }

    if (planCode) {
      await attachTenantPlan(supabase, tenant.id, planCode)
    }

    return successResponse(
      { tenantId: tenant.id, userId: authUser.id, settingsSeedWarning, coaSeedWarning },
      { status: 201, message: "Tenant and admin user created successfully" }
    )
  } catch (error: any) {
    if (error instanceof z.ZodError) {
      return Errors.VALIDATION_ERROR(error.errors)
    }
    return errorResponse("INTERNAL_ERROR", error?.message ?? "Failed to create tenant", { status: 500 })
  }
}
