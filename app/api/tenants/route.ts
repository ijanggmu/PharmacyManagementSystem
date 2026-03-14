import { NextRequest, NextResponse } from "next/server"
import { createServiceClient } from "@/lib/supabase/service"
import { requirePermission, requireCSRF } from "@/lib/api/auth-middleware"
import { successResponse, errorResponse } from "@/lib/api/response-utils"

/**
 * GET /api/tenants – List all tenants (superadmin only)
 */
export async function GET(request: NextRequest) {
  const authResult = await requirePermission(request, "tenants:read")
  if (authResult instanceof NextResponse) return authResult

  try {
    const supabase = createServiceClient()
    const { data: tenants, error } = await supabase
      .from("tenants")
      .select("id, name, code, country, timezone, currency, is_active, created_at")
      .order("created_at", { ascending: false })

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
    const body = await request.json()
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
    } = body

    if (!pharmacyName || !adminEmail || !adminPassword) {
      return errorResponse("VALIDATION_ERROR", "Missing required fields: pharmacyName, adminEmail, adminPassword", {
        status: 400,
      })
    }

    const supabase = createServiceClient()

    const { data: userResult, error: createUserError } = await supabase.auth.admin.createUser({
      email: adminEmail,
      password: adminPassword,
      email_confirm: false,
      user_metadata: { full_name: adminFullName },
    })

    if (createUserError || !userResult.user) {
      return errorResponse("CREATE_USER_FAILED", createUserError?.message ?? "Failed to create user", {
        status: 400,
      })
    }

    const authUser = userResult.user

    const code = pharmacyName.toLowerCase().replace(/[^a-z0-9]+/g, "-").slice(0, 40)
    const { data: tenant, error: tenantError } = await supabase
      .from("tenants")
      .insert({
        name: pharmacyName,
        code,
        legal_name: legalName ?? pharmacyName,
        license_number: licenseNumber ?? null,
        country: country ?? "Nepal",
        timezone: timezone ?? "Asia/Kathmandu",
        currency: currency ?? "NPR",
        fiscal_year_start_month: fiscalYearStartMonth ?? 4,
      })
      .select()
      .single()

    if (tenantError || !tenant) {
      return errorResponse("CREATE_TENANT_FAILED", tenantError?.message ?? "Failed to create tenant", {
        status: 400,
      })
    }

    const { error: appUserError } = await supabase.from("users").insert({
      id: authUser.id,
      email: adminEmail,
      full_name: adminFullName ?? pharmacyName,
      role: "admin",
      tenant_id: tenant.id,
    })

    if (appUserError) {
      return errorResponse("CREATE_APP_USER_FAILED", appUserError.message, { status: 400 })
    }

    const defaultSettings = [
      { key: "pharmacy_name", value: pharmacyName, type: "string", category: "general" },
      { key: "pharmacy_country", value: country ?? "Nepal", type: "string", category: "general" },
      { key: "tax_rate", value: "0.13", type: "number", category: "sales" },
      { key: "currency", value: currency ?? "NPR", type: "string", category: "general" },
      { key: "low_stock_threshold", value: "0.2", type: "number", category: "inventory" },
      { key: "expiry_warning_days", value: "30", type: "number", category: "inventory" },
      { key: "enable_barcode", value: "true", type: "boolean", category: "inventory" },
      { key: "enable_notifications", value: "true", type: "boolean", category: "general" },
    ]

    const { error: settingsError } = await supabase.from("system_settings").insert(
      defaultSettings.map((s) => ({ ...s, tenant_id: tenant.id }))
    )

    if (settingsError) {
      return errorResponse("SEED_SETTINGS_FAILED", settingsError.message, { status: 400 })
    }

    if (planCode) {
      const { data: plan } = await supabase.from("plans").select("id").eq("code", planCode).single()
      if (plan) {
        await supabase.from("tenant_subscriptions").insert({
          tenant_id: tenant.id,
          plan_id: plan.id,
          status: "trial",
        })
      }
    }

    return successResponse(
      { tenantId: tenant.id, userId: authUser.id },
      { status: 201, message: "Tenant and admin user created successfully" }
    )
  } catch (error: any) {
    return errorResponse("INTERNAL_ERROR", error?.message ?? "Failed to create tenant", { status: 500 })
  }
}
