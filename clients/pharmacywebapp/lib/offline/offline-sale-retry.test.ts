import { describe, expect, it } from "vitest"
import { type RetryState, afterFailure, classifySyncFailure, isAmbiguousCreateFailure, isDue, nextBackoffMs } from "./offline-sale-retry"

const httpError = (status: number) => Object.assign(new Error(`status ${status}`), { normalized: { status } })

describe("nextBackoffMs", () => {
  it("doubles from 30s and caps at 30 minutes", () => {
    expect(nextBackoffMs(1)).toBe(30_000)
    expect(nextBackoffMs(2)).toBe(60_000)
    expect(nextBackoffMs(3)).toBe(120_000)
    expect(nextBackoffMs(20)).toBe(30 * 60_000)
  })
})

describe("classifySyncFailure", () => {
  it("retries network, timeout and server errors", () => {
    expect(classifySyncFailure(new TypeError("Failed to fetch"))).toBe("transient")
    expect(classifySyncFailure(httpError(0))).toBe("transient")
    expect(classifySyncFailure(httpError(503))).toBe("transient")
    expect(classifySyncFailure(httpError(429))).toBe("transient")
  })

  it("stops on client errors", () => {
    expect(classifySyncFailure(httpError(400))).toBe("permanent")
    expect(classifySyncFailure(httpError(409))).toBe("permanent")
    expect(isAmbiguousCreateFailure(httpError(409))).toBe(false)
    expect(isAmbiguousCreateFailure(httpError(0))).toBe(true)
  })
})

describe("afterFailure / isDue", () => {
  const now = new Date("2026-01-01T00:00:00Z")

  it("schedules a transient failure for later", () => {
    const next = afterFailure<RetryState & { lastError?: string }>({ status: "pending", attempts: 0 }, httpError(502), now)
    expect(next.status).toBe("pending")
    expect(next.attempts).toBe(1)
    expect(next.nextAttemptAt).toBe("2026-01-01T00:00:30.000Z")
    expect(isDue(next, now)).toBe(false)
    expect(isDue(next, new Date("2026-01-01T00:00:31Z"))).toBe(true)
  })

  it("marks a permanent failure as needing attention", () => {
    const next = afterFailure<RetryState & { lastError?: string }>({ status: "pending", attempts: 2 }, httpError(400), now)
    expect(next.status).toBe("failed")
    expect(next.lastError).toBe("status 400")
    expect(isDue(next, now)).toBe(false)
  })
})
