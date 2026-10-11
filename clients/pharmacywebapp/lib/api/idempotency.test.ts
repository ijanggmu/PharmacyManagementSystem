import { describe, expect, it } from "vitest"
import { createIdempotencyKeyTracker, newIdempotencyKey } from "./idempotency"

describe("createIdempotencyKeyTracker", () => {
  it("reuses the key while the same action is retried", () => {
    let n = 0
    const tracker = createIdempotencyKeyTracker(() => `k${++n}`)
    expect(tracker.keyFor("void:r1")).toBe("k1")
    expect(tracker.keyFor("void:r1")).toBe("k1")
  })

  it("issues a new key for a different action and after reset", () => {
    let n = 0
    const tracker = createIdempotencyKeyTracker(() => `k${++n}`)
    expect(tracker.keyFor("void:r1")).toBe("k1")
    expect(tracker.keyFor("void:r2")).toBe("k2")
    tracker.reset()
    expect(tracker.keyFor("void:r2")).toBe("k3")
  })
})

describe("newIdempotencyKey", () => {
  it("returns distinct keys", () => {
    expect(newIdempotencyKey()).not.toBe(newIdempotencyKey())
  })
})
