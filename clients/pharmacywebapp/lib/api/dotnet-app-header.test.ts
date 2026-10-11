import { describe, expect, it, vi } from "vitest"
import {
  ADMIN_APP,
  DASHBOARD_APP,
  ROLE_CLAIM_URI,
  appForAccessToken,
  appForSession,
  homePathForUser,
  isAppBoundaryProblem,
  isSuperAdmin,
  refreshTokens,
  sessionUserFromClaims,
  type DotnetSessionUser,
} from "@/lib/api/dotnet-session"

function jwtWith(claims: Record<string, unknown>): string {
  const enc = (value: object) => Buffer.from(JSON.stringify(value)).toString("base64url")
  return `${enc({ alg: "none" })}.${enc(claims)}.sig`
}

const superadmin: DotnetSessionUser = {
  id: "u-root",
  tenantId: "root",
  role: "Admin",
  roles: ["Admin"],
  permissions: ["Platform.Tenants.View"],
}

const tenantAdmin: DotnetSessionUser = {
  id: "u-acme",
  tenantId: "acme",
  role: "Admin",
  roles: ["Admin"],
  permissions: ["Permissions.Users.View"],
}

describe("appForSession", () => {
  it("uses the admin app for a root-tenant SuperAdmin", () => {
    expect(appForSession(superadmin)).toBe(ADMIN_APP)
  })

  it("uses the dashboard app for a tenant admin, even with the same role name", () => {
    expect(appForSession(tenantAdmin)).toBe(DASHBOARD_APP)
  })

  it("uses the dashboard app for a root user without the admin role or platform permissions", () => {
    expect(appForSession({ ...superadmin, roles: ["Viewer"], permissions: [] })).toBe(DASHBOARD_APP)
  })

  it("uses the dashboard app when there is no session", () => {
    expect(appForSession(null)).toBe(DASHBOARD_APP)
    expect(appForSession(undefined)).toBe(DASHBOARD_APP)
  })

  it("matches the tenant and role case-insensitively", () => {
    expect(isSuperAdmin({ ...superadmin, tenantId: "ROOT", roles: ["admin"] })).toBe(true)
  })
})

describe("appForAccessToken", () => {
  it("reads the role and tenant claims of an access token", () => {
    const token = jwtWith({ sub: "u-root", tenant: "root", [ROLE_CLAIM_URI]: "Admin", permission: ["Platform.Tenants.View"] })
    expect(appForAccessToken(token)).toBe(ADMIN_APP)
  })

  it("falls back to dashboard for a missing or undecodable token", () => {
    expect(appForAccessToken(undefined)).toBe(DASHBOARD_APP)
    expect(appForAccessToken("not-a-jwt")).toBe(DASHBOARD_APP)
  })

  it("keeps a tenant admin token on the dashboard app", () => {
    const token = jwtWith({ sub: "u-acme", tenant: "acme", [ROLE_CLAIM_URI]: "Admin" })
    expect(appForAccessToken(token)).toBe(DASHBOARD_APP)
    expect(sessionUserFromClaims({ sub: "u-acme", tenant: "acme" })?.tenantId).toBe("acme")
  })
})

describe("refreshTokens app header", () => {
  it("sends the admin app header when the session is a SuperAdmin session", async () => {
    const fetchImpl = vi.fn(
      async () => new Response(JSON.stringify({ token: "a", refreshToken: "r", refreshTokenExpiryTime: "2030-01-01T00:00:00Z" }), { status: 200 }),
    )
    await refreshTokens({ baseUrl: "https://api.test", tenant: "root", app: ADMIN_APP, fetchImpl }, { accessToken: "a", refreshToken: "r" })
    const [, init] = fetchImpl.mock.calls[0] as unknown as [string, RequestInit]
    expect((init.headers as Record<string, string>)["X-FSH-App"]).toBe("admin")
  })

  it("defaults to the dashboard app header", async () => {
    const fetchImpl = vi.fn(
      async () => new Response(JSON.stringify({ token: "a", refreshToken: "r", refreshTokenExpiryTime: "2030-01-01T00:00:00Z" }), { status: 200 }),
    )
    await refreshTokens({ baseUrl: "https://api.test", tenant: "acme", fetchImpl }, { accessToken: "a", refreshToken: "r" })
    const [, init] = fetchImpl.mock.calls[0] as unknown as [string, RequestInit]
    expect((init.headers as Record<string, string>)["X-FSH-App"]).toBe("dashboard")
  })
})

describe("isAppBoundaryProblem", () => {
  it("recognises the App boundary ProblemDetails title only", () => {
    expect(isAppBoundaryProblem({ title: "App boundary", status: 403 })).toBe(true)
    expect(isAppBoundaryProblem({ title: "Forbidden", status: 403 })).toBe(false)
    expect(isAppBoundaryProblem(null)).toBe(false)
  })
})

describe("routing for SuperAdmin", () => {
  it("sends every role to the same dashboard home after sign-in; there is no separate SuperAdmin area", () => {
    expect(homePathForUser(superadmin)).toBe("/dashboard")
    expect(homePathForUser(tenantAdmin)).toBe("/dashboard")
    expect(homePathForUser(null)).toBe("/dashboard")
  })
})
