import { beforeEach, describe, expect, it, vi } from "vitest"

const post = vi.fn()
vi.mock("@/lib/api/dotnet-client", () => ({
  dotnetClient: { post: (path: string, body: unknown, key?: string) => post(path, body, key) },
}))

import { customerPaymentsApi } from "./api-client"
import { createCheckoutKeyTracker } from "@/lib/api/sales-api"

describe("customer payment idempotency", () => {
  beforeEach(() => post.mockReset().mockResolvedValue("p1"))

  const body = { customer_id: "c1", amount: 100, payment_method: "cash" as const, payment_date: "2026-10-01" }

  it("sends the caller's key so a retry of the same submission is recorded once", async () => {
    await customerPaymentsApi.post({ ...body, idempotency_key: "k-1" })
    await customerPaymentsApi.post({ ...body, idempotency_key: "k-1" })
    expect(post.mock.calls.map((c) => c[2])).toEqual(["k-1", "k-1"])
  })

  it("the dialog's tracker reuses a key for the same values and issues a new one when they change", () => {
    let n = 0
    const keys = createCheckoutKeyTracker(() => `key-${++n}`)
    const first = keys.keyFor(JSON.stringify(body))
    expect(keys.keyFor(JSON.stringify(body))).toBe(first)
    expect(keys.keyFor(JSON.stringify({ ...body, amount: 200 }))).not.toBe(first)
  })
})
