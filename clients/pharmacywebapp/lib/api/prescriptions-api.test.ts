import { beforeEach, describe, expect, it, vi } from "vitest"

const get = vi.fn()
vi.mock("@/lib/api/dotnet-client", () => ({
  dotnetClient: { get: (path: string) => get(path) },
}))

import {
  PRESCRIPTIONS_MAX_PAGE_SIZE,
  prescriptionsDotnet,
  prescriptionsListQuery,
  toPrescriptionStats,
  type DotnetPrescriptionDto,
} from "@/lib/api/prescriptions-api"

describe("toPrescriptionStats", () => {
  it("maps PrescriptionStatsDto to the legacy stats row", () => {
    expect(
      toPrescriptionStats({ total: 40, pending: 12, partiallyFilled: 5, filled: 20, cancelled: 3 }),
    ).toEqual({ total: 40, pending: 12, filled: 20, partially_filled: 5, cancelled: 3 })
  })

  it("keeps zero counts as zero", () => {
    expect(toPrescriptionStats({ total: 0, pending: 0, partiallyFilled: 0, filled: 0, cancelled: 0 })).toEqual({
      total: 0,
      pending: 0,
      filled: 0,
      partially_filled: 0,
      cancelled: 0,
    })
  })
})

describe("prescriptionsListQuery", () => {
  it("maps every table filter to the .NET query parameters", () => {
    expect(
      prescriptionsListQuery({
        page: 2,
        limit: 10,
        customerId: "c1",
        statuses: ["pending", "partially_filled"],
        search: " RX-10 ",
        dateFrom: "2026-10-01",
        dateTo: "2026-10-31",
      }),
    ).toBe(
      "/prescriptions?pageNumber=2&pageSize=10&customerId=c1&status=pending&status=partially_filled&search=RX-10&dateFrom=2026-10-01&dateTo=2026-10-31",
    )
  })

  it("clamps the page size to the server cap", () => {
    expect(prescriptionsListQuery({ limit: 5000 })).toBe(`/prescriptions?pageSize=${PRESCRIPTIONS_MAX_PAGE_SIZE}`)
  })
})

describe("prescriptionsDotnet.list", () => {
  beforeEach(() => {
    get.mockReset()
  })

  const row = (id: string): DotnetPrescriptionDto => ({
    id,
    customerId: "c1",
    customerName: "Sita",
    doctorName: "Dr. Sharma",
    prescriptionDate: "2026-10-01",
    expiryDate: "2026-11-01",
    status: "Active",
    createdAtUtc: "2026-10-01T00:00:00Z",
    cancelledAtUtc: null,
    cancelReason: null,
    items: [],
    createdByUserId: null,
    notes: null,
    prescriptionNumber: id,
  })

  it("pages through 200-row requests for an export-sized limit, keeping the filters", async () => {
    get.mockImplementation((path: string) => {
      const n = Number(new URLSearchParams(path.split("?")[1]).get("pageNumber"))
      const count = n === 2 ? 20 : 200
      return Promise.resolve({
        items: Array.from({ length: count }, (_, i) => row(`p${n}-${i}`)),
        pageNumber: n,
        pageSize: 200,
        totalCount: 220,
        totalPages: 2,
      })
    })

    const res = await prescriptionsDotnet.list({ page: 1, limit: 5000, statuses: ["filled"], search: "sita" })

    expect(get).toHaveBeenCalledTimes(2)
    for (const [path] of get.mock.calls) {
      const sp = new URLSearchParams(String(path).split("?")[1])
      expect(sp.get("pageSize")).toBe("200")
      expect(sp.getAll("status")).toEqual(["filled"])
      expect(sp.get("search")).toBe("sita")
    }
    expect(res.items).toHaveLength(220)
    expect(res.totalCount).toBe(220)
  })

  it("makes a single request within the cap", async () => {
    get.mockResolvedValue({ items: [], pageNumber: 3, pageSize: 10, totalCount: 0, totalPages: 0 })

    await prescriptionsDotnet.list({ page: 3, limit: 10 })

    expect(get).toHaveBeenCalledWith("/prescriptions?pageNumber=3&pageSize=10")
  })
})
