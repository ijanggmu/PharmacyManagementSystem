/**
 * Tenant management calls (SuperAdmin only). They go through the BFF (/api/dotnet), where the proxy
 * attaches the admin app header for the SuperAdmin session. The browser never sends X-FSH-App itself.
 */

import { dotnetClient } from "@/lib/api/dotnet-client"
import type {
  AdjustTenantValidityResult,
  BillingPlan,
  CreatePlanInput,
  CreateTenantInput,
  CreateTenantResult,
  Invoice,
  PagedResponse,
  RenewTenantResult,
  Subscription,
  TenantLifecycleResult,
  TenantListItem,
  TenantProvisioningStatus,
  TenantStatus,
  TopupRequest,
  UpdatePlanInput,
} from "@/features/tenants/types"

function idempotencyKey(): string {
  return typeof crypto !== "undefined" && typeof crypto.randomUUID === "function"
    ? crypto.randomUUID()
    : `${Date.now().toString(36)}-${Math.random().toString(36).slice(2)}`
}

export const tenantsApi = {
  listTenants: (pageNumber = 1, pageSize = 20) =>
    dotnetClient.get<PagedResponse<TenantListItem>>(`/tenants?pageNumber=${pageNumber}&pageSize=${pageSize}`),

  getTenantStatus: (id: string) => dotnetClient.get<TenantStatus>(`/tenants/${encodeURIComponent(id)}/status`),

  /**
   * One call for every tenant's current subscription (root only). Used by the tenant list so it
   * doesn't make one request per row; GetSubscriptionsQuery on the Billing module groups to the
   * latest subscription per tenant server-side.
   */
  listSubscriptions: () => dotnetClient.get<Subscription[]>("/billing/subscriptions/all"),

  /** Current subscription for a single tenant (admin can pass any tenantId). */
  getSubscription: (tenantId: string) =>
    dotnetClient.get<Subscription | null>(`/billing/subscriptions?tenantId=${encodeURIComponent(tenantId)}`),

  /** One page of a single tenant's invoices, newest first. */
  listInvoices: (tenantId: string, pageSize = 5, pageNumber = 1) =>
    dotnetClient.get<PagedResponse<Invoice>>(
      `/billing/invoices?tenantId=${encodeURIComponent(tenantId)}&pageNumber=${pageNumber}&pageSize=${pageSize}`,
    ),

  /** CreateTenantCommand: optional connectionString, issuer and planKey are sent as null (API defaults). */
  createTenant: (input: CreateTenantInput) =>
    dotnetClient.post<CreateTenantResult>(
      "/tenants",
      { id: input.id, name: input.name, adminEmail: input.adminEmail, adminPassword: input.adminPassword, connectionString: null, issuer: null, planKey: null },
      idempotencyKey(),
    ),

  // --- Billing plans -------------------------------------------------------

  listPlans: (includeInactive = false) =>
    dotnetClient.get<BillingPlan[]>(`/billing/plans?includeInactive=${includeInactive}`),

  createPlan: (input: CreatePlanInput) =>
    dotnetClient.post<string>("/billing/plans", input, idempotencyKey()),

  updatePlan: (planId: string, input: UpdatePlanInput) =>
    dotnetClient.put<string>(`/billing/plans/${encodeURIComponent(planId)}`, { ...input, planId }),

  // --- Invoices (admin, cross-tenant) --------------------------------------

  listInvoicesAdmin: (
    filters: { tenantId?: string; status?: Invoice["status"]; periodYear?: number; periodMonth?: number } = {},
    pageNumber = 1,
    pageSize = 20,
  ) => {
    const params = new URLSearchParams({ pageNumber: String(pageNumber), pageSize: String(pageSize) })
    if (filters.tenantId) params.set("tenantId", filters.tenantId)
    if (filters.status !== undefined) params.set("status", String(filters.status))
    if (filters.periodYear !== undefined) params.set("periodYear", String(filters.periodYear))
    if (filters.periodMonth !== undefined) params.set("periodMonth", String(filters.periodMonth))
    return dotnetClient.get<PagedResponse<Invoice>>(`/billing/invoices?${params.toString()}`)
  },

  issueInvoice: (invoiceId: string, dueAtUtc?: string | null) =>
    dotnetClient.post<string>(`/billing/invoices/${encodeURIComponent(invoiceId)}/issue`, { dueAtUtc: dueAtUtc ?? null }, idempotencyKey()),

  payInvoice: (invoiceId: string) =>
    dotnetClient.post<string>(`/billing/invoices/${encodeURIComponent(invoiceId)}/pay`, {}, idempotencyKey()),

  voidInvoice: (invoiceId: string, reason?: string | null) =>
    dotnetClient.post<string>(`/billing/invoices/${encodeURIComponent(invoiceId)}/void`, { reason: reason ?? null }, idempotencyKey()),

  generateInvoices: (periodYear: number, periodMonth: number) =>
    dotnetClient.post<{ generated: number }>("/billing/invoices/generate", { periodYear, periodMonth }, idempotencyKey()),

  /** Same-origin BFF path for a direct-navigation PDF download link (GET is CSRF-exempt). */
  invoicePdfUrl: (invoiceId: string) => `/api/dotnet/billing/invoices/${encodeURIComponent(invoiceId)}/pdf`,

  // --- Wallet top-ups -------------------------------------------------------

  listTopupRequests: (
    filters: { tenantId?: string; status?: TopupRequest["status"] } = {},
    pageNumber = 1,
    pageSize = 20,
  ) => {
    const params = new URLSearchParams({ pageNumber: String(pageNumber), pageSize: String(pageSize) })
    if (filters.tenantId) params.set("tenantId", filters.tenantId)
    if (filters.status) params.set("status", filters.status)
    return dotnetClient.get<PagedResponse<TopupRequest>>(`/billing/wallet/topup-requests?${params.toString()}`)
  },

  approveTopupRequest: (id: string, note?: string | null) =>
    dotnetClient.post<string>(`/billing/wallet/topup-requests/${encodeURIComponent(id)}/approve`, { note: note ?? null }, idempotencyKey()),

  rejectTopupRequest: (id: string, reason?: string | null) =>
    dotnetClient.post<string>(`/billing/wallet/topup-requests/${encodeURIComponent(id)}/reject`, { reason: reason ?? null }, idempotencyKey()),

  // --- Tenant lifecycle -------------------------------------------------------

  renewTenant: (tenantId: string, planKey?: string | null) =>
    dotnetClient.post<RenewTenantResult>(`/tenants/${encodeURIComponent(tenantId)}/renew`, { tenantId, planKey: planKey ?? null }, idempotencyKey()),

  adjustTenantValidity: (tenantId: string, validUpto: string) =>
    dotnetClient.post<AdjustTenantValidityResult>(
      `/tenants/${encodeURIComponent(tenantId)}/adjust-validity`,
      { tenantId, validUpto },
      idempotencyKey(),
    ),

  changeTenantActivation: (tenantId: string, isActive: boolean) =>
    dotnetClient.post<TenantLifecycleResult>(`/tenants/${encodeURIComponent(tenantId)}/activation`, { tenantId, isActive }),

  getTenantProvisioningStatus: (tenantId: string) =>
    dotnetClient.get<TenantProvisioningStatus>(`/tenants/${encodeURIComponent(tenantId)}/provisioning`),

  retryTenantProvisioning: (tenantId: string) =>
    dotnetClient.post<TenantProvisioningStatus>(`/tenants/${encodeURIComponent(tenantId)}/provisioning/retry`, {}),
}
