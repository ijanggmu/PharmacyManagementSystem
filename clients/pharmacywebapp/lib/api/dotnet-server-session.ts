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
  needsRefresh,
  refreshTokens,
  sessionUserFromClaims,
  type DotnetSessionUser,
} from "@/lib/api/dotnet-session"
import { dotnetBaseUrl, dotnetHeaders, tenantForHost } from "@/lib/api/dotnet-bff"
import { getSession, updateSession } from "@/lib/api/dotnet-token-store"

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
  const session = getSession(sid)
  if (!session) return null
  const { accessToken: access, refreshToken: refresh } = session

  if (!access || needsRefresh(access)) {
    const baseUrl = dotnetBaseUrl()
    if (!baseUrl || !refresh) return null
    const rotated = await refreshTokens(
      { baseUrl, tenant: tenantForHost((await headers()).get("host")), app: appForAccessToken(access) },
      { accessToken: access ?? "", refreshToken: refresh },
    )
    if (!rotated) return null
    updateSession(sid as string, rotated)
    return { token: rotated.accessToken }
  }

  return { token: access }
}

/**
 * Returns the current .NET session user, or null when signed out or the refresh token was rejected.
 * Refreshing here updates the shared, process-local token store directly, so there is nothing for
 * the caller to write back — Server Components, route handlers and middleware all read the same Map.
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
  const tenant = tenantForHost((await headers()).get("host"))
  const res = await fetch(`${baseUrl}/api/v1${path.startsWith("/") ? path : `/${path}`}`, {
    headers: dotnetHeaders(
      tenant,
      { Accept: "application/json", Authorization: `Bearer ${resolved.token}` },
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
  const tenant = tenantForHost((await headers()).get("host"))
  const res = await fetch(`${baseUrl}/api/v1${path.startsWith("/") ? path : `/${path}`}`, {
    method: "POST",
    headers: dotnetHeaders(
      tenant,
      {
        Accept: "application/json",
        "Content-Type": "application/json",
        Authorization: `Bearer ${resolved.token}`,
      },
      appForAccessToken(resolved.token),
    ),
    body: JSON.stringify(body),
    cache: "no-store",
  })
  if (!res.ok) throw new Error(`.NET API returned ${res.status} for ${path}`)
  return (await res.json()) as T
}
