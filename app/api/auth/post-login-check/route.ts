import { NextRequest, NextResponse } from "next/server"
import { createClient } from "@/lib/supabase/server"
import { requireAuth, requireCSRF } from "@/lib/api/auth-middleware"
import { successResponse, Errors } from "@/lib/api/response-utils"
import { getUserTenantAndRole } from "@/lib/server/services/user-service"
import { getTenantStatusById } from "@/lib/server/services/tenant-service"

export async function POST(request: NextRequest) {
  const authResult = await requireAuth(request)
  if (authResult instanceof NextResponse) return authResult

  const csrfResult = await requireCSRF(request)
  if (csrfResult) return csrfResult

  try {
    const body = await request.json().catch(() => ({}))
    const codeInput = String(body?.pharmacyCode || "").trim().toLowerCase()

    const supabase = await createClient()
    const { data: appUser } = await getUserTenantAndRole(supabase, authResult.user.id)

    if (!appUser) return Errors.FORBIDDEN("Account not found. Please contact your administrator.")
    const isSuperadmin = appUser.role === "superadmin" || appUser.tenant_id == null
    if (isSuperadmin) return successResponse({ ok: true, isSuperadmin: true })

    if (!codeInput) {
      return Errors.BAD_REQUEST(
        "Pharmacy code is required. Use your tenant login link (e.g. /t/your-code/login), your pharmacy subdomain, or enter your pharmacy code."
      )
    }
    if (!appUser.tenant_id) {
      return Errors.FORBIDDEN("Account not linked to a pharmacy. Please contact your administrator.")
    }

    const { data: tenant } = await getTenantStatusById(supabase, appUser.tenant_id)

    if (!tenant) return Errors.FORBIDDEN("Account not linked to a valid pharmacy. Please contact your administrator.")
    if (!tenant.is_active) return Errors.FORBIDDEN("This pharmacy workspace is currently disabled. Please ask your superadmin to enable it.")
    if (tenant.code !== codeInput) {
      return Errors.FORBIDDEN("Pharmacy code does not match your account. Use the correct login link or code for your pharmacy.")
    }

    return successResponse({ ok: true, isSuperadmin: false })
  } catch (e) {
    return Errors.INTERNAL_ERROR(e instanceof Error ? e.message : "Post-login validation failed")
  }
}

