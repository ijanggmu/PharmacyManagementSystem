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
  return `/suppliers/expiry-claims?${params}`
}

const base = (id: string) => `/suppliers/expiry-claims/${encodeURIComponent(id)}`

export const expiryClaimsApi = {
  candidates: (withinDays: number) =>
    dotnetClient.get<ExpiryClaimCandidateGroup[]>(`/suppliers/expiry-claims/candidates?withinDays=${withinDays}`),
  list: (filters: ExpiryClaimListFilters = {}) => dotnetClient.get<DotnetPagedResponse<ExpiryClaim>>(expiryClaimsListPath(filters)),
  get: (id: string) => dotnetClient.get<ExpiryClaim>(base(id)),
  create: (input: { supplierId: string; lines: { batchId: string; quantity: number }[]; notes?: string | null }, idempotencyKey?: string) =>
    dotnetClient.post<string>("/suppliers/expiry-claims", input, idempotencyKey),
  changeStatus: (id: string, action: ExpiryClaimStatusAction, reason?: string | null, reference?: string | null) =>
    dotnetClient.post<string>(`${base(id)}/status`, { action, reason: reason ?? null, reference: reference ?? null }),
  accept: (id: string, input: AcceptExpiryClaimInput, idempotencyKey?: string) =>
    dotnetClient.post<string>(`${base(id)}/accept`, input, idempotencyKey),
}

export const expiryClaimKeys = {
  all: ["expiry-claims"] as const,
  candidates: (withinDays: number) => ["expiry-claims", "candidates", withinDays] as const,
  list: (filters: ExpiryClaimListFilters) => ["expiry-claims", "list", filters] as const,
  detail: (id: string) => ["expiry-claims", "detail", id] as const,
}
