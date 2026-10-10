import { NextResponse } from "next/server"
import type { NextRequest } from "next/server"
import { getTenantCodeFromHost, getTenantRootDomainFromEnv } from "@/lib/tenant-host"
import { problemToNormalizedError } from "@/lib/api/dotnet-problem"
import { TENANT_OVERRIDE_HEADER } from "@/lib/api/tenant-override-header"
import {
  DASHBOARD_APP,
  DASHBOARD_APP_HEADER,
  SESSION_ID_COOKIE,
  type DotnetAppName,
  sessionCookieOptions,
  tenantFromHost,
  type TokenPair,
} from "@/lib/api/dotnet-session"
import { createSession, deleteSession, updateSession } from "@/lib/api/dotnet-token-store"

export function dotnetBaseUrl(): string | null {
  const raw = process.env.DOTNET_API_URL?.trim()
  return raw ? raw.replace(/\/+$/, "") : null
}

export function problem(status: number, code: string, message: string) {
  return NextResponse.json({ type: "about:blank", title: code, status, detail: message }, { status })
}

export function tenantForHost(host: string | null): string {
  const fromHost = getTenantCodeFromHost(host, getTenantRootDomainFromEnv())
  return fromHost ?? tenantFromHost(host, getTenantRootDomainFromEnv())
}

/**
 * Browser-sent header letting a root-tenant (SuperAdmin) session scope one BFF call to a specific
 * tenant's database, instead of the tenant the request host would normally resolve to (always "root"
 * on the admin host). This only ever changes which tenant header this proxy forwards upstream — the
 * .NET API re-derives the caller's own identity from the (unchanged) bearer token and only honors the
 * override when that caller's JWT "tenant" claim is "root" (see MultitenancyModule's root-operator
 * header-override middleware). A non-root caller sending this header is simply ignored server-side, so
 * trusting it here without re-checking the caller's role is safe.
 */
export function tenantForRequest(request: NextRequest): string {
  const override = request.headers.get(TENANT_OVERRIDE_HEADER)?.trim()
  return override || tenantForHost(request.headers.get("host"))
}

/**
 * Creates or updates a server-side session for this token pair and sets ONLY the small opaque
 * session id as a cookie — never the raw JWT (see dotnet-token-store.ts for why). Pass the request's
 * existing session id (if any) to rotate an existing session in place; omit it on a fresh login to
 * create a new one. The cookie's lifetime matches the refresh token's expiry.
 */
export function applyTokenCookies(
  response: NextResponse,
  tokens: TokenPair,
  secure: boolean,
  existingSessionId?: string | null,
) {
  let sessionId: string
  if (existingSessionId) {
    updateSession(existingSessionId, tokens)
    sessionId = existingSessionId
  } else {
    sessionId = createSession(tokens)
  }
  response.cookies.set(SESSION_ID_COOKIE, sessionId, sessionCookieOptions(tokens.refreshTokenExpiresAt, secure))
  return response
}

/** Deletes the session's store entry (when a session id is known) and clears the session cookie. */
export function clearTokenCookies(response: NextResponse, sessionId?: string | null) {
  deleteSession(sessionId)
  response.cookies.delete(SESSION_ID_COOKIE)
  return response
}

/**
 * Headers for a call to the .NET API. The app header must match the session: pass appForSession(user)
 * or appForAccessToken(token). It defaults to dashboard for the normal tenant path.
 */
export function dotnetHeaders(
  tenant: string,
  extra: Record<string, string> = {},
  app: DotnetAppName = DASHBOARD_APP,
): Record<string, string> {
  return { tenant, [DASHBOARD_APP_HEADER]: app, ...extra }
}

export const isSecureRequest = (request: NextRequest) => request.nextUrl.protocol === "https:"
