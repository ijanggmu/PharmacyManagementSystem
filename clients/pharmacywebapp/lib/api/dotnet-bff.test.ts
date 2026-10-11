import { afterEach, describe, expect, it, vi } from "vitest"
import { NextRequest } from "next/server"
import { clientIpFromHeaders, passthroughHeaders, tenantForAnonymousRequest } from "@/lib/api/dotnet-bff"

describe("clientIpFromHeaders", () => {
  afterEach(() => vi.unstubAllEnvs())

  it("takes the entry our edge proxy appended, not the client-controlled leftmost one", () => {
    expect(clientIpFromHeaders(new Headers({ "x-forwarded-for": "6.6.6.6, 203.0.113.7" }))).toBe("203.0.113.7")
  })

  it("honours TRUSTED_PROXY_HOPS", () => {
    vi.stubEnv("TRUSTED_PROXY_HOPS", "2")
    expect(clientIpFromHeaders(new Headers({ "x-forwarded-for": "203.0.113.7, 10.0.0.2" }))).toBe("203.0.113.7")
  })

  it("falls back to x-real-ip and rejects junk", () => {
    expect(clientIpFromHeaders(new Headers({ "x-real-ip": "198.51.100.4" }))).toBe("198.51.100.4")
    expect(clientIpFromHeaders(new Headers({ "x-forwarded-for": "<script>" }))).toBeNull()
    expect(clientIpFromHeaders(new Headers())).toBeNull()
  })
})

describe("tenantForAnonymousRequest", () => {
  it("ignores the x-target-tenant override", () => {
    const request = new NextRequest("http://localhost:3000/api/dotnet/auth/register", {
      method: "POST",
      headers: { host: "localhost:3000", "x-target-tenant": "victim-pharmacy" },
    })
    expect(tenantForAnonymousRequest(request)).toBe("root")
  })
})

describe("passthroughHeaders", () => {
  it("forwards download headers and drops a compressed content-length", () => {
    const plain = passthroughHeaders(
      new Headers({
        "content-type": "application/pdf",
        "content-disposition": "attachment; filename=\"INV-1.pdf\"",
        "content-length": "1234",
        "set-cookie": "x=1",
      }),
    )
    expect(plain.get("content-type")).toBe("application/pdf")
    expect(plain.get("content-disposition")).toContain("INV-1.pdf")
    expect(plain.get("content-length")).toBe("1234")
    expect(plain.get("set-cookie")).toBeNull()

    const compressed = passthroughHeaders(new Headers({ "content-length": "99", "content-encoding": "gzip" }))
    expect(compressed.get("content-length")).toBeNull()
    expect(compressed.get("content-encoding")).toBeNull()
  })
})
