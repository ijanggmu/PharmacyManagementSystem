import { describe, expect, it } from "vitest"
import {
  FIRST_ATTEMPT_DELAY_MS,
  type RetryState,
  afterFailure,
  classifySyncFailure,
  firstAttemptAt,
  isAmbiguousCreateFailure,
  isDue,
  nextBackoffMs,
} from "./offline-sale-retry"

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

describe("first-attempt grace period", () => {
  const queuedAt = new Date("2026-01-01T00:00:00Z")
  const queued: RetryState = { status: "pending", attempts: 0, createdAt: queuedAt.toISOString(), nextAttemptAt: firstAttemptAt(queuedAt) }

  it("never replays a freshly queued sale before 60s, even when forced", () => {
    expect(FIRST_ATTEMPT_DELAY_MS).toBeGreaterThanOrEqual(60_000)
    expect(isDue(queued, new Date("2026-01-01T00:00:10Z"))).toBe(false)
    expect(isDue(queued, new Date("2026-01-01T00:00:10Z"), true)).toBe(false)
    expect(isDue({ ...queued, nextAttemptAt: null }, new Date("2026-01-01T00:00:59Z"), true)).toBe(false)
  })

  it("replays once the grace period is over", () => {
    expect(isDue(queued, new Date("2026-01-01T00:01:00Z"))).toBe(true)
    expect(isDue(queued, new Date("2026-01-01T00:01:01Z"), true)).toBe(true)
  })

  it("forced passes skip the backoff schedule after the grace period", () => {
    const backedOff: RetryState = { ...queued, attempts: 3, nextAttemptAt: "2026-01-01T01:00:00Z" }
    expect(isDue(backedOff, new Date("2026-01-01T00:05:00Z"))).toBe(false)
    expect(isDue(backedOff, new Date("2026-01-01T00:05:00Z"), true)).toBe(true)
  })
})
