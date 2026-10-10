import { describe, expect, it, vi, beforeEach } from "vitest"

const { get } = vi.hoisted(() => ({
  get: vi.fn((..._args: unknown[]) => Promise.resolve({} as unknown)),
}))

vi.mock("@/lib/api/dotnet-client", () => ({
  dotnetClient: { get, post: vi.fn(), put: vi.fn(), delete: vi.fn(), patch: vi.fn() },
  DotnetApiError: class DotnetApiError extends Error {},
}))

import { searchBankDeposits, searchStatementImports } from "@/lib/api/bank-reconciliation-api"

beforeEach(() => {
  get.mockClear()
})

describe("searchBankDeposits", () => {
  it("sends a real pageNumber (not just a bigger pageSize) and returns the paging envelope", async () => {
    get.mockResolvedValueOnce({
      items: [
        {
          id: "d1",
          branchId: "b1",
          depositDateUtc: "2026-10-01T00:00:00Z",
          amount: 500,
          description: "Till deposit",
          createdAtUtc: "2026-10-01T01:00:00Z",
        },
      ],
      pageNumber: 2,
      pageSize: 20,
      totalCount: 45,
      totalPages: 3,
    })

    const result = await searchBankDeposits({ branch_id: "b1", page: 2, limit: 20 })

    const url = get.mock.calls.at(-1)?.[0] as string
    expect(url).toContain("pageNumber=2")
    expect(url).toContain("pageSize=20")
    expect(url).toContain("branchId=b1")
    expect(result.pageNumber).toBe(2)
    expect(result.totalCount).toBe(45)
    expect(result.totalPages).toBe(3)
    expect(result.items).toEqual([
      {
        id: "d1",
        branch_id: "b1",
        deposit_date: "2026-10-01",
        amount: 500,
        reference_note: "Till deposit",
        voucher_id: null,
        cash_shift_id: null,
        created_at: "2026-10-01T01:00:00Z",
      },
    ])
  })

  it("defaults to page 1 and clamps the page size to 1..200", async () => {
    get.mockResolvedValueOnce({ items: [], pageNumber: 1, pageSize: 200, totalCount: 0, totalPages: 1 })
    await searchBankDeposits({ limit: 10000 })
    const url = get.mock.calls.at(-1)?.[0] as string
    expect(url).toContain("pageNumber=1")
    expect(url).toContain("pageSize=200")
  })
})

describe("searchStatementImports", () => {
  it("sends a real pageNumber for the statements list and returns totals for a page control", async () => {
    get.mockResolvedValueOnce({
      items: [],
      pageNumber: 2,
      pageSize: 10,
      totalCount: 23,
      totalPages: 3,
    })

    const result = await searchStatementImports("acct-1", 2, 10)

    const url = get.mock.calls.at(-1)?.[0] as string
    expect(url).toContain("pageNumber=2")
    expect(url).toContain("pageSize=10")
    expect(url).toContain("accountId=acct-1")
    expect(result.totalCount).toBe(23)
    expect(result.totalPages).toBe(3)
    expect(result.error).toBeNull()
  })

  it("returns a safe empty page with the error message instead of throwing", async () => {
    get.mockRejectedValueOnce(new Error("network down"))
    const result = await searchStatementImports("acct-1", 1, 10)
    expect(result.items).toEqual([])
    expect(result.totalPages).toBe(1)
    expect(result.error).toMatch(/network down/)
  })
})
