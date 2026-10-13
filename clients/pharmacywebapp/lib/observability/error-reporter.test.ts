import { afterEach, describe, expect, it, vi } from "vitest"
import { buildErrorEnvelope, parseSentryDsn, parseStackFrames, reportServerError } from "./error-reporter"

describe("parseSentryDsn", () => {
  it("builds the envelope endpoint with key auth in the query", () => {
    const parsed = parseSentryDsn("https://abc123@o1.ingest.sentry.io/4507")
    expect(parsed).toEqual({
      envelopeUrl:
        "https://o1.ingest.sentry.io/api/4507/envelope/?sentry_key=abc123&sentry_version=7&sentry_client=pharmacywebapp%2F1.0",
      publicKey: "abc123",
      projectId: "4507",
    })
  })

  it("keeps a path prefix (self-hosted collectors behind a sub-path)", () => {
    expect(parseSentryDsn("http://key@glitchtip.local:8000/errors/12")?.envelopeUrl).toMatch(
      /^http:\/\/glitchtip\.local:8000\/errors\/api\/12\/envelope\/\?/,
    )
  })

  it.each([undefined, "", "   ", "not a url", "https://host/12", "https://key@host/", "https://key@host/abc", "ftp://k@h/1"])(
    "returns null for %j",
    (dsn) => {
      expect(parseSentryDsn(dsn)).toBeNull()
    },
  )
})

describe("parseStackFrames", () => {
  it("parses V8 frames oldest first and flags library code", () => {
    const stack = [
      "Error: boom",
      "    at load (/app/.next/server/app/page.js:10:5)",
      "    at /app/node_modules/next/dist/server.js:20:7",
      "    at async Promise.all (index 0)",
    ].join("\n")

    expect(parseStackFrames(stack)).toEqual([
      { function: "async Promise.all (index 0)", in_app: false },
      { filename: "/app/node_modules/next/dist/server.js", lineno: 20, colno: 7, in_app: false },
      { function: "load", filename: "/app/.next/server/app/page.js", lineno: 10, colno: 5, in_app: true },
    ])
  })

  it("returns no frames without a stack", () => {
    expect(parseStackFrames(undefined)).toEqual([])
  })
})

describe("buildErrorEnvelope", () => {
  it("sends the error, path without query string and tags only", () => {
    const error = Object.assign(new Error("db down"), { digest: "123" })
    const body = buildErrorEnvelope(
      error,
      { method: "POST", path: "/api/sales?token=secret", tags: { routeType: "route", empty: "" } },
      { dsn: "https://k@h/1", environment: "production", release: "abc", now: new Date("2026-10-13T00:00:00Z"), eventId: "e1" },
    )
    const [header, item, eventJson] = body.split("\n")
    expect(JSON.parse(header)).toEqual({ event_id: "e1", sent_at: "2026-10-13T00:00:00.000Z", dsn: "https://k@h/1" })
    expect(JSON.parse(item).type).toBe("event")
    const event = JSON.parse(eventJson)
    expect(event.transaction).toBe("POST /api/sales")
    expect(event.request).toEqual({ method: "POST", url: "/api/sales" })
    expect(eventJson).not.toContain("secret")
    expect(event.tags).toEqual({ routeType: "route", digest: "123" })
    expect(event.exception.values[0]).toMatchObject({ type: "Error", value: "db down" })
    expect(event.release).toBe("abc")
  })

  it("handles non-Error throws", () => {
    const event = JSON.parse(buildErrorEnvelope({ code: 42 }, {}, { dsn: "https://k@h/1", eventId: "e" }).split("\n")[2])
    expect(event.exception.values[0]).toMatchObject({ type: "NonError", value: '{"code":42}' })
    expect(event.request).toBeUndefined()
  })
})

describe("reportServerError", () => {
  afterEach(() => {
    vi.unstubAllEnvs()
  })

  it("is a no-op without a DSN", async () => {
    vi.stubEnv("SENTRY_DSN", "")
    const fetchImpl = vi.fn()
    await reportServerError(new Error("x"), {}, fetchImpl as unknown as typeof fetch)
    expect(fetchImpl).not.toHaveBeenCalled()
  })

  it("posts an envelope when configured and swallows transport failures", async () => {
    vi.stubEnv("SENTRY_DSN", "https://k@collector.example/7")
    vi.stubEnv("SENTRY_RELEASE", "sha1")
    const fetchImpl = vi.fn().mockRejectedValue(new Error("network down"))

    await expect(reportServerError(new Error("x"), { path: "/dashboard" }, fetchImpl as unknown as typeof fetch)).resolves.toBeUndefined()

    expect(fetchImpl).toHaveBeenCalledTimes(1)
    const [url, init] = fetchImpl.mock.calls[0] as [string, RequestInit]
    expect(url).toMatch(/^https:\/\/collector\.example\/api\/7\/envelope\/\?sentry_key=k/)
    expect(init.method).toBe("POST")
    expect(String(init.body)).toContain('"release":"sha1"')
  })
})
