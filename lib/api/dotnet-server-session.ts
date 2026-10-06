/**
 * Server-only (Server Components, route handlers, requireAuth) read of the .NET session.
 * Reads the httpOnly fsh_access cookie, refreshes through the BFF refresh call when the token is
 * close to expiry, and returns the claims. Signatures are not verified here; the .NET API still
 * validates the bearer on every proxied call.
 */

import { cookies, headers } from "next/headers"
import {
  ACCESS_COOKIE,
  DASHBOARD_APP_HEADER,
  REFRESH_COOKIE,
  decodeJwtClaims,
  needsRefresh,
  refreshTokens,
  sessionUserFromClaims,
  type DotnetSessionUser,
  type TokenPair,
} from "@/lib/api/dotnet-session"
import { dotnetBaseUrl, dotnetHeaders, tenantForHost } from "@/lib/api/dotnet-bff"

export interface DotnetSession {
  user: DotnetSessionUser
  /** Set only when this call rotated the tokens. Route handlers must write it back to the browser. */
  rotated: TokenPair | null
}

interface ResolvedAccessToken {
  token: string
  /** Set only when this call rotated the tokens. */
  rotated: TokenPair | null
}

/**
 * Returns a usable access token from the cookies, refreshing it when it is near expiry.
 * Returns null when signed out or the refresh token was rejected.
 */
async function resolveAccessToken(): Promise<ResolvedAccessToken | null> {
  const store = await cookies()
  const access = store.get(ACCESS_COOKIE)?.value
  const refresh = store.get(REFRESH_COOKIE)?.value

  if (!access || needsRefresh(access)) {
    const baseUrl = dotnetBaseUrl()
    if (!baseUrl || !refresh) return null
    const rotated = await refreshTokens(
      { baseUrl, tenant: tenantForHost((await headers()).get("host")) },
      { accessToken: access ?? "", refreshToken: refresh },
    )
    if (!rotated) return null
    return { token: rotated.accessToken, rotated }
  }

  return { token: access, rotated: null }
}

/**
 * Returns the current .NET session user, or null when signed out or the refresh token was rejected.
 * In Server Components cookies cannot be written, so a rotation done here is not persisted;
 * the root middleware rotates first and writes the cookies, which makes this path a fallback.
 */
export async function getDotnetSession(): Promise<DotnetSession | null> {
  const resolved = await resolveAccessToken()
  if (!resolved) return null
  const user = sessionUserFromClaims(decodeJwtClaims(resolved.token))
  return user ? { user, rotated: resolved.rotated } : null
}

/**
 * Server-only GET against the .NET API (/api/v1 + path) with the caller's bearer, the same headers the
 * BFF proxy sends. Use it from Server Components and server services, where the browser BFF path
 * (/api/dotnet) is not reachable. Throws when signed out or when the .NET call fails.
 * A token rotated here is not written back to the cookies (Server Components cannot set cookies).
 */
export async function dotnetServerGet<T>(path: string, appHeader?: "admin" | "dashboard"): Promise<T> {
  const baseUrl = dotnetBaseUrl()
  const resolved = await resolveAccessToken()
  if (!baseUrl || !resolved) throw new Error("Not signed in to the .NET API")
  const tenant = tenantForHost((await headers()).get("host"))
  const res = await fetch(`${baseUrl}/api/v1${path.startsWith("/") ? path : `/${path}`}`, {
    headers: dotnetHeaders(tenant, {
      Accept: "application/json",
      Authorization: `Bearer ${resolved.token}`,
      ...(appHeader ? { [DASHBOARD_APP_HEADER]: appHeader } : {}),
    }),
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
  const tenant = tenantForHost((await headers()).get("host"))
  const res = await fetch(`${baseUrl}/api/v1${path.startsWith("/") ? path : `/${path}`}`, {
    method: "POST",
    headers: dotnetHeaders(tenant, {
      Accept: "application/json",
      "Content-Type": "application/json",
      Authorization: `Bearer ${resolved.token}`,
    }),
    body: JSON.stringify(body),
    cache: "no-store",
  })
  if (!res.ok) throw new Error(`.NET API returned ${res.status} for ${path}`)
  return (await res.json()) as T
}
