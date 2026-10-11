import { afterEach, describe, expect, it, vi } from "vitest"

vi.mock("@/lib/api/client-helpers", () => ({
  getCSRFToken: vi.fn(async () => "csrf-1"),
  apiRequestErrorMessage: () => "",
}))

import { dotnetMutate } from "./stock-dotnet"

function stubFetch() {
  const fetchMock = vi.fn(async (_input: RequestInfo | URL, _init?: RequestInit) => new Response(JSON.stringify("ok"), { status: 200, headers: { "Content-Type": "application/json" } }))
  vi.stubGlobal("fetch", fetchMock)
  return fetchMock
}

function sentHeaders(fetchMock: ReturnType<typeof stubFetch>): Record<string, string> {
  const init = fetchMock.mock.calls[0]?.[1] as RequestInit | undefined
  return (init?.headers ?? {}) as Record<string, string>
}

describe("dotnetMutate", () => {
  afterEach(() => vi.unstubAllGlobals())

  it("sends the Idempotency-Key it is given, with the CSRF token", async () => {
    const fetchMock = stubFetch()
    await dotnetMutate("/purchasing/direct-goods-receipts/r1/void", { reason: "x" }, "key-123")
    const headers = sentHeaders(fetchMock)
    expect(headers["Idempotency-Key"]).toBe("key-123")
    expect(headers["X-CSRF-Token"]).toBe("csrf-1")
  })

  it("sends no Idempotency-Key when none is given", async () => {
    const fetchMock = stubFetch()
    await dotnetMutate("/inventory/batches/b1/dispose", { reason: "x" })
    expect(sentHeaders(fetchMock)["Idempotency-Key"]).toBeUndefined()
  })
})
