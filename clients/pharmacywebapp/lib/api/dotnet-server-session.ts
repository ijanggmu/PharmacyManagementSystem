/**
 * Server-only (Server Components, route handlers, requireAuth) read of the .NET session.
 * Reads the httpOnly fsh_sid cookie, looks up the token pair in the server-side token store
 * (see dotnet-token-store.ts), refreshes through the .NET refresh call when the access token is
 * close to expiry — updating the store in place — and returns the claims. Signatures are not
 * verified here; the .NET API still validates the bearer on every proxied call.
 */

import { cookies, headers } from "next/headers"
import {
  SESSION_ID_COOKIE,
  appForAccessToken,
  decodeJwtClaims,
  sessionUserFromClaims,
  type DotnetSessionUser,
} from "@/lib/api/dotnet-session"
import { clientIpFromHeaders, dotnetBaseUrl, dotnetHeaders, forwardedForHeaders, tenantForHost } from "@/lib/api/dotnet-bff"
import { resolveSessionTokens } from "@/lib/api/dotnet-session-refresh"

export interface DotnetSession {
  user: DotnetSessionUser
}

interface ResolvedAccessToken {
  token: string
}

/**
 * Returns a usable access token for the current session, refreshing it (and updating the store in
 * place) when it is near expiry. Returns null when signed out, the session id is unknown to the
 * store (e.g. after a server restart), or the refresh token was rejected.
 */
async function resolveAccessToken(): Promise<ResolvedAccessToken | null> {
  const sid = (await cookies()).get(SESSION_ID_COOKIE)?.value
  const requestHeaders = await headers()
  // Single-flight refresh with the session's own tenant (see dotnet-session-refresh.ts).
  const resolved = await resolveSessionTokens(sid, {
    baseUrl: dotnetBaseUrl(),
    fallbackTenant: tenantForHost(requestHeaders.get("host")),
    clientIp: clientIpFromHeaders(requestHeaders),
  })
  return resolved.status === "ok" ? { token: resolved.tokens.accessToken } : null
}

/**
 * Returns the current .NET session user, or null when signed out or the refresh token was rejected.
 * Refreshing here updates the shared token store directly, so there is nothing for the caller to write
 * back — Server Components, route handlers and middleware all read the same store.
 */
export async function getDotnetSession(): Promise<DotnetSession | null> {
  const resolved = await resolveAccessToken()
  if (!resolved) return null
  const user = sessionUserFromClaims(decodeJwtClaims(resolved.token))
  return user ? { user } : null
}

/**
 * Server-only GET against the .NET API (/api/v1 + path) with the caller's bearer, the same headers the
 * BFF proxy sends. Use it from Server Components and server services, where the browser BFF path
 * (/api/dotnet) is not reachable. Throws when signed out or when the .NET call fails.
 * A token rotated here updates the shared token store directly, so no cookie write is needed.
 */
export async function dotnetServerGet<T>(path: string): Promise<T> {
  const baseUrl = dotnetBaseUrl()
  const resolved = await resolveAccessToken()
  if (!baseUrl || !resolved) throw new Error("Not signed in to the .NET API")
  const requestHeaders = await headers()
  const tenant = tenantForHost(requestHeaders.get("host"))
  const res = await fetch(`${baseUrl}/api/v1${path.startsWith("/") ? path : `/${path}`}`, {
    headers: dotnetHeaders(
      tenant,
      { Accept: "application/json", Authorization: `Bearer ${resolved.token}`, ...forwardedForHeaders(requestHeaders) },
      appForAccessToken(resolved.token),
    ),
    cache: "no-store",
  })
  if (!res.ok) throw new Error(`.NET API returned ${res.status} for ${path}`)
  return (await res.json()) as T
}

/**
 * Server-only POST against the .NET API (/api/v1 + path) with the caller's bearer. Same contract as
 * dotnetServerGet. Use it for commands whose BFF mutation guard (CSRF) already ran in the route handler.
 */
export async function dotnetServerPost<T>(path: string, body: unknown): Promise<T> {
  const baseUrl = dotnetBaseUrl()
  const resolved = await resolveAccessToken()
  if (!baseUrl || !resolved) throw new Error("Not signed in to the .NET API")
  const requestHeaders = await headers()
  const tenant = tenantForHost(requestHeaders.get("host"))
  const res = await fetch(`${baseUrl}/api/v1${path.startsWith("/") ? path : `/${path}`}`, {
    method: "POST",
    headers: dotnetHeaders(
      tenant,
      {
        Accept: "application/json",
        "Content-Type": "application/json",
        Authorization: `Bearer ${resolved.token}`,
        ...forwardedForHeaders(requestHeaders),
      },
      appForAccessToken(resolved.token),
    ),
    body: JSON.stringify(body),
    cache: "no-store",
  })
  if (!res.ok) throw new Error(`.NET API returned ${res.status} for ${path}`)
  return (await res.json()) as T
}
