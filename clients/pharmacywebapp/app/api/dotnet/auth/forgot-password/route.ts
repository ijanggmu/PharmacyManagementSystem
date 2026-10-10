import { NextResponse } from "next/server"
import type { NextRequest } from "next/server"
import { requireCSRF } from "@/lib/api/auth-middleware"
import { dotnetBaseUrl, dotnetHeaders, problem, tenantForRequest } from "@/lib/api/dotnet-bff"

/**
 * Anonymous BFF for POST /api/v1/identity/forgot-password. Not routed through the generic
 * [...path] proxy because that proxy requires an authenticated session, and this call happens
 * before sign-in. Scoped by the tenant header the same way login/register resolve it: an explicit
 * pharmacy code from the form, falling back to the request host.
 *
 * Always answers 200 with the same generic body, win or lose — the .NET endpoint itself already
 * no-ops for an unknown email (anti-enumeration), but this route never leaks upstream errors either,
 * so a malformed tenant or a transient upstream failure doesn't reveal anything either.
 */
export async function POST(request: NextRequest) {
  const csrf = await requireCSRF(request)
  if (csrf) return csrf

  const baseUrl = dotnetBaseUrl()
  if (!baseUrl) return problem(503, "NOT_CONFIGURED", "DOTNET_API_URL is not set")

  const input = (await request.json().catch(() => null)) as { email?: string; tenant?: string } | null
  if (!input?.email) return problem(400, "VALIDATION_ERROR", "Email is required")

  const pharmacyCode = input.tenant?.trim().toLowerCase()
  const tenant = pharmacyCode && /^[a-z0-9-]{1,64}$/.test(pharmacyCode) ? pharmacyCode : tenantForRequest(request)

  try {
    await fetch(`${baseUrl}/api/v1/identity/forgot-password`, {
      method: "POST",
      headers: dotnetHeaders(tenant, { "Content-Type": "application/json" }),
      body: JSON.stringify({ email: input.email }),
    })
  } catch {
    // Swallow — the response below is identical whether this succeeded, failed, or the email is unknown.
  }

  return NextResponse.json({ ok: true })
}
