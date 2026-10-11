import { NextResponse, type NextRequest } from "next/server"
import { dotnetBaseUrl, tenantForHost } from "@/lib/api/dotnet-bff"
import {
  SESSION_ID_COOKIE,
  appForAccessToken,
  decodeJwtClaims,
  homePathForUser,
  needsRefresh,
  refreshTokens,
  sessionUserFromClaims,
} from "@/lib/api/dotnet-session"
import { getSession, updateSession } from "@/lib/api/dotnet-token-store"

export interface DotnetMiddlewareOptions {
  /** When set (tenant subdomain), unauthenticated redirects include ?code= for tenant login. */
  tenantCodeFromHost?: string | null
}

/**
 * Session guard for the .NET backend, with the redirect rules for auth, public and API routes.
 * Resolves the session from the shared, process-local token store (see dotnet-token-store.ts) via
 * the small opaque `fsh_sid` cookie — the raw JWT is never in a cookie. Rotating an expiring access
 * token updates the store in place under the same session id, so there is nothing to write back
 * into the response: any Server Component rendered later in this same request reads the same store
 * and sees the fresh token immediately.
 */
export async function updateDotnetSession(request: NextRequest, options?: DotnetMiddlewareOptions) {
  const tenantCodeFromHost = options?.tenantCodeFromHost?.trim().toLowerCase() || null
  const sid = request.cookies.get(SESSION_ID_COOKIE)?.value
  const session = getSession(sid)

  let user = session && !needsRefresh(session.accessToken) ? sessionUserFromClaims(decodeJwtClaims(session.accessToken)) : null
  if (!user && session?.refreshToken) {
    const baseUrl = dotnetBaseUrl()
    const rotated = baseUrl
      ? await refreshTokens(
          { baseUrl, tenant: tenantForHost(request.headers.get("host")), app: appForAccessToken(session.accessToken) },
          { accessToken: session.accessToken, refreshToken: session.refreshToken },
        )
      : null
    user = rotated ? sessionUserFromClaims(decodeJwtClaims(rotated.accessToken)) : null
    if (rotated) updateSession(sid as string, rotated)
  }

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
    url.pathname = homePathForUser(user)
    return NextResponse.redirect(url)
  }

  if (!user && !isAuthRoute && !isPublicRoute && !isApiRoute) {
    const url = request.nextUrl.clone()
    url.pathname = "/"
    url.searchParams.set("auth", "signin")
    if (tenantCodeFromHost) url.searchParams.set("code", tenantCodeFromHost)
    return NextResponse.redirect(url)
  }

  return NextResponse.next({ request })
}
