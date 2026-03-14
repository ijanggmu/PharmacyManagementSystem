import { NextRequest, NextResponse } from "next/server"
import { createServiceClient } from "@/lib/supabase/service"
import { successResponse, errorResponse } from "@/lib/api/response-utils"

// Public onboarding endpoint to create a tenant and its initial admin user.
// This uses the Supabase service role key, so protect the route with rate limiting
// and any additional captcha/validation you need in production.

export async function POST(request: NextRequest) {
  try {
    const body = await request.json()
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
    } = body

    if (!pharmacyName || !adminEmail || !adminPassword) {
      return errorResponse("VALIDATION_ERROR", "Missing required fields", { status: 400 })
    }

    const rawCode =
      typeof pharmacyCode === "string" && pharmacyCode.trim()
        ? pharmacyCode.trim().toLowerCase().replace(/[^a-z0-9-]/g, "-").replace(/-+/g, "-").slice(0, 60)
        : pharmacyName.toLowerCase().replace(/[^a-z0-9]+/g, "-").slice(0, 40)
    const code = rawCode || "pharmacy"

    const supabase = createServiceClient()

    // 1) Create auth user
    const { data: userResult, error: createUserError } = await supabase.auth.admin.createUser({
      email: adminEmail,
      password: adminPassword,
      email_confirm: false,
      user_metadata: {
        full_name: adminFullName,
      },
    })

    if (createUserError || !userResult.user) {
      return errorResponse("CREATE_USER_FAILED", createUserError?.message || "Failed to create user", {
        status: 400,
      })
    }

    const authUser = userResult.user

    // 2) Create tenant (code = pharmacy slug for /t/[slug]/login)
    const { data: tenant, error: tenantError } = await supabase
      .from("tenants")
      .insert({
        name: pharmacyName,
        code,
        legal_name: legalName || pharmacyName,
        license_number: licenseNumber || null,
        country: country || "Nepal",
        timezone: timezone || "Asia/Kathmandu",
        currency: currency || "NPR",
        fiscal_year_start_month: fiscalYearStartMonth || 4,
      })
      .select()
      .single()

    if (tenantError || !tenant) {
      return errorResponse("CREATE_TENANT_FAILED", tenantError?.message || "Failed to create tenant", {
        status: 400,
      })
    }

    // 3) Link app user with tenant and role
    const { error: appUserError } = await supabase.from("users").insert({
      id: authUser.id,
      email: adminEmail,
      full_name: adminFullName || pharmacyName,
      role: "admin",
      tenant_id: tenant.id,
    })

    if (appUserError) {
      return errorResponse("CREATE_APP_USER_FAILED", appUserError.message, { status: 400 })
    }

    // 4) Seed tenant settings
    const defaultSettings = [
      { key: "pharmacy_name", value: pharmacyName, type: "string", category: "general" },
      { key: "pharmacy_country", value: country || "Nepal", type: "string", category: "general" },
      { key: "tax_rate", value: "0.13", type: "number", category: "sales" },
      { key: "currency", value: currency || "NPR", type: "string", category: "general" },
      { key: "low_stock_threshold", value: "0.2", type: "number", category: "inventory" },
      { key: "expiry_warning_days", value: "30", type: "number", category: "inventory" },
      { key: "enable_barcode", value: "true", type: "boolean", category: "inventory" },
      { key: "enable_notifications", value: "true", type: "boolean", category: "general" },
    ]

    const { error: settingsError } = await supabase.from("system_settings").insert(
      defaultSettings.map((s) => ({
        ...s,
        tenant_id: tenant.id,
      })),
    )

    if (settingsError) {
      return errorResponse("SEED_SETTINGS_FAILED", settingsError.message, { status: 400 })
    }

    // 5) Attach a subscription plan if provided
    if (planCode) {
      const { data: plan, error: planError } = await supabase
        .from("plans")
        .select("id")
        .eq("code", planCode)
        .single()

      if (!planError && plan) {
        await supabase.from("tenant_subscriptions").insert({
          tenant_id: tenant.id,
          plan_id: plan.id,
          status: "trial",
        })
      }
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
    return errorResponse("INTERNAL_ERROR", error?.message || "Failed to complete onboarding", {
      status: 500,
    })
  }
}

