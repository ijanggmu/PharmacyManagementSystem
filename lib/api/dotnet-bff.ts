import { NextResponse } from "next/server"
import type { NextRequest } from "next/server"
import { getTenantCodeFromHost, getTenantRootDomainFromEnv } from "@/lib/tenant-host"
import { problemToNormalizedError } from "@/lib/api/dotnet-problem"
import {
  ACCESS_COOKIE,
  DASHBOARD_APP,
  DASHBOARD_APP_HEADER,
  REFRESH_COOKIE,
  jwtExpiry,
  sessionCookieOptions,
  tenantFromHost,
  type TokenPair,
} from "@/lib/api/dotnet-session"

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

export function tenantForRequest(request: NextRequest): string {
  return tenantForHost(request.headers.get("host"))
}

export function applyTokenCookies(response: NextResponse, tokens: TokenPair, secure: boolean) {
  const accessExpiry = jwtExpiry(tokens.accessToken) ?? new Date(Date.now() + 15 * 60_000)
  response.cookies.set(ACCESS_COOKIE, tokens.accessToken, sessionCookieOptions(accessExpiry, secure))
  response.cookies.set(REFRESH_COOKIE, tokens.refreshToken, sessionCookieOptions(tokens.refreshTokenExpiresAt, secure))
  return response
}

export function clearTokenCookies(response: NextResponse) {
  response.cookies.delete(ACCESS_COOKIE)
  response.cookies.delete(REFRESH_COOKIE)
  return response
}

export function dotnetHeaders(tenant: string, extra: Record<string, string> = {}): Record<string, string> {
  return { tenant, [DASHBOARD_APP_HEADER]: DASHBOARD_APP, ...extra }
}

export const isSecureRequest = (request: NextRequest) => request.nextUrl.protocol === "https:"
