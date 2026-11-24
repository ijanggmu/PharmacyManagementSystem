import { describe, expect, it } from "vitest"

import { ApiRequestError } from "@/lib/api/client-helpers"
import { DotnetApiError } from "@/lib/api/dotnet-client"
import { queryRetryDelay, shouldRetryQuery } from "@/lib/query-retry"

const rateLimited = new ApiRequestError("Rate limit exceeded. Please retry later.", "RATE_LIMITED", 429)
const dotnetRateLimited = new DotnetApiError({ code: "RATE_LIMITED", message: "Rate limit exceeded.", status: 429 })
const forbidden = new ApiRequestError("Forbidden", "FORBIDDEN", 403)
const serverError = new ApiRequestError("Boom", "INTERNAL", 500)

describe("shouldRetryQuery", () => {
  it("waits out a rate limit instead of showing an error (up to 3 tries)", () => {
    expect(shouldRetryQuery(0, rateLimited)).toBe(true)
    expect(shouldRetryQuery(2, dotnetRateLimited)).toBe(true)
    expect(shouldRetryQuery(3, rateLimited)).toBe(false)
  })

  it("never retries other 4xx answers", () => {
    expect(shouldRetryQuery(0, forbidden)).toBe(false)
  })

  it("retries server errors and network failures up to 3 times", () => {
    expect(shouldRetryQuery(0, serverError)).toBe(true)
    expect(shouldRetryQuery(0, new TypeError("Failed to fetch"))).toBe(true)
    expect(shouldRetryQuery(3, serverError)).toBe(false)
  })
})

describe("queryRetryDelay", () => {
  it("backs off 5s, 10s, 20s after a rate limit, so the one-minute window can reset", () => {
    expect(queryRetryDelay(0, rateLimited)).toBe(5_000)
    expect(queryRetryDelay(1, dotnetRateLimited)).toBe(10_000)
    expect(queryRetryDelay(2, rateLimited)).toBe(20_000)
  })

  it("keeps the usual quick backoff for other failures", () => {
    expect(queryRetryDelay(0, serverError)).toBe(1_000)
    expect(queryRetryDelay(1, serverError)).toBe(2_000)
    expect(queryRetryDelay(10, serverError)).toBe(30_000)
  })
})
