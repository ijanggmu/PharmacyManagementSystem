/**
 * Server-side session for the .NET API. Tokens live only in httpOnly cookies set by the BFF routes
 * under app/api/dotnet, so browser JavaScript never sees a bearer token.
 */

/**
 * Legacy cookie names. Tokens are no longer written to these cookies (see dotnet-token-store.ts) —
 * the JWT could exceed the ~4096-byte browser cookie limit for roles with large permission sets,
 * which silently dropped the cookie while login still reported success. The constants are kept only
 * in case anything still references the names; nothing should read or write them as a token holder.
 */
export const ACCESS_COOKIE = "fsh_access"
export const REFRESH_COOKIE = "fsh_refresh"
/** Browser cookie: holds only a short opaque session id, looked up in the server-side token store. */
export const SESSION_ID_COOKIE = "fsh_sid"
export const DASHBOARD_APP_HEADER = "X-FSH-App"
export const DASHBOARD_APP = "dashboard"
export const ADMIN_APP = "admin"
export const ROOT_TENANT = "root"
/** ProblemDetails title the API returns when a root-tenant token is requested with the dashboard header. */
export const APP_BOUNDARY_TITLE = "App boundary"

export type DotnetAppName = typeof DASHBOARD_APP | typeof ADMIN_APP

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
  /** App header of the session's token. Defaults to dashboard. */
  app?: DotnetAppName
  /** Real browser IP, forwarded as X-Forwarded-For so the API rate-limits per client, not per BFF. */
  clientIp?: string | null
  fetchImpl?: typeof fetch
}

/** Thrown when the refresh call failed for a reason other than a rejected token (5xx, 429, network). */
export class RefreshUnavailableError extends Error {
  constructor(readonly status: number | null) {
    super(`Token refresh unavailable${status ? ` (HTTP ${status})` : ""}`)
    this.name = "RefreshUnavailableError"
  }
}

/**
 * Calls the .NET refresh endpoint. Returns null ONLY when the refresh token itself is rejected
 * (400/401/403) — the one case where the session is really over. Transient failures (rate limit,
 * 5xx, network) throw RefreshUnavailableError so callers keep the session instead of logging the
 * user out because the API hiccupped.
 */
export async function refreshTokens(
  options: DotnetIdentityOptions,
  current: { accessToken: string; refreshToken: string },
): Promise<TokenPair | null> {
  const fetchImpl = options.fetchImpl ?? fetch
  const headers: Record<string, string> = {
    "Content-Type": "application/json",
    tenant: options.tenant,
    [DASHBOARD_APP_HEADER]: options.app ?? DASHBOARD_APP,
  }
  if (options.clientIp) headers["X-Forwarded-For"] = options.clientIp
  let res: Response
  try {
    res = await fetchImpl(`${options.baseUrl}/api/v1/identity/token/refresh`, {
      method: "POST",
      headers,
      body: JSON.stringify({ token: current.accessToken, refreshToken: current.refreshToken }),
      cache: "no-store",
    })
  } catch {
    throw new RefreshUnavailableError(null)
  }
  if (res.status === 400 || res.status === 401 || res.status === 403) return null
  if (!res.ok) throw new RefreshUnavailableError(res.status)
  const body = (await res.json()) as { token: string; refreshToken: string; refreshTokenExpiryTime: string }
  return {
    accessToken: body.token,
    refreshToken: body.refreshToken,
    refreshTokenExpiresAt: new Date(body.refreshTokenExpiryTime),
  }
}

/**
 * The tenant a session's token was issued for (its "tenant" claim). Refresh MUST use this, not the
 * request host or a SuperAdmin's per-call tenant override: refresh tokens are tenant-scoped in the API,
 * so refreshing a root session against another tenant fails and logs the operator out.
 */
export function tenantFromAccessToken(token: string | null | undefined): string | null {
  if (!token) return null
  const tenant = decodeJwtClaims(token)?.tenant
  return typeof tenant === "string" && /^[a-z0-9-]{1,64}$/i.test(tenant) ? tenant : null
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

/**
 * SuperAdmin = a root-tenant account with the root Admin role (the backend has no literal "SuperAdmin"
 * role; see SystemPermissions.Platform, which only the root Admin role holds). A platform permission
 * on a root token is accepted as well. Pure: decided from the decoded claims only.
 */
export function isSuperAdmin(
  user: Pick<DotnetSessionUser, "tenantId" | "roles" | "permissions"> | null | undefined,
): boolean {
  if (!user || user.tenantId?.trim().toLowerCase() !== ROOT_TENANT) return false
  const hasAdminRole = user.roles.some((role) => role.trim().toLowerCase() === "admin")
  const hasPlatformPermission = user.permissions.some((permission) => permission.includes("Platform."))
  return hasAdminRole || hasPlatformPermission
}

/** The X-FSH-App value a session's token must be requested and used with: admin for SuperAdmin, else dashboard. */
export function appForSession(user: DotnetSessionUser | null | undefined): DotnetAppName {
  return isSuperAdmin(user) ? ADMIN_APP : DASHBOARD_APP
}

/** Same as appForSession, starting from a raw access token. Undecodable or missing tokens get dashboard. */
export function appForAccessToken(token: string | null | undefined): DotnetAppName {
  if (!token) return DASHBOARD_APP
  return appForSession(sessionUserFromClaims(decodeJwtClaims(token)))
}

/**
 * Where a signed-in user belongs after sign-in. There is no separate SuperAdmin area: a SuperAdmin lands
 * on the same dashboard home as every other role and uses the Tenants nav item for tenant management.
 */
export function homePathForUser(_user: DotnetSessionUser | null | undefined): "/dashboard" {
  return "/dashboard"
}

/** True when a token-issue error body is the API's SuperAdmin app-boundary refusal (403). */
export function isAppBoundaryProblem(body: unknown): boolean {
  return typeof body === "object" && body !== null && (body as { title?: unknown }).title === APP_BOUNDARY_TITLE
}
