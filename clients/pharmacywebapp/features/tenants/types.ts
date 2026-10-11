/** Shapes from the .NET Multitenancy contracts (camelCase JSON). Connection strings are never read here. */

export interface PagedResponse<T> {
  items: T[]
  pageNumber: number
  pageSize: number
  totalCount: number
  totalPages: number
  hasNext: boolean
  hasPrevious: boolean
}

/** TenantDto from GET /api/v1/tenants. The API has no created date or status string; status is isActive. */
export interface TenantListItem {
  id: string
  name: string
  adminEmail: string
  isActive: boolean
  validUpto: string
  issuer?: string | null
  /** The tenant's plan key (e.g. "free", "pro"), stored on the tenant row itself. Null falls back to the default plan. */
  plan?: string | null
}

/** Mirrors Billing.Contracts SubscriptionStatus. */
export type SubscriptionStatus = "Active" | "Suspended" | "Cancelled"

/** SubscriptionDto from the .NET Billing module (GET /api/v1/billing/subscriptions[/all]). */
export interface Subscription {
  id: string
  tenantId: string
  planId: string
  planKey: string
  planName: string
  startUtc: string
  endUtc?: string | null
  status: SubscriptionStatus
}

/** Mirrors FSH.Framework.Shared.Quota.QuotaResource (serialized as its string name). */
export type QuotaResource = "ApiCalls" | "StorageBytes" | "Users" | "ActiveFeatureFlags"

export const QUOTA_RESOURCES: QuotaResource[] = ["ApiCalls", "StorageBytes", "Users", "ActiveFeatureFlags"]

/** BillingPlanDto from GET /api/v1/billing/plans. */
export interface BillingPlan {
  id: string
  key: string
  name: string
  currency: string
  monthlyBasePrice: number
  overageRates: Partial<Record<QuotaResource, number>>
  isActive: boolean
  interval: "Monthly" | "Yearly" | number
  annualPrice?: number | null
}

/** Body for POST /api/v1/billing/plans (CreatePlanCommand). */
export interface CreatePlanInput {
  key: string
  name: string
  currency: string
  monthlyBasePrice: number
  overageRates?: Partial<Record<QuotaResource, number>>
  interval: "Monthly" | "Yearly"
  annualPrice?: number | null
}

/** Body for PUT /api/v1/billing/plans/{planId} (UpdatePlanCommand). PlanId is injected by the route. */
export interface UpdatePlanInput {
  name: string
  monthlyBasePrice: number
  overageRates?: Partial<Record<QuotaResource, number>>
  interval: "Monthly" | "Yearly"
  annualPrice?: number | null
}

/** InvoiceDto from GET /api/v1/billing/invoices. Line items are omitted here — not needed by the summary table. */
export interface Invoice {
  id: string
  tenantId: string
  invoiceNumber: string
  periodYear: number
  periodMonth: number
  currency: string
  subtotalAmount: number
  status: "Draft" | "Issued" | "Paid" | "Void" | number
  createdAtUtc: string
  issuedAtUtc?: string | null
  dueAtUtc?: string | null
  paidAtUtc?: string | null
  voidedAtUtc?: string | null
  notes?: string | null
  purpose: "Usage" | "Subscription" | "Topup" | number
}

/** TopupRequestDto from GET /api/v1/billing/wallet/topup-requests. Status is already a string on the wire. */
export interface TopupRequest {
  id: string
  tenantId: string
  amount: number
  currency: string
  note?: string | null
  status: "Pending" | "Invoiced" | "Completed" | "Rejected" | "Cancelled" | string
  invoiceId?: string | null
  requestedBy?: string | null
  decisionNote?: string | null
  createdAtUtc: string
  decidedAtUtc?: string | null
  completedAtUtc?: string | null
}

/** TenantLifecycleResultDto — returned by activate/deactivate. */
export interface TenantLifecycleResult {
  tenantId: string
  isActive: boolean
  validUpto?: string | null
  message: string
}

/** RenewTenantCommandResponse. */
export interface RenewTenantResult {
  tenantId: string
  validUpto: string
  planKey: string
  planChanged: boolean
}

/** AdjustTenantValidityCommandResponse. */
export interface AdjustTenantValidityResult {
  tenantId: string
  validUpto: string
}

export interface TenantProvisioningStep {
  step: string
  status: string
  startedUtc?: string | null
  completedUtc?: string | null
  error?: string | null
}

/** TenantProvisioningStatusDto. */
export interface TenantProvisioningStatus {
  tenantId: string
  status: string
  correlationId: string
  currentStep?: string | null
  error?: string | null
  createdUtc: string
  startedUtc?: string | null
  completedUtc?: string | null
  steps: TenantProvisioningStep[]
}

/** TenantStatusDto from GET /api/v1/tenants/{id}/status. */
export interface TenantStatus {
  id: string
  name: string
  isActive: boolean
  validUpto: string
  adminEmail: string
  issuer?: string | null
  plan?: string | null
  expiryState: string
  graceEndsUtc: string
  hasConnectionString: boolean
}

export interface CreateTenantInput {
  id: string
  name: string
  adminEmail: string
  adminPassword: string
}

/** CreateTenantCommandResponse from POST /api/v1/tenants (201). */
export interface CreateTenantResult {
  id: string
  provisioningCorrelationId: string
  status: string
}
