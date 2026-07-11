import { NextRequest, NextResponse } from "next/server"
import { z } from "zod"
import { createServiceClient } from "@/lib/supabase/service"
import { requireCSRF } from "@/lib/api/auth-middleware"
import { successResponse, errorResponse, Errors } from "@/lib/api/response-utils"
import { rateLimit } from "@/app/api/middleware"
import { onboardingSchema } from "@/lib/server/schemas/tenants"
import {
  createTenantAdminAuthUser,
  insertTenant,
  insertTenantAdminAppUser,
  seedDefaultTenantSettings,
  seedDefaultBranch,
  seedDefaultChartOfAccounts,
  attachTenantPlan,
} from "@/lib/server/services/tenant-service"

// Public onboarding endpoint to create a tenant and its initial admin user.
// This uses the Supabase service role key, so it is protected with rate limiting
// and CSRF (double-submit cookie, valid without a session).

export async function POST(request: NextRequest) {
  const rateLimitResult = rateLimit(request)
  if (rateLimitResult) return rateLimitResult

  const csrfResult = await requireCSRF(request)
  if (csrfResult) return csrfResult

  try {
    const rawBody = await request.json()
    const {
      pharmacyName,
      pharmacyCode,
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
    } = onboardingSchema.parse(rawBody)

    const rawCode =
      typeof pharmacyCode === "string" && pharmacyCode.trim()
        ? pharmacyCode.trim().toLowerCase().replace(/[^a-z0-9-]/g, "-").replace(/-+/g, "-").slice(0, 60)
        : pharmacyName.toLowerCase().replace(/[^a-z0-9]+/g, "-").slice(0, 40)
    const code = rawCode || "pharmacy"

    const supabase = createServiceClient()

    // 1) Create auth user
    const { data: userResult, error: createUserError } = await createTenantAdminAuthUser(supabase, {
      email: adminEmail,
      password: adminPassword,
      fullName: adminFullName,
    })

    if (createUserError || !userResult) {
      return errorResponse("CREATE_USER_FAILED", createUserError?.message || "Failed to create user", {
        status: 400,
      })
    }

    const authUser = userResult

    // 2) Create tenant (code = pharmacy slug for /t/[slug]/login)
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
      return errorResponse("CREATE_TENANT_FAILED", tenantError?.message || "Failed to create tenant", {
        status: 400,
      })
    }

    // 3) Seed the tenant's default branch ("Head Office") so it's ready to operate against
    const { data: defaultBranch, error: branchError } = await seedDefaultBranch(supabase, tenant.id, tenant.code)
    if (branchError) {
      return errorResponse("CREATE_BRANCH_FAILED", branchError.message, { status: 400 })
    }

    // 4) Link app user with tenant, role, and default branch
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

    // 5) Seed tenant settings
    const { error: settingsError } = await seedDefaultTenantSettings(supabase, {
      tenantId: tenant.id,
      pharmacyName,
      country,
      currency,
    })

    if (settingsError) {
      return errorResponse("SEED_SETTINGS_FAILED", settingsError.message, { status: 400 })
    }

    // 6) Seed the chart of accounts — required for the accounting module's auto-posting
    // triggers (sales/purchases/returns/refunds/payments) to actually post anything.
    const { error: coaError } = await seedDefaultChartOfAccounts(supabase, tenant.id)
    if (coaError) {
      return errorResponse("SEED_CHART_OF_ACCOUNTS_FAILED", coaError.message, { status: 400 })
    }

    // 7) Attach a subscription plan if provided
    if (planCode) {
      await attachTenantPlan(supabase, tenant.id, planCode)
    }

    return successResponse(
      {
        tenantId: tenant.id,
        userId: authUser.id,
        tenantCode: tenant.code,
      },
      {
        status: 201,
        message: "Tenant and admin user created successfully",
      },
    )
  } catch (error: any) {
    if (error instanceof z.ZodError) {
      return Errors.VALIDATION_ERROR(error.errors)
    }
    return errorResponse("INTERNAL_ERROR", error?.message || "Failed to complete onboarding", {
      status: 500,
    })
  }
}

