import { describe, expect, it, vi } from "vitest"
import {
  auditTagNames,
  buildQuery,
  eventTypeName,
  getActivityStats,
  getAuditDetail,
  getIntegrationEvent,
  integrationShortType,
  listActivity,
  listByCorrelation,
  listIntegrationEvents,
  listIrdQueue,
  searchExceptions,
  searchSecurityAudits,
  SECURITY_ACTIONS,
  severityName,
  shortExceptionType,
  statusText,
  statusTone,
} from "@/lib/api/system-logs-dotnet"

type Client = NonNullable<Parameters<typeof listActivity>[1]>

function fakeClient() {
  const get = vi.fn(async () => ({ items: [], pageNumber: 1, pageSize: 50, totalCount: 0, totalPages: 0 }))
  return { client: { get } as unknown as Client, get }
}

function calledPath(get: ReturnType<typeof vi.fn>): string {
  return (get.mock.calls[0] as unknown[])[0] as string
}

describe("buildQuery", () => {
  it("drops undefined, null and blank values and trims strings", () => {
    expect(buildQuery({ a: "x", b: undefined, c: null, d: "  ", e: 0, f: " y " })).toBe("?a=x&e=0&f=y")
  })
  it("returns an empty string when nothing is set", () => {
    expect(buildQuery({ a: undefined })).toBe("")
  })
})

describe("listActivity", () => {
  it("calls /audits/activity with filters and clamps the page size to 100", async () => {
    const { client, get } = fakeClient()
    await listActivity(
      { method: "GET", statusClass: "5xx", search: "sales", minDurationMs: 1000, pageNumber: 2, pageSize: 500, tenantId: "*" },
      client,
    )
    const path = calledPath(get)
    expect(path.startsWith("/audits/activity?")).toBe(true)
    const qs = new URLSearchParams(path.split("?")[1])
    expect(qs.get("method")).toBe("GET")
    expect(qs.get("statusClass")).toBe("5xx")
    expect(qs.get("search")).toBe("sales")
    expect(qs.get("minDurationMs")).toBe("1000")
    expect(qs.get("pageNumber")).toBe("2")
    expect(qs.get("pageSize")).toBe("100")
    expect(qs.get("tenantId")).toBe("*")
  })

  it("omits a zero minimum duration", async () => {
    const { client, get } = fakeClient()
    await listActivity({ minDurationMs: 0 }, client)
    expect(calledPath(get)).not.toContain("minDurationMs")
  })
})

describe("endpoint paths", () => {
  it("routes each call to its endpoint", async () => {
    const cases: Array<[(c: Client) => Promise<unknown>, string]> = [
      [(c) => getActivityStats({}, c), "/audits/activity/stats"],
      [(c) => searchSecurityAudits({ action: "LoginFailed" }, c), "/audits/security/search?"],
      [(c) => searchExceptions({ search: "boom" }, c), "/audits/exceptions/search?"],
      [(c) => listIntegrationEvents({ status: "Dead" }, c), "/audits/integration-events?"],
      [(c) => getIntegrationEvent("a b", c), "/audits/integration-events/a%20b"],
      [(c) => listIrdQueue({ status: "Failed" }, c), "/sales/ird/queue?"],
      [(c) => getAuditDetail("id-1", "acme", c), "/audits/id-1?tenantId=acme"],
      [(c) => listByCorrelation("00-abc/1", undefined, c), "/audits/by-correlation/00-abc%2F1"],
    ]
    for (const [call, expected] of cases) {
      const { client, get } = fakeClient()
      await call(client)
      expect(calledPath(get).startsWith(expected)).toBe(true)
    }
  })
})

describe("statusTone / statusText", () => {
  it.each([
    [200, "success"],
    [204, "success"],
    [304, "info"],
    [404, "warning"],
    [499, "muted"],
    [500, "danger"],
    [null, "muted"],
  ] as const)("%s → %s", (code, tone) => {
    expect(statusTone(code)).toBe(tone)
  })

  it("labels client-cancelled requests", () => {
    expect(statusText(499)).toBe("499 Cancelled")
    expect(statusText(null)).toBe("—")
  })
})

describe("name helpers", () => {
  it("derives a short integration type when the API did not send one", () => {
    expect(
      integrationShortType({
        type: "FSH.Modules.Sales.Contracts.Events.SaleCompletedIntegrationEvent, FSH.Modules.Sales.Contracts, Version=10.0.0.0",
      }),
    ).toBe("SaleCompleted")
    expect(integrationShortType({ type: "x", shortType: "Given" })).toBe("Given")
  })

  it("shortens exception types", () => {
    expect(shortExceptionType("FSH.Framework.Core.Exceptions.NotFoundException")).toBe("NotFoundException")
    expect(shortExceptionType(null)).toBe("Exception")
  })

  it("maps enum names and numbers", () => {
    expect(eventTypeName(3)).toBe("Activity")
    expect(eventTypeName("Security")).toBe("Security")
    expect(severityName(5)).toBe("Error")
    expect(severityName("Warning")).toBe("Warning")
  })

  it("decodes audit tag flags", () => {
    expect(auditTagNames(3)).toEqual(["PII masked", "Out of quota"])
    expect(auditTagNames(0)).toEqual([])
    expect(auditTagNames("None")).toEqual([])
  })

  it("lists all 11 security actions", () => {
    expect(SECURITY_ACTIONS).toHaveLength(11)
  })
})
