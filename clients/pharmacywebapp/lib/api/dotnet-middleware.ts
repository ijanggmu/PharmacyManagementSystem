import { NextResponse, type NextRequest } from "next/server"
import { clientIpFromHeaders, dotnetBaseUrl, tenantForHost } from "@/lib/api/dotnet-bff"
import { SESSION_ID_COOKIE, decodeJwtClaims, homePathForUser, sessionUserFromClaims } from "@/lib/api/dotnet-session"
import { resolveSessionTokens } from "@/lib/api/dotnet-session-refresh"

export interface DotnetMiddlewareOptions {
  /** When set (tenant subdomain), unauthenticated redirects include ?code= for tenant login. */
  tenantCodeFromHost?: string | null
}

/**
 * Session guard for the .NET backend, with the redirect rules for auth, public and API routes.
 * Resolves the session from the shared token store (see dotnet-token-store.ts) via the small
 * opaque `fsh_sid` cookie — the raw JWT is never in a cookie. Rotating an expiring access
 * token updates the store in place under the same session id, so there is nothing to write back
 * into the response: any Server Component rendered later in this same request reads the same store
 * and sees the fresh token immediately.
 */
/**
 * Landing pages for emailed links (UserRegistrationService / UserPasswordService build them from the
 * configured OriginUrl). The recipient is usually signed out, so these must not bounce to sign-in.
 */
const EMAIL_LINK_ROUTES = ["/auth/confirm-email", "/auth/reset-password", "/reset-password"]

export function isEmailLinkRoute(pathname: string): boolean {
  return EMAIL_LINK_ROUTES.some((route) => pathname === route || pathname === `${route}/`)
}

export async function updateDotnetSession(request: NextRequest, options?: DotnetMiddlewareOptions) {
  const tenantCodeFromHost = options?.tenantCodeFromHost?.trim().toLowerCase() || null
  const sid = request.cookies.get(SESSION_ID_COOKIE)?.value
  // Single-flight refresh with the session's own tenant (see dotnet-session-refresh.ts). A transient
  // API failure ("unavailable") is not treated as signed-out, so the user is not bounced to sign-in.
  const resolved = await resolveSessionTokens(sid, {
    baseUrl: dotnetBaseUrl(),
    fallbackTenant: tenantForHost(request.headers.get("host")),
    clientIp: clientIpFromHeaders(request.headers),
  })
  const user = resolved.status === "ok" ? sessionUserFromClaims(decodeJwtClaims(resolved.tokens.accessToken)) : null
  if (resolved.status === "unavailable") return NextResponse.next({ request })

  const { pathname } = request.nextUrl
  const isAuthRoute =
    pathname.startsWith("/auth/login") ||
    pathname.startsWith("/auth/sign-up") ||
    pathname === "/auth/callback" ||
    /^\/t\/[^/]+\/login$/.test(pathname)
  const isPublicRoute = pathname === "/" || pathname.startsWith("/onboarding") || isEmailLinkRoute(pathname)
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
