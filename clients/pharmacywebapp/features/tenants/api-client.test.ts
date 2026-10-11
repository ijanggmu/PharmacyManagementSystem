import { describe, expect, it, vi, beforeEach } from "vitest"

const { get, post, put } = vi.hoisted(() => ({
  get: vi.fn((..._args: unknown[]) => Promise.resolve({} as unknown)),
  post: vi.fn((..._args: unknown[]) => Promise.resolve({} as unknown)),
  put: vi.fn((..._args: unknown[]) => Promise.resolve({} as unknown)),
}))

vi.mock("@/lib/api/dotnet-client", () => ({
  dotnetClient: { get, post, put, delete: vi.fn(), patch: vi.fn() },
  DotnetApiError: class DotnetApiError extends Error {},
}))

import { tenantsApi } from "@/features/tenants/api-client"

beforeEach(() => {
  get.mockClear()
  post.mockClear()
  put.mockClear()
})

describe("tenantsApi billing plans", () => {
  it("lists plans with includeInactive in the query", async () => {
    await tenantsApi.listPlans(true)
    expect(get).toHaveBeenCalledWith("/billing/plans?includeInactive=true")
  })

  it("posts a new plan to /billing/plans", async () => {
    const input = { key: "pro", name: "Pro", currency: "USD", monthlyBasePrice: 10, interval: "Monthly" as const }
    await tenantsApi.createPlan(input)
    expect(post).toHaveBeenCalledWith("/billing/plans", input, expect.any(String))
  })

  it("puts updates to /billing/plans/{planId} including the planId", async () => {
    const input = { name: "Pro+", monthlyBasePrice: 20, interval: "Monthly" as const }
    await tenantsApi.updatePlan("plan-1", input)
    expect(put).toHaveBeenCalledWith("/billing/plans/plan-1", { ...input, planId: "plan-1" })
  })
})

describe("tenantsApi invoices", () => {
  it("builds query params for admin invoice listing, omitting unset filters", async () => {
    await tenantsApi.listInvoicesAdmin({ tenantId: "acme" }, 2, 10)
    expect(get).toHaveBeenCalledWith("/billing/invoices?pageNumber=2&pageSize=10&tenantId=acme")
  })

  it("includes status and period filters when provided", async () => {
    await tenantsApi.listInvoicesAdmin({ status: "Issued", periodYear: 2026, periodMonth: 3 }, 1, 20)
    const url = get.mock.calls.at(-1)?.[0] as unknown as string
    expect(url).toContain("status=Issued")
    expect(url).toContain("periodYear=2026")
    expect(url).toContain("periodMonth=3")
  })

  it("issues an invoice", async () => {
    await tenantsApi.issueInvoice("inv-1")
    expect(post).toHaveBeenCalledWith("/billing/invoices/inv-1/issue", { dueAtUtc: null }, expect.any(String))
  })

  it("marks an invoice paid", async () => {
    await tenantsApi.payInvoice("inv-1")
    expect(post).toHaveBeenCalledWith("/billing/invoices/inv-1/pay", {}, expect.any(String))
  })

  it("voids an invoice with a reason", async () => {
    await tenantsApi.voidInvoice("inv-1", "duplicate")
    expect(post).toHaveBeenCalledWith("/billing/invoices/inv-1/void", { reason: "duplicate" }, expect.any(String))
  })

  it("generates invoices for a period", async () => {
    await tenantsApi.generateInvoices(2026, 3)
    expect(post).toHaveBeenCalledWith("/billing/invoices/generate", { periodYear: 2026, periodMonth: 3 }, expect.any(String))
  })

  it("builds a same-origin PDF download url", () => {
    expect(tenantsApi.invoicePdfUrl("inv-1")).toBe("/api/dotnet/billing/invoices/inv-1/pdf")
  })
})

describe("tenantsApi wallet top-ups", () => {
  it("lists topup requests with filters", async () => {
    await tenantsApi.listTopupRequests({ tenantId: "acme", status: "Pending" }, 1, 20)
    expect(get).toHaveBeenCalledWith("/billing/wallet/topup-requests?pageNumber=1&pageSize=20&tenantId=acme&status=Pending")
  })

  it("approves a topup request", async () => {
    await tenantsApi.approveTopupRequest("req-1", "ok")
    expect(post).toHaveBeenCalledWith("/billing/wallet/topup-requests/req-1/approve", { note: "ok" }, expect.any(String))
  })

  it("rejects a topup request", async () => {
    await tenantsApi.rejectTopupRequest("req-1", "insufficient proof")
    expect(post).toHaveBeenCalledWith("/billing/wallet/topup-requests/req-1/reject", { reason: "insufficient proof" }, expect.any(String))
  })
})

describe("tenantsApi tenant lifecycle", () => {
  it("renews a tenant with an optional plan key", async () => {
    await tenantsApi.renewTenant("acme", "pro")
    expect(post).toHaveBeenCalledWith("/tenants/acme/renew", { tenantId: "acme", planKey: "pro" }, expect.any(String))
  })

  it("adjusts tenant validity", async () => {
    await tenantsApi.adjustTenantValidity("acme", "2026-12-31T00:00:00.000Z")
    expect(post).toHaveBeenCalledWith(
      "/tenants/acme/adjust-validity",
      { tenantId: "acme", validUpto: "2026-12-31T00:00:00.000Z" },
      expect.any(String),
    )
  })

  it("changes tenant activation", async () => {
    await tenantsApi.changeTenantActivation("acme", false)
    expect(post).toHaveBeenCalledWith("/tenants/acme/activation", { tenantId: "acme", isActive: false })
  })

  it("gets provisioning status", async () => {
    await tenantsApi.getTenantProvisioningStatus("acme")
    expect(get).toHaveBeenCalledWith("/tenants/acme/provisioning")
  })

  it("retries provisioning", async () => {
    await tenantsApi.retryTenantProvisioning("acme")
    expect(post).toHaveBeenCalledWith("/tenants/acme/provisioning/retry", {})
  })
})
