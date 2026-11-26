/**
 * Expiry claims on the .NET Suppliers module (/suppliers/expiry-claims). HTTP only, through the BFF proxy.
 * Reading needs Suppliers.Returns.View; writes need Suppliers.Returns.Create (accepting raises a debit note).
 */

import { dotnetClient } from "@/lib/api/dotnet-client"
import type { DotnetPagedResponse } from "@/lib/api/stock-dotnet"
import type { ExpiryClaim, ExpiryClaimCandidateGroup, ExpiryClaimStatus } from "@/features/expiry-claims/lib/expiry-claim"

export interface ExpiryClaimListFilters {
  page?: number
  pageSize?: number
  status?: ExpiryClaimStatus | "all"
  supplierId?: string
  /** ViewAll users can narrow the list to one branch; undefined = every branch they may see. */
  branchId?: string
}

export interface AcceptExpiryClaimInput {
  lines: { lineId: string; acceptedQuantity: number }[]
  returnDateUtc: string
  supplierInvoiceNumber?: string | null
  reverseInputVat: boolean
}

export type ExpiryClaimStatusAction = "MarkSent" | "Reject" | "MarkCredited"

export function expiryClaimsListPath(filters: ExpiryClaimListFilters = {}): string {
  const params = new URLSearchParams()
  params.set("pageNumber", String(filters.page ?? 1))
  params.set("pageSize", String(filters.pageSize ?? 20))
  if (filters.status && filters.status !== "all") params.set("status", filters.status)
  if (filters.supplierId) params.set("supplierId", filters.supplierId)
  if (filters.branchId) params.set("branchId", filters.branchId)
  return `/suppliers/expiry-claims?${params}`
}

const base = (id: string) => `/suppliers/expiry-claims/${encodeURIComponent(id)}`

/**
 * Candidates, drafting and accepting work on ONE branch (the API's current branch: lots and the debit note are
 * that branch's stock). A ViewAll user who picked another branch sends it as X-Branch-Id, which the API validates.
 */
export function branchHeaders(branchId?: string | null): Record<string, string> | undefined {
  return branchId ? { "X-Branch-Id": branchId } : undefined
}

export const expiryClaimsApi = {
  candidates: (withinDays: number, branchId?: string) =>
    dotnetClient.get<ExpiryClaimCandidateGroup[]>(`/suppliers/expiry-claims/candidates?withinDays=${withinDays}`, branchHeaders(branchId)),
  list: (filters: ExpiryClaimListFilters = {}) => dotnetClient.get<DotnetPagedResponse<ExpiryClaim>>(expiryClaimsListPath(filters)),
  get: (id: string) => dotnetClient.get<ExpiryClaim>(base(id)),
  create: (
    input: { supplierId: string; lines: { batchId: string; quantity: number }[]; notes?: string | null },
    idempotencyKey?: string,
    branchId?: string,
  ) => dotnetClient.post<string>("/suppliers/expiry-claims", input, idempotencyKey, branchHeaders(branchId)),
  changeStatus: (id: string, action: ExpiryClaimStatusAction, reason?: string | null, reference?: string | null) =>
    dotnetClient.post<string>(`${base(id)}/status`, { action, reason: reason ?? null, reference: reference ?? null }),
  /** `branchId` = the claim's branch: the accepted units leave that branch's stock, so the API must act as it. */
  accept: (id: string, input: AcceptExpiryClaimInput, idempotencyKey?: string, branchId?: string | null) =>
    dotnetClient.post<string>(`${base(id)}/accept`, input, idempotencyKey, branchHeaders(branchId)),
}

export const expiryClaimKeys = {
  all: ["expiry-claims"] as const,
  candidates: (withinDays: number, branchId?: string) => ["expiry-claims", "candidates", withinDays, branchId ?? ""] as const,
  list: (filters: ExpiryClaimListFilters) => ["expiry-claims", "list", filters] as const,
  detail: (id: string) => ["expiry-claims", "detail", id] as const,
}
