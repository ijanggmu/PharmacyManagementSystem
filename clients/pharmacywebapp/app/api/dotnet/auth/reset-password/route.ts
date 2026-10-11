import { NextResponse } from "next/server"
import type { NextRequest } from "next/server"
import { requireCSRF } from "@/lib/api/auth-middleware"
import { problemToNormalizedError } from "@/lib/api/dotnet-problem"
import { dotnetBaseUrl, dotnetHeaders, problem, tenantForRequest } from "@/lib/api/dotnet-bff"

/**
 * Anonymous BFF for POST /api/v1/identity/reset-password. Like forgot-password, this bypasses the
 * generic [...path] proxy (which requires a session) because the caller isn't signed in yet — they
 * arrived via the emailed reset link, which carries token/email/tenant as query params (see
 * UserPasswordService.ForgotPasswordAsync, which builds that link).
 */
export async function POST(request: NextRequest) {
  const csrf = await requireCSRF(request)
  if (csrf) return csrf

  const baseUrl = dotnetBaseUrl()
  if (!baseUrl) return problem(503, "NOT_CONFIGURED", "DOTNET_API_URL is not set")

  const input = (await request.json().catch(() => null)) as {
    email?: string
    token?: string
    password?: string
    tenant?: string
  } | null
  if (!input?.email || !input.token || !input.password) {
    return problem(400, "VALIDATION_ERROR", "Email, token and password are required")
  }

  const pharmacyCode = input.tenant?.trim().toLowerCase()
  const tenant = pharmacyCode && /^[a-z0-9-]{1,64}$/.test(pharmacyCode) ? pharmacyCode : tenantForRequest(request)

  const upstream = await fetch(`${baseUrl}/api/v1/identity/reset-password`, {
    method: "POST",
    headers: dotnetHeaders(tenant, { "Content-Type": "application/json" }),
    body: JSON.stringify({ email: input.email, token: input.token, password: input.password }),
  })

  if (!upstream.ok) {
    const body = await upstream.json().catch(() => null)
    return NextResponse.json(problemToNormalizedError(upstream.status, body), { status: upstream.status })
  }

  return NextResponse.json({ ok: true })
}
