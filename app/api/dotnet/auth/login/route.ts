import { NextResponse } from "next/server"
import type { NextRequest } from "next/server"
import { requireCSRF } from "@/lib/api/auth-middleware"
import { problemToNormalizedError } from "@/lib/api/dotnet-problem"
import { applyTokenCookies, dotnetBaseUrl, dotnetHeaders, isSecureRequest, problem, tenantForRequest } from "@/lib/api/dotnet-bff"
import type { TokenPair } from "@/lib/api/dotnet-session"

export async function POST(request: NextRequest) {
  const csrf = await requireCSRF(request)
  if (csrf) return csrf

  const baseUrl = dotnetBaseUrl()
  if (!baseUrl) return problem(503, "NOT_CONFIGURED", "DOTNET_API_URL is not set")

  const input = (await request.json().catch(() => null)) as { email?: string; password?: string; twoFactorCode?: string } | null
  if (!input?.email || !input.password) return problem(400, "VALIDATION_ERROR", "Email and password are required")

  const upstream = await fetch(`${baseUrl}/api/v1/identity/token/issue`, {
    method: "POST",
    headers: dotnetHeaders(tenantForRequest(request), { "Content-Type": "application/json" }),
    body: JSON.stringify({ email: input.email, password: input.password, twoFactorCode: input.twoFactorCode ?? null }),
  })

  if (!upstream.ok) {
    const body = await upstream.json().catch(() => null)
    return NextResponse.json(problemToNormalizedError(upstream.status, body), { status: upstream.status })
  }

  const body = (await upstream.json()) as {
    accessToken: string
    refreshToken: string
    refreshTokenExpiresAt: string
  }
  const tokens: TokenPair = {
    accessToken: body.accessToken,
    refreshToken: body.refreshToken,
    refreshTokenExpiresAt: new Date(body.refreshTokenExpiresAt),
  }
  return applyTokenCookies(NextResponse.json({ ok: true }), tokens, isSecureRequest(request))
}
