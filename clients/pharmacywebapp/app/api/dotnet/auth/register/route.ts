import { NextResponse } from "next/server"
import type { NextRequest } from "next/server"
import { requireCSRF } from "@/lib/api/auth-middleware"
import { problemToNormalizedError } from "@/lib/api/dotnet-problem"
import { dotnetBaseUrl, dotnetHeaders, problem, tenantForRequest } from "@/lib/api/dotnet-bff"

/**
 * Self-registration BFF. Forwards to the .NET anonymous endpoint POST /api/v1/identity/self-register,
 * scoped by the tenant header derived from the request host. The new account is unconfirmed, so this
 * route sets no session cookies; the user signs in after confirming the email link.
 */
export async function POST(request: NextRequest) {
  const csrf = await requireCSRF(request)
  if (csrf) return csrf

  const baseUrl = dotnetBaseUrl()
  if (!baseUrl) return problem(503, "NOT_CONFIGURED", "DOTNET_API_URL is not set")

  const input = (await request.json().catch(() => null)) as {
    firstName?: string
    lastName?: string
    email?: string
    userName?: string
    password?: string
    phoneNumber?: string | null
  } | null
  if (!input?.email || !input.password) return problem(400, "VALIDATION_ERROR", "Email and password are required")

  const upstream = await fetch(`${baseUrl}/api/v1/identity/self-register`, {
    method: "POST",
    headers: dotnetHeaders(tenantForRequest(request), { "Content-Type": "application/json" }),
    body: JSON.stringify({
      firstName: input.firstName ?? "",
      lastName: input.lastName ?? "",
      email: input.email,
      userName: input.userName ?? input.email,
      password: input.password,
      confirmPassword: input.password,
      phoneNumber: input.phoneNumber ?? null,
    }),
  })

  if (!upstream.ok) {
    const body = await upstream.json().catch(() => null)
    return NextResponse.json(problemToNormalizedError(upstream.status, body), { status: upstream.status })
  }

  const body = (await upstream.json().catch(() => null)) as { userId?: string } | null
  return NextResponse.json({ ok: true, userId: body?.userId ?? null }, { status: 201 })
}
