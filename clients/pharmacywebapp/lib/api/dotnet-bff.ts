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
import { createSession, deleteSession } from "@/lib/api/dotnet-token-store"

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
 * Tenant for ANONYMOUS BFF routes (register, forgot/reset password): derived from the request host only.
 * The x-target-tenant override is a SuperAdmin convenience for authenticated calls; an anonymous caller
 * must never be able to point a request at an arbitrary tenant with it.
 */
export function tenantForAnonymousRequest(request: NextRequest): string {
  return tenantForHost(request.headers.get("host"))
}

/** How many trusted reverse proxies sit in front of this app (nginx-proxy / Caddy = 1). */
function trustedProxyHops(): number {
  const raw = Number.parseInt(process.env.TRUSTED_PROXY_HOPS ?? "1", 10)
  return Number.isFinite(raw) && raw >= 0 ? raw : 1
}

const IP_PATTERN = /^[0-9a-f:.]{2,45}$/i

/**
 * The browser's IP as seen by our edge proxy. Proxies APPEND to X-Forwarded-For, so the trustworthy
 * entry is the one our own proxy added — counted from the right — never the client-controlled leftmost.
 * Falls back to X-Real-IP (nginx sets it). Returns null when nothing usable is present (local dev).
 */
export function clientIpFromHeaders(headers: Pick<Headers, "get">): string | null {
  const hops = trustedProxyHops()
  const chain = (headers.get("x-forwarded-for") ?? "")
    .split(",")
    .map((part) => part.trim())
    .filter(Boolean)
  if (hops > 0 && chain.length >= hops) {
    const candidate = chain[chain.length - hops]
    if (IP_PATTERN.test(candidate)) return candidate
  }
  const realIp = headers.get("x-real-ip")?.trim()
  return realIp && IP_PATTERN.test(realIp) ? realIp : null
}

/** X-Forwarded-For header for an upstream .NET call (the API trusts it only from private networks). */
export function forwardedForHeaders(headers: Pick<Headers, "get">): Record<string, string> {
  const ip = clientIpFromHeaders(headers)
  return ip ? { "X-Forwarded-For": ip } : {}
}

/**
 * Creates a server-side session for this token pair (a fresh login) and sets ONLY the small opaque
 * session id as a cookie — never the raw JWT (see dotnet-token-store.ts for why). Token rotation of an
 * existing session goes through dotnet-session-refresh.ts (compare-and-set on the old refresh token), never
 * through here. The cookie's lifetime matches the refresh token's expiry.
 */
export async function applyTokenCookies(response: NextResponse, tokens: TokenPair, secure: boolean) {
  const sessionId = await createSession(tokens)
  response.cookies.set(SESSION_ID_COOKIE, sessionId, sessionCookieOptions(tokens.refreshTokenExpiresAt, secure))
  return response
}

/** Clears only the session cookie (the store entry was already handled, e.g. by a conditional delete). */
export function clearSessionCookie(response: NextResponse) {
  response.cookies.delete(SESSION_ID_COOKIE)
  return response
}

/** Deletes the session's store entry (when a session id is known) and clears the session cookie. */
export async function clearTokenCookies(response: NextResponse, sessionId?: string | null) {
  await deleteSession(sessionId)
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

/** Upstream response headers that are safe and useful to pass through to the browser. */
const PASSTHROUGH_RESPONSE_HEADERS = [
  "content-type",
  "content-disposition",
  "cache-control",
  "etag",
  "last-modified",
  "retry-after",
  "x-subscription-grace",
  "idempotency-replayed",
] as const

/**
 * Browser response headers for a proxied .NET response. Content-Length is only forwarded when the
 * upstream body was not content-encoded: fetch transparently decompresses, so an encoded length would
 * truncate the body. Content-Encoding itself is never forwarded for the same reason.
 */
export function passthroughHeaders(upstream: Headers): Headers {
  const headers = new Headers()
  for (const name of PASSTHROUGH_RESPONSE_HEADERS) {
    const value = upstream.get(name)
    if (value) headers.set(name, value)
  }
  if (!headers.has("content-type")) headers.set("content-type", "application/json")
  const length = upstream.get("content-length")
  if (length && !upstream.get("content-encoding")) headers.set("content-length", length)
  return headers
}

const API_PREFIX = "/api/v1/"

/**
 * Builds the upstream URL for the catch-all path, or null when it would escape /api/v1/. Next hands us
 * DECODED segments, so "%2e%2e" arrives as ".." — and encodeURIComponent leaves "." / ".." untouched, which
 * the URL parser then resolves (/api/v1/../../hangfire → /hangfire). Such segments are rejected outright, and
 * the final pathname is re-checked as a belt-and-braces guard.
 */
export function upstreamTarget(baseUrl: string, path: string[], search: string): string | null {
  if (path.length === 0 || path.some((segment) => segment === "" || segment === "." || segment === "..")) return null
  const target = `${baseUrl}${API_PREFIX}${path.map(encodeURIComponent).join("/")}${search}`
  try {
    const parsed = new URL(target)
    const base = new URL(baseUrl)
    if (parsed.origin !== base.origin || !parsed.pathname.startsWith(`${base.pathname.replace(/\/+$/, "")}${API_PREFIX}`)) return null
  } catch {
    return null
  }
  return target
}
