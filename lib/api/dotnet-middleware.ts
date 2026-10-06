import { NextResponse, type NextRequest } from "next/server"
import { applyTokenCookies, dotnetBaseUrl, isSecureRequest, tenantForHost } from "@/lib/api/dotnet-bff"
import {
  ACCESS_COOKIE,
  REFRESH_COOKIE,
  decodeJwtClaims,
  needsRefresh,
  refreshTokens,
  sessionUserFromClaims,
  type TokenPair,
} from "@/lib/api/dotnet-session"

export interface DotnetMiddlewareOptions {
  /** When set (tenant subdomain), unauthenticated redirects include ?code= for tenant login. */
  tenantCodeFromHost?: string | null
}

/**
 * .NET counterpart of lib/supabase/middleware updateSession, with the same redirect rules.
 * Rotates an expiring access token first, then writes the new cookies to both the browser and the
 * request, so the Server Components rendered in this same request see the fresh token.
 */
export async function updateDotnetSession(request: NextRequest, options?: DotnetMiddlewareOptions) {
  const tenantCodeFromHost = options?.tenantCodeFromHost?.trim().toLowerCase() || null
  const access = request.cookies.get(ACCESS_COOKIE)?.value
  const refresh = request.cookies.get(REFRESH_COOKIE)?.value

  let rotated: TokenPair | null = null
  let user = access && !needsRefresh(access) ? sessionUserFromClaims(decodeJwtClaims(access)) : null
  if (!user && refresh) {
    const baseUrl = dotnetBaseUrl()
    rotated = baseUrl
      ? await refreshTokens(
          { baseUrl, tenant: tenantForHost(request.headers.get("host")) },
          { accessToken: access ?? "", refreshToken: refresh },
        )
      : null
    user = rotated ? sessionUserFromClaims(decodeJwtClaims(rotated.accessToken)) : null
    if (rotated) {
      request.cookies.set(ACCESS_COOKIE, rotated.accessToken)
      request.cookies.set(REFRESH_COOKIE, rotated.refreshToken)
    }
  }

  const finish = (response: NextResponse) =>
    rotated ? applyTokenCookies(response, rotated, isSecureRequest(request)) : response

  const { pathname } = request.nextUrl
  const isAuthRoute =
    pathname.startsWith("/auth/login") ||
    pathname.startsWith("/auth/sign-up") ||
    pathname === "/auth/callback" ||
    /^\/t\/[^/]+\/login$/.test(pathname)
  const isPublicRoute = pathname === "/" || pathname.startsWith("/onboarding")
  const isApiRoute = pathname.startsWith("/api")

  if (user && isAuthRoute) {
    const url = request.nextUrl.clone()
    url.pathname = "/dashboard"
    return finish(NextResponse.redirect(url))
  }

  if (!user && !isAuthRoute && !isPublicRoute && !isApiRoute) {
    const url = request.nextUrl.clone()
    url.pathname = "/"
    url.searchParams.set("auth", "signin")
    if (tenantCodeFromHost) url.searchParams.set("code", tenantCodeFromHost)
    return finish(NextResponse.redirect(url))
  }

  return finish(NextResponse.next({ request }))
}
