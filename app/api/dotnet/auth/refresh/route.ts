import { NextResponse } from "next/server"
import type { NextRequest } from "next/server"
import { requireCSRF } from "@/lib/api/auth-middleware"
import { ACCESS_COOKIE, REFRESH_COOKIE, refreshTokens } from "@/lib/api/dotnet-session"
import { applyTokenCookies, clearTokenCookies, dotnetBaseUrl, isSecureRequest, problem, tenantForRequest } from "@/lib/api/dotnet-bff"

export async function POST(request: NextRequest) {
  const csrf = await requireCSRF(request)
  if (csrf) return csrf

  const baseUrl = dotnetBaseUrl()
  if (!baseUrl) return problem(503, "NOT_CONFIGURED", "DOTNET_API_URL is not set")

  const accessToken = request.cookies.get(ACCESS_COOKIE)?.value
  const refreshToken = request.cookies.get(REFRESH_COOKIE)?.value
  if (!accessToken || !refreshToken) return problem(401, "UNAUTHENTICATED", "No session")

  const tokens = await refreshTokens({ baseUrl, tenant: tenantForRequest(request) }, { accessToken, refreshToken })
  if (!tokens) return clearTokenCookies(problem(401, "UNAUTHENTICATED", "Session expired"))
  return applyTokenCookies(NextResponse.json({ ok: true }), tokens, isSecureRequest(request))
}
