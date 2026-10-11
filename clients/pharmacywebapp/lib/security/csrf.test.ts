import { afterEach, describe, expect, it, vi } from "vitest"

vi.mock("next/headers", () => ({ cookies: async () => ({ get: () => undefined, set: () => undefined }) }))

import { csrfCookieName, generateCSRFToken, isSameOriginRequest, tokensMatch } from "@/lib/security/csrf"

const headers = (values: Record<string, string>) => new Headers(values)

describe("csrf", () => {
  afterEach(() => vi.unstubAllEnvs())

  it("generates 256-bit hex tokens that differ every time", () => {
    const a = generateCSRFToken()
    const b = generateCSRFToken()
    expect(a).toMatch(/^[0-9a-f]{64}$/)
    expect(a).not.toBe(b)
  })

  it("compares tokens exactly", () => {
    expect(tokensMatch("abc", "abc")).toBe(true)
    expect(tokensMatch("abc", "abd")).toBe(false)
    expect(tokensMatch("abc", "abcd")).toBe(false)
  })

  it("uses the __Host- cookie only in production", () => {
    vi.stubEnv("NODE_ENV", "production")
    expect(csrfCookieName()).toBe("__Host-csrf-token")
    vi.stubEnv("NODE_ENV", "development")
    expect(csrfCookieName()).toBe("csrf-token")
  })

  it("accepts same-origin and header-less requests", () => {
    expect(isSameOriginRequest(headers({ host: "acme.pharma.test", origin: "https://acme.pharma.test" }))).toBe(true)
    expect(isSameOriginRequest(headers({ host: "localhost:3000", referer: "http://localhost:3000/dashboard" }))).toBe(true)
    expect(isSameOriginRequest(headers({ host: "localhost:3000" }))).toBe(true)
  })

  it("rejects cross-origin requests, including other tenant subdomains", () => {
    expect(isSameOriginRequest(headers({ host: "acme.pharma.test", origin: "https://evil.test" }))).toBe(false)
    expect(isSameOriginRequest(headers({ host: "acme.pharma.test", origin: "https://other.pharma.test" }))).toBe(false)
    expect(isSameOriginRequest(headers({ host: "acme.pharma.test", origin: "null" }))).toBe(false)
  })
})
