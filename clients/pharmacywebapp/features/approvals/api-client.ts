/**
 * Manager approvals on the .NET Identity module: issue one (the approver re-enters their password) and read the
 * approvals log. HTTP only, through the BFF proxy.
 */

import { dotnetClient } from "@/lib/api/dotnet-client"
import type { DotnetPagedResponse } from "@/lib/api/reference-api"
import type { IssueApprovalBody } from "@/features/approvals/lib/approval"

export interface IssuedApproval {
  token: string
  approvalId: string
  expiresAtUtc: string
  approverName: string | null
}

export interface ApprovalLogEntry {
  id: string
  action: string
  amount: number
  targetRef: string | null
  reason: string | null
  requestedByUserId: string
  requestedByName: string | null
  approverUserId: string
  approverName: string | null
  approvedAtUtc: string
  expiresAtUtc: string
  usedAtUtc: string | null
  status: string
}

export interface ApprovalLogFilters {
  page?: number
  pageSize?: number
  action?: string
  from?: string
  to?: string
  search?: string
}

/** GET /identity/approvals query string; empty filters are left out. */
export function approvalsLogPath(filters: ApprovalLogFilters = {}): string {
  const params = new URLSearchParams()
  params.set("pageNumber", String(filters.page ?? 1))
  params.set("pageSize", String(filters.pageSize ?? 25))
  if (filters.action && filters.action !== "all") params.set("action", filters.action)
  if (filters.from) params.set("fromUtc", filters.from)
  if (filters.to) params.set("toUtc", filters.to)
  if (filters.search?.trim()) params.set("search", filters.search.trim())
  return `/api/v1/identity/approvals?${params}`
}

export const approvalsApi = {
  issue: (body: IssueApprovalBody): Promise<IssuedApproval> =>
    dotnetClient.post<IssuedApproval>("/api/v1/identity/approvals", body),
  log: (filters: ApprovalLogFilters = {}): Promise<DotnetPagedResponse<ApprovalLogEntry>> =>
    dotnetClient.get<DotnetPagedResponse<ApprovalLogEntry>>(approvalsLogPath(filters)),
}
