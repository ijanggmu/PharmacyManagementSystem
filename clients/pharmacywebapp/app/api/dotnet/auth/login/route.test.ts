import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"
import { NextRequest } from "next/server"

vi.mock("@/lib/api/auth-middleware", () => ({ requireCSRF: async () => null }))

import { POST } from "@/app/api/dotnet/auth/login/route"

const ACCESS = (() => {
  const enc = (value: object) => Buffer.from(JSON.stringify(value)).toString("base64url")
  return `${enc({ alg: "none" })}.${enc({ sub: "u-root", tenant: "root", exp: 1_900_000_000 })}.sig`
})()

function loginRequest(tenant: string): NextRequest {
  return new NextRequest("http://localhost:3100/api/dotnet/auth/login", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ email: "admin@root.com", password: "123Pa$$word!", tenant }),
  })
}

const appBoundary = () =>
  new Response(JSON.stringify({ title: "App boundary", status: 403, detail: "SuperAdmin accounts must use the admin app." }), {
    status: 403,
    headers: { "content-type": "application/problem+json" },
  })

const issued = () =>
  new Response(
    JSON.stringify({ accessToken: ACCESS, refreshToken: "refresh-1", refreshTokenExpiresAt: "2030-01-01T00:00:00Z" }),
    { status: 200, headers: { "content-type": "application/json" } },
  )

describe("POST /api/dotnet/auth/login SuperAdmin retry", () => {
  beforeEach(() => {
    process.env.DOTNET_API_URL = "https://api.test"
  })

  afterEach(() => {
    vi.unstubAllGlobals()
    vi.restoreAllMocks()
  })

  it("retries a dashboard App boundary refusal with the admin app and root tenant, then sets cookies", async () => {
    const fetchMock = vi.fn().mockResolvedValueOnce(appBoundary()).mockResolvedValueOnce(issued())
    vi.stubGlobal("fetch", fetchMock)

    const res = await POST(loginRequest("root"))

    expect(fetchMock).toHaveBeenCalledTimes(2)
    const [firstUrl, firstInit] = fetchMock.mock.calls[0] as [string, RequestInit]
    const [secondUrl, secondInit] = fetchMock.mock.calls[1] as [string, RequestInit]
    expect(firstUrl).toBe("https://api.test/api/v1/identity/token/issue")
    expect((firstInit.headers as Record<string, string>)["X-FSH-App"]).toBe("dashboard")
    expect(secondUrl).toBe("https://api.test/api/v1/identity/token/issue")
    expect((secondInit.headers as Record<string, string>)["X-FSH-App"]).toBe("admin")
    expect((secondInit.headers as Record<string, string>).tenant).toBe("root")
    expect(JSON.parse(String(secondInit.body))).toMatchObject({ email: "admin@root.com", password: "123Pa$$word!" })

    expect(res.status).toBe(200)
    // The raw JWT is never put in a cookie (it can exceed the browser's ~4KB cookie limit for a
    // heavily-permissioned role); only a small opaque session id is set, with the real tokens kept
    // server-side in the token store. See lib/api/dotnet-token-store.ts.
    const sid = res.cookies.get("fsh_sid")?.value
    expect(sid).toBeTruthy()
    expect(sid!.length).toBeLessThan(200)
  })

  it("does not retry a 403 that is not the App boundary refusal", async () => {
    const fetchMock = vi.fn().mockResolvedValueOnce(
      new Response(JSON.stringify({ title: "Forbidden", status: 403, detail: "Account locked" }), {
        status: 403,
        headers: { "content-type": "application/problem+json" },
      }),
    )
    vi.stubGlobal("fetch", fetchMock)

    const res = await POST(loginRequest("acme"))

    expect(fetchMock).toHaveBeenCalledTimes(1)
    expect(res.status).toBe(403)
  })

  it("forwards a trimmed recovery code to the token endpoint", async () => {
    const fetchMock = vi.fn().mockResolvedValueOnce(issued())
    vi.stubGlobal("fetch", fetchMock)

    const req = new NextRequest("http://localhost:3100/api/dotnet/auth/login", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ email: "a@acme.co", password: "pw", tenant: "acme", recoveryCode: " ABCDE-FGHJK " }),
    })
    const res = await POST(req)

    const [, init] = fetchMock.mock.calls[0] as unknown as [string, RequestInit]
    expect(JSON.parse(String(init.body))).toMatchObject({ twoFactorCode: null, recoveryCode: "ABCDE-FGHJK" })
    expect(res.status).toBe(200)
  })

  it("keeps the normal pharmacy path on the dashboard header with a single call", async () => {
    const fetchMock = vi.fn().mockResolvedValueOnce(issued())
    vi.stubGlobal("fetch", fetchMock)

    const res = await POST(loginRequest("acme"))

    expect(fetchMock).toHaveBeenCalledTimes(1)
    const [, init] = fetchMock.mock.calls[0] as unknown as [string, RequestInit]
    expect((init.headers as Record<string, string>)["X-FSH-App"]).toBe("dashboard")
    expect((init.headers as Record<string, string>).tenant).toBe("acme")
    expect(res.status).toBe(200)
  })
})
