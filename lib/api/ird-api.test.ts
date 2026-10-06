import { describe, expect, it } from "vitest"
import {
  buildSendIrdBody,
  toIrdQueueHealth,
  toIrdSendResult,
  type DotnetIrdQueueHealthDto,
} from "@/lib/api/ird-api"

describe("toIrdQueueHealth", () => {
  it("maps the .NET queue health to the legacy system-health shape", () => {
    const dto: DotnetIrdQueueHealthDto = {
      pendingCount: 3,
      failedCount: 1,
      salesFailedCount: 2,
      recentFailed: [{ id: "q-1", lastError: "401 Unauthorized", createdAtUtc: "2026-10-06T04:00:00Z" }],
    }
    expect(toIrdQueueHealth(dto)).toEqual({
      pendingCount: 3,
      failedCount: 1,
      salesFailedCount: 2,
      recentFailed: [{ id: "q-1", last_error: "401 Unauthorized", created_at: "2026-10-06T04:00:00Z" }],
    })
  })

  it("keeps a null last error as null", () => {
    const health = toIrdQueueHealth({
      pendingCount: 0,
      failedCount: 1,
      salesFailedCount: 0,
      recentFailed: [{ id: "q-2", lastError: null, createdAtUtc: "2026-10-06T04:00:00Z" }],
    })
    expect(health.recentFailed[0].last_error).toBeNull()
  })

  it("returns an empty recent list when nothing has failed", () => {
    expect(
      toIrdQueueHealth({ pendingCount: 0, failedCount: 0, salesFailedCount: 0, recentFailed: [] }).recentFailed,
    ).toEqual([])
  })
})

describe("toIrdSendResult", () => {
  it("returns the sale id and invoice number the legacy route returns", () => {
    expect(
      toIrdSendResult({
        saleId: "s-1",
        queueItemId: "q-9",
        invoiceNumber: "INV-261006-4821",
      }),
    ).toEqual({ saleId: "s-1", invoiceNumber: "INV-261006-4821" })
  })
})

describe("buildSendIrdBody", () => {
  it("sends an empty body because the sale id travels in the route", () => {
    expect(buildSendIrdBody()).toEqual({})
  })
})
