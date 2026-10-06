import { describe, expect, it, vi } from "vitest"
import { jwtExpiry, needsRefresh, refreshTokens, tenantFromHost } from "@/lib/api/dotnet-session"

function jwt(expSecondsFromEpoch: number): string {
  const enc = (value: object) => Buffer.from(JSON.stringify(value)).toString("base64url")
  return `${enc({ alg: "none" })}.${enc({ exp: expSecondsFromEpoch })}.sig`
}

describe("jwtExpiry and needsRefresh", () => {
  it("reads the exp claim", () => {
    expect(jwtExpiry(jwt(1_800_000_000))?.getTime()).toBe(1_800_000_000_000)
  })

  it("returns null for a malformed token", () => {
    expect(jwtExpiry("not-a-jwt")).toBeNull()
  })

  it("requires refresh inside the skew window and not before", () => {
    const now = new Date(1_800_000_000_000)
    expect(needsRefresh(jwt(1_800_000_000 + 600), now)).toBe(false)
    expect(needsRefresh(jwt(1_800_000_000 + 10), now)).toBe(true)
    expect(needsRefresh("garbage", now)).toBe(true)
  })
})

describe("tenantFromHost", () => {
  it("uses the subdomain when the root domain matches", () => {
    expect(tenantFromHost("acme.example.com:443", "example.com")).toBe("acme")
  })

  it("falls back to root for the apex or unknown hosts", () => {
    expect(tenantFromHost("example.com", "example.com")).toBe("root")
    expect(tenantFromHost("a.b.example.com", "example.com")).toBe("root")
    expect(tenantFromHost("localhost", null)).toBe("root")
  })
})

describe("refreshTokens", () => {
  it("returns rotated tokens on success", async () => {
    const fetchImpl = vi.fn(async () =>
      new Response(JSON.stringify({ token: "new-a", refreshToken: "new-r", refreshTokenExpiryTime: "2030-01-01T00:00:00Z" }), { status: 200 }),
    )
    const tokens = await refreshTokens({ baseUrl: "https://api.test", tenant: "acme", fetchImpl }, { accessToken: "a", refreshToken: "r" })

    expect(tokens?.accessToken).toBe("new-a")
    expect(tokens?.refreshToken).toBe("new-r")
    const [url, init] = fetchImpl.mock.calls[0] as unknown as [string, RequestInit]
    expect(url).toBe("https://api.test/api/v1/identity/token/refresh")
    expect((init.headers as Record<string, string>).tenant).toBe("acme")
  })

  it("returns null when the refresh token is rejected", async () => {
    const fetchImpl = vi.fn(async () => new Response("", { status: 401 }))
    await expect(refreshTokens({ baseUrl: "https://api.test", tenant: "acme", fetchImpl }, { accessToken: "a", refreshToken: "r" })).resolves.toBeNull()
  })
})
