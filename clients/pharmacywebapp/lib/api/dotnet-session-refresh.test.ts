import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"
import {
  createMemoryBackend,
  createSession,
  getSession,
  setSessionBackendForTests,
  updateSession,
} from "@/lib/api/dotnet-token-store"
import { forceRefreshSession, resolveSessionTokens } from "@/lib/api/dotnet-session-refresh"

const jwt = (claims: Record<string, unknown>) => {
  const enc = (value: object) => Buffer.from(JSON.stringify(value)).toString("base64url")
  return `${enc({ alg: "none" })}.${enc(claims)}.sig`
}
const nowSec = () => Math.floor(Date.now() / 1000)
const expired = (tenant = "acme") => jwt({ sub: "u1", tenant, exp: nowSec() - 10 })
const fresh = (tenant = "acme") => jwt({ sub: "u1", tenant, exp: nowSec() + 900 })
const later = new Date(Date.now() + 7 * 24 * 3600 * 1000)

const okRefresh = (token: string, refreshToken: string) =>
  new Response(JSON.stringify({ token, refreshToken, refreshTokenExpiryTime: later.toISOString() }), { status: 200 })

const asFetch = (fn: unknown) => fn as typeof fetch

describe("resolveSessionTokens (single-flight refresh)", () => {
  beforeEach(() => setSessionBackendForTests(createMemoryBackend()))
  afterEach(() => setSessionBackendForTests(null))

  it("returns stored tokens without calling the API when the access token is fresh", async () => {
    const sid = await createSession({ accessToken: fresh(), refreshToken: "r1", refreshTokenExpiresAt: later })
    const fetchImpl = vi.fn()

    const result = await resolveSessionTokens(sid, { baseUrl: "https://api.test", fallbackTenant: "x", fetchImpl: asFetch(fetchImpl) })

    expect(result.status).toBe("ok")
    expect(fetchImpl).not.toHaveBeenCalled()
  })

  it("shares ONE refresh between concurrent callers of the same session", async () => {
    const sid = await createSession({ accessToken: expired(), refreshToken: "r1", refreshTokenExpiresAt: later })
    const newAccess = fresh()
    let release: () => void = () => {}
    const gate = new Promise<void>((resolve) => {
      release = resolve
    })
    const fetchImpl = vi.fn(async () => {
      await gate
      return okRefresh(newAccess, "r2")
    })
    const options = { baseUrl: "https://api.test", fallbackTenant: "x", fetchImpl: asFetch(fetchImpl) }

    const calls = [resolveSessionTokens(sid, options), resolveSessionTokens(sid, options), resolveSessionTokens(sid, options)]
    await new Promise((resolve) => setTimeout(resolve, 10))
    release()
    const results = await Promise.all(calls)

    expect(fetchImpl).toHaveBeenCalledTimes(1)
    for (const result of results) {
      expect(result.status).toBe("ok")
      if (result.status === "ok") expect(result.tokens.refreshToken).toBe("r2")
    }
    expect((await getSession(sid))?.refreshToken).toBe("r2")
  })

  it("refreshes with the session's own tenant claim, not the request's tenant", async () => {
    const sid = await createSession({ accessToken: expired("root"), refreshToken: "r1", refreshTokenExpiresAt: later })
    const fetchImpl = vi.fn(async () => okRefresh(fresh("root"), "r2"))

    await resolveSessionTokens(sid, { baseUrl: "https://api.test", fallbackTenant: "pharmacy-a", fetchImpl: asFetch(fetchImpl) })

    const [, init] = fetchImpl.mock.calls[0] as unknown as [string, RequestInit]
    expect((init.headers as Record<string, string>).tenant).toBe("root")
  })

  it("keeps the session when the API is temporarily unavailable", async () => {
    const sid = await createSession({ accessToken: expired(), refreshToken: "r1", refreshTokenExpiresAt: later })
    const fetchImpl = vi.fn(async () => new Response("", { status: 503 }))

    const result = await resolveSessionTokens(sid, { baseUrl: "https://api.test", fallbackTenant: "x", fetchImpl: asFetch(fetchImpl) })

    expect(result.status).toBe("unavailable")
    expect(await getSession(sid)).not.toBeNull()
  })

  it("uses the winner's tokens when another refresh already rotated the session", async () => {
    const sid = await createSession({ accessToken: expired(), refreshToken: "r1", refreshTokenExpiresAt: later })
    const winner = fresh()
    // The API rejects our (now stale) r1 — but by then another instance stored r2.
    const fetchImpl = vi.fn(async () => {
      await updateSession(sid, { accessToken: winner, refreshToken: "r2", refreshTokenExpiresAt: later })
      return new Response("", { status: 401 })
    })

    const result = await resolveSessionTokens(sid, { baseUrl: "https://api.test", fallbackTenant: "x", fetchImpl: asFetch(fetchImpl) })

    expect(result.status).toBe("ok")
    if (result.status === "ok") expect(result.tokens.refreshToken).toBe("r2")
  })

  it("reports expired only when the refresh token is really rejected", async () => {
    const sid = await createSession({ accessToken: expired(), refreshToken: "r1", refreshTokenExpiresAt: later })
    const fetchImpl = vi.fn(async () => new Response("", { status: 401 }))

    const result = await resolveSessionTokens(sid, { baseUrl: "https://api.test", fallbackTenant: "x", fetchImpl: asFetch(fetchImpl) })

    expect(result.status).toBe("expired")
  })

  it("forceRefreshSession refreshes even a still-valid access token", async () => {
    const sid = await createSession({ accessToken: fresh(), refreshToken: "r1", refreshTokenExpiresAt: later })
    const fetchImpl = vi.fn(async () => okRefresh(fresh(), "r2"))

    const result = await forceRefreshSession(sid, { baseUrl: "https://api.test", fallbackTenant: "x", fetchImpl: asFetch(fetchImpl) })

    expect(result.status).toBe("ok")
    expect(fetchImpl).toHaveBeenCalledTimes(1)
  })
})

describe("memory token store", () => {
  afterEach(() => setSessionBackendForTests(null))

  it("expires entries with the refresh token", async () => {
    let now = Date.now()
    setSessionBackendForTests(createMemoryBackend(() => now))
    const sid = await createSession({ accessToken: "a", refreshToken: "r", refreshTokenExpiresAt: new Date(Date.now() + 120_000) })
    expect(await getSession(sid)).not.toBeNull()

    now += 10 * 60 * 1000
    expect(await getSession(sid)).toBeNull()
  })

  it("ignores session ids that are not UUIDs", async () => {
    setSessionBackendForTests(createMemoryBackend())
    expect(await getSession("../../etc/passwd")).toBeNull()
  })
})
