import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"
import { NextRequest } from "next/server"

vi.mock("@/lib/api/auth-middleware", () => ({ requireCSRF: async () => null }))

import { GET, POST } from "@/app/api/dotnet/[...path]/route"
import { createMemoryBackend, createSession, setSessionBackendForTests } from "@/lib/api/dotnet-token-store"

const jwt = (claims: Record<string, unknown>) => {
  const enc = (value: object) => Buffer.from(JSON.stringify(value)).toString("base64url")
  return `${enc({ alg: "none" })}.${enc(claims)}.sig`
}
const later = new Date(Date.now() + 7 * 24 * 3600 * 1000)
const context = (...path: string[]) => ({ params: Promise.resolve({ path }) })

describe("BFF proxy /api/dotnet/[...path]", () => {
  beforeEach(() => {
    process.env.DOTNET_API_URL = "https://api.test"
    setSessionBackendForTests(createMemoryBackend())
  })
  afterEach(() => {
    vi.unstubAllGlobals()
    setSessionBackendForTests(null)
  })

  it("streams binary responses byte-for-byte with download headers (invoice PDF)", async () => {
    const sid = await createSession({
      accessToken: jwt({ sub: "u1", tenant: "acme", exp: Math.floor(Date.now() / 1000) + 900 }),
      refreshToken: "r1",
      refreshTokenExpiresAt: later,
    })
    const pdf = new Uint8Array([0x25, 0x50, 0x44, 0x46, 0xff, 0xfe, 0x00, 0x80, 0x9c])
    vi.stubGlobal(
      "fetch",
      vi.fn(async () =>
        new Response(pdf, {
          status: 200,
          headers: {
            "content-type": "application/pdf",
            "content-disposition": "attachment; filename=\"INV-1.pdf\"",
            "content-length": String(pdf.byteLength),
          },
        }),
      ),
    )

    const request = new NextRequest("http://localhost:3000/api/dotnet/billing/invoices/1/pdf", {
      headers: { cookie: `fsh_sid=${sid}`, host: "localhost:3000", "x-forwarded-for": "203.0.113.7" },
    })
    const res = await GET(request, context("billing", "invoices", "1", "pdf"))

    expect(res.status).toBe(200)
    expect(res.headers.get("content-type")).toBe("application/pdf")
    expect(res.headers.get("content-disposition")).toContain("INV-1.pdf")
    expect(new Uint8Array(await res.arrayBuffer())).toEqual(pdf)

    const [, init] = (fetch as unknown as { mock: { calls: [string, RequestInit][] } }).mock.calls[0]
    expect((init.headers as Record<string, string>)["X-Forwarded-For"]).toBe("203.0.113.7")
  })

  it("forwards binary request bodies untouched", async () => {
    const sid = await createSession({
      accessToken: jwt({ sub: "u1", tenant: "acme", exp: Math.floor(Date.now() / 1000) + 900 }),
      refreshToken: "r1",
      refreshTokenExpiresAt: later,
    })
    const payload = new Uint8Array([0x00, 0xff, 0x80, 0x7f])
    const fetchMock = vi.fn(async () => new Response(null, { status: 204 }))
    vi.stubGlobal("fetch", fetchMock)

    const request = new NextRequest("http://localhost:3000/api/dotnet/files/raw", {
      method: "POST",
      body: payload,
      headers: { cookie: `fsh_sid=${sid}`, "content-type": "application/octet-stream" },
    })
    const res = await POST(request, context("files", "raw"))

    expect(res.status).toBe(204)
    const [, init] = fetchMock.mock.calls[0] as unknown as [string, RequestInit]
    expect(new Uint8Array(init.body as ArrayBuffer)).toEqual(payload)
  })

  it("refreshes a SuperAdmin session against its own tenant even with a tenant override", async () => {
    const sid = await createSession({
      accessToken: jwt({ sub: "u1", tenant: "root", exp: Math.floor(Date.now() / 1000) - 5 }),
      refreshToken: "r1",
      refreshTokenExpiresAt: later,
    })
    const fresh = jwt({ sub: "u1", tenant: "root", exp: Math.floor(Date.now() / 1000) + 900 })
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce(
        new Response(JSON.stringify({ token: fresh, refreshToken: "r2", refreshTokenExpiryTime: later.toISOString() }), { status: 200 }),
      )
      .mockResolvedValueOnce(new Response("[]", { status: 200, headers: { "content-type": "application/json" } }))
    vi.stubGlobal("fetch", fetchMock)

    const request = new NextRequest("http://localhost:3000/api/dotnet/identity/users", {
      headers: { cookie: `fsh_sid=${sid}`, "x-target-tenant": "pharmacy-a" },
    })
    const res = await GET(request, context("identity", "users"))

    expect(res.status).toBe(200)
    const [refreshUrl, refreshInit] = fetchMock.mock.calls[0] as [string, RequestInit]
    expect(refreshUrl).toContain("/identity/token/refresh")
    expect((refreshInit.headers as Record<string, string>).tenant).toBe("root")
    const [, callInit] = fetchMock.mock.calls[1] as [string, RequestInit]
    expect((callInit.headers as Record<string, string>).tenant).toBe("pharmacy-a")
  })
  it("rejects dot-segments that would escape /api/v1 (e.g. to /jobs) without calling the API", async () => {
    const sid = await createSession({
      accessToken: jwt({ sub: "u1", tenant: "acme", exp: Math.floor(Date.now() / 1000) + 900 }),
      refreshToken: "r1",
      refreshTokenExpiresAt: later,
    })
    const upstream = vi.fn(async () => new Response("{}", { status: 200 }))
    vi.stubGlobal("fetch", upstream)

    const request = new NextRequest("http://localhost:3000/api/dotnet/x", {
      headers: { cookie: `fsh_sid=${sid}`, host: "localhost:3000" },
    })
    const res = await GET(request, context("..", "..", "jobs"))

    expect(res.status).toBe(400)
    expect(upstream).not.toHaveBeenCalled()
  })
})
