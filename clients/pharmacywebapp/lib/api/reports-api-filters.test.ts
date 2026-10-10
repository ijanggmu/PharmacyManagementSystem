import { beforeEach, describe, expect, it, vi } from "vitest"

const get = vi.fn()
vi.mock("@/lib/api/dotnet-client", () => ({
  dotnetClient: { get: (...args: unknown[]) => get(...args) },
}))

import { auditLogParams, getComplianceReport, narcoticRegisterParams } from "@/lib/api/reports-api"

beforeEach(() => {
  get.mockReset()
})

describe("auditLogParams (GET /audits/entity-logs)", () => {
  it("maps every filter to the GetEntityAuditLogsQuery parameter names", () => {
    const params = auditLogParams({
      page: 2,
      limit: 50,
      table: "  sale ",
      action: "Update",
      from: "2026-10-01T00:00:00.000Z",
      to: "2026-10-09T00:00:00.000Z",
      tenantId: "acme",
    })
    expect(Object.fromEntries(params)).toEqual({
      pageNumber: "2",
      pageSize: "50",
      tableName: "sale",
      action: "Update",
      fromUtc: "2026-10-01T00:00:00.000Z",
      toUtc: "2026-10-09T00:00:00.000Z",
      tenantId: "acme",
    })
  })

  it("omits empty filters", () => {
    const params = auditLogParams({ page: 1, limit: 25, table: "   " })
    expect(Object.fromEntries(params)).toEqual({ pageNumber: "1", pageSize: "25" })
  })
})

describe("narcoticRegisterParams (GET /sales/reports/narcotic-register)", () => {
  it("sends whole UTC days and trimmed text filters", () => {
    const params = narcoticRegisterParams({
      periodStart: "2026-10-01",
      periodEnd: "2026-10-09",
      medicineName: " morphine ",
      doctorName: "  Dr. Rai",
      schedule: " II ",
    })
    expect(Object.fromEntries(params)).toEqual({
      periodStartUtc: "2026-10-01T00:00:00Z",
      periodEndUtc: "2026-10-09T23:59:59.999Z",
      medicineName: "morphine",
      doctorName: "Dr. Rai",
      schedule: "II",
    })
  })

  it("drops blank text filters instead of sending whitespace", () => {
    const params = narcoticRegisterParams({ periodStart: "2026-10-01", periodEnd: "2026-10-01", medicineName: "  ", schedule: "" })
    expect(params.has("medicineName")).toBe(false)
    expect(params.has("schedule")).toBe(false)
    expect(params.has("doctorName")).toBe(false)
  })
})

describe("getComplianceReport('audit')", () => {
  it("queries the full end day, not midnight at its start", async () => {
    get.mockResolvedValueOnce({ totalEvents: 0, logs: [] })

    await getComplianceReport("audit", "2026-10-01", "2026-10-09").catch(() => undefined)

    const url = get.mock.calls[0][0] as string
    const params = new URLSearchParams(url.split("?")[1])
    expect(params.get("fromUtc")).toBe("2026-10-01T00:00:00Z")
    expect(params.get("toUtc")).toBe("2026-10-09T23:59:59.999Z")
  })
})
