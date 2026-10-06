/**
 * Server-side session for the .NET API. Tokens live only in httpOnly cookies set by the BFF routes
 * under app/api/dotnet, so browser JavaScript never sees a bearer token.
 */

export const ACCESS_COOKIE = "fsh_access"
export const REFRESH_COOKIE = "fsh_refresh"
export const DASHBOARD_APP_HEADER = "X-FSH-App"
export const DASHBOARD_APP = "dashboard"

/** Refresh when the access token has less than this left, so a request never starts with a dying token. */
export const REFRESH_SKEW_MS = 30_000

export interface TokenPair {
  accessToken: string
  refreshToken: string
  refreshTokenExpiresAt: Date
}

export function sessionCookieOptions(expires: Date, secure: boolean) {
  return { httpOnly: true, sameSite: "lax" as const, secure, path: "/", expires }
}

/** Reads the `exp` claim of a JWT without verifying it. Only used to schedule refresh, never to trust. */
export function jwtExpiry(token: string): Date | null {
  const payload = token.split(".")[1]
  if (!payload) return null
  try {
    const json = JSON.parse(Buffer.from(payload.replace(/-/g, "+").replace(/_/g, "/"), "base64").toString("utf8")) as {
      exp?: unknown
    }
    return typeof json.exp === "number" ? new Date(json.exp * 1000) : null
  } catch {
    return null
  }
}

export function needsRefresh(accessToken: string, now: Date = new Date()): boolean {
  const expiry = jwtExpiry(accessToken)
  return !expiry || expiry.getTime() - now.getTime() < REFRESH_SKEW_MS
}

export function tenantFromHost(host: string | null, rootDomain: string | null): string {
  const root = rootDomain?.trim().toLowerCase().split(":")[0]
  const name = host?.split(":")[0]?.toLowerCase() ?? ""
  if (root && name.endsWith(`.${root}`) && !name.slice(0, -(root.length + 1)).includes(".")) {
    return name.slice(0, -(root.length + 1))
  }
  return "root"
}

export interface DotnetIdentityOptions {
  baseUrl: string
  tenant: string
  fetchImpl?: typeof fetch
}

/** Calls the .NET refresh endpoint. Returns null when the refresh token is rejected. */
export async function refreshTokens(
  options: DotnetIdentityOptions,
  current: { accessToken: string; refreshToken: string },
): Promise<TokenPair | null> {
  const fetchImpl = options.fetchImpl ?? fetch
  const res = await fetchImpl(`${options.baseUrl}/api/v1/identity/token/refresh`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      tenant: options.tenant,
      [DASHBOARD_APP_HEADER]: DASHBOARD_APP,
    },
    body: JSON.stringify({ token: current.accessToken, refreshToken: current.refreshToken }),
  })
  if (!res.ok) return null
  const body = (await res.json()) as { token: string; refreshToken: string; refreshTokenExpiryTime: string }
  return {
    accessToken: body.token,
    refreshToken: body.refreshToken,
    refreshTokenExpiresAt: new Date(body.refreshTokenExpiryTime),
  }
}

/** Full-URI role claim type that .NET writes for ClaimTypes.Role. */
export const ROLE_CLAIM_URI = "http://schemas.microsoft.com/ws/2008/06/identity/claims/role"

export type JwtClaims = Record<string, unknown>

/**
 * Decodes a JWT payload without verifying the signature. Trust comes from the BFF having issued the
 * cookie, so this is only for reading claims. Uses atob/TextDecoder so it also runs in the edge middleware.
 */
export function decodeJwtClaims(token: string): JwtClaims | null {
  const payload = token.split(".")[1]
  if (!payload) return null
  try {
    const base64 = payload.replace(/-/g, "+").replace(/_/g, "/").padEnd(Math.ceil(payload.length / 4) * 4, "=")
    const bytes = Uint8Array.from(atob(base64), (char) => char.charCodeAt(0))
    const json: unknown = JSON.parse(new TextDecoder().decode(bytes))
    return json !== null && typeof json === "object" && !Array.isArray(json) ? (json as JwtClaims) : null
  } catch {
    return null
  }
}

function stringList(value: unknown): string[] {
  if (typeof value === "string") return value ? [value] : []
  if (Array.isArray(value)) return value.filter((item): item is string => typeof item === "string" && item.length > 0)
  return []
}

export interface DotnetSessionUser {
  id: string
  tenantId: string | null
  /** First role in the token, or null when the token carries none. */
  role: string | null
  roles: string[]
  permissions: string[]
}

/** Maps verified-by-issuer claims to the user shape. Returns null when the subject claim is missing. */
export function sessionUserFromClaims(claims: JwtClaims | null): DotnetSessionUser | null {
  if (!claims || typeof claims.sub !== "string" || claims.sub.length === 0) return null
  const roles = [...new Set([...stringList(claims[ROLE_CLAIM_URI]), ...stringList(claims.role), ...stringList(claims.roles)])]
  return {
    id: claims.sub,
    tenantId: typeof claims.tenant === "string" && claims.tenant.length > 0 ? claims.tenant : null,
    role: roles[0] ?? null,
    roles,
    permissions: stringList(claims.permission),
  }
}

/** Prefix of the Identity Users resource permissions (Permissions.Users.View, .Search, ...). */
export const TENANT_USER_PERMISSION_PREFIX = "Permissions.Users."

/**
 * Tenant dashboard gate for the .NET path. The token's tenant claim must match the slug in the URL or the
 * tenant resolved from the host, and the caller must hold at least one tenant-user permission.
 * Comparison is case-insensitive. Pure: no I/O.
 */
export function canAccessTenantDashboard(
  user: Pick<DotnetSessionUser, "tenantId" | "permissions">,
  slug: string,
  hostTenant: string | null,
): boolean {
  const claim = user.tenantId?.trim().toLowerCase() ?? ""
  const target = slug.trim().toLowerCase()
  if (!claim || !target) return false
  const host = hostTenant?.trim().toLowerCase() ?? ""
  if (claim !== target && claim !== host) return false
  return user.permissions.some((permission) => permission.startsWith(TENANT_USER_PERMISSION_PREFIX))
}
